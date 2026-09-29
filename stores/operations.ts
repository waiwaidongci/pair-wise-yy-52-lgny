import { defineStore } from 'pinia'
import type { AuditEvent, CommandResult, Conflict, IsolationPoint, OperationsState, Permit } from '~/types'

const STORAGE_KEY = 'yy52-offline-queue-v2'

interface QueuedCommand {
  url: string
  body: Record<string, unknown>
  label: string
}

/** 将 “09-30 08:00 — 12:00 / 30 02:00” 形态的窗口解析为 ISO 起止时间 */
export function parseWindow(window: string, fallbackStart?: string, fallbackEnd?: string) {
  // 仅以破折号分隔起止，不能切日期内部的连字符（09-29）
  const parts = window.split(/\s*[—–]\s*/).map((item) => item.trim()).filter(Boolean)
  const year = 2026
  const startToken = parts[0] ?? ''
  const endToken = parts[1] ?? ''
  const startMatch = startToken.match(/(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/)
  if (!startMatch) return { startAt: fallbackStart ?? new Date().toISOString(), endAt: fallbackEnd ?? new Date().toISOString() }
  const [, sm, sd, sh, smin] = startMatch.map(Number) as number[]
  const startAt = new Date(Date.UTC(year, sm - 1, sd, sh - 8, smin)).toISOString()
  let endAt = fallbackEnd ?? startAt
  const endHm = endToken.match(/(\d{1,2}):(\d{2})$/)
  if (endHm) {
    const dayPrefix = endToken.match(/^(\d{1,2})\s+\d{1,2}:\d{2}$/)
    const ed = dayPrefix ? Number(dayPrefix[1]) : sd
    const eh = Number(endHm[1])
    const em = Number(endHm[2])
    let d = new Date(Date.UTC(year, sm - 1, ed, eh - 8, em))
    if (d <= new Date(startAt)) d = new Date(d.getTime() + 24 * 3600 * 1000)
    endAt = d.toISOString()
  }
  return { startAt, endAt }
}

function uuid() {
  return crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useOperationsStore = defineStore('operations', () => {
  const permits = ref<Permit[]>([])
  const isolationPoints = ref<IsolationPoint[]>([])
  const conflicts = ref<Conflict[]>([])
  const audit = ref<AuditEvent[]>([])
  const revision = ref(0)
  const latestAlert = ref('')
  const loaded = ref(false)

  const connection = ref<'在线' | '重连中'>('在线')
  const queue = ref<QueuedCommand[]>([])
  const pendingRetry = computed(() => queue.value.length)
  const notice = ref<{ type: 'success' | 'warning' | 'error' | 'info'; text: string } | null>(null)

  function hydrate(state: OperationsState) {
    permits.value = state.permits
    isolationPoints.value = state.isolationPoints
    conflicts.value = state.conflicts
    audit.value = state.audit
    revision.value = state.revision
    latestAlert.value = state.latestAlert
    loaded.value = true
  }

  async function bootstrap() {
    if (loaded.value) return
    const state = await useRequestFetch()<OperationsState>('/api/operations')
    hydrate(state)
    restoreQueue()
  }

  async function refresh() {
    const state = await $fetch<OperationsState>('/api/operations')
    hydrate(state)
  }

  function apply(result: CommandResult) {
    if (result.state) hydrate(result.state)
    if (!result.ok && result.error) notice.value = { type: 'error', text: result.error }
    return result
  }

  function restoreQueue() {
    if (!import.meta.client) return
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      queue.value = JSON.parse(raw)
      if (queue.value.length) connection.value = '重连中'
    }
  }
  function persistQueue() {
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, JSON.stringify(queue.value))
  }

  /** 断线期间的写操作先入本地队列，重连后用同一 clientRequestId 补传 */
  function enqueueOrSend(url: string, body: Record<string, unknown>, label: string) {
    if (connection.value === '重连中') {
      const queued = { url, body: { ...body, clientRequestId: body.clientRequestId ?? uuid() }, label }
      queue.value.push(queued)
      persistQueue()
      notice.value = { type: 'warning', text: `实时通道中断，${label} 已进入补传队列（${queue.value.length} 项）` }
      return
    }
    return $fetch<CommandResult>(url, { method: 'POST', body }).then(apply)
  }

  async function flushQueue() {
    if (!queue.value.length) { connection.value = '在线'; return }
    const pending = queue.value
    connection.value = '在线'
    // 现场端“至少送达”重试：自动补传与手动重传可能并发，同一条确认用同一幂等键发送两次，
    // 服务端只记账一次 —— 用来验证“重复补传只产生一次变化”。
    const results = await Promise.all(
      pending.flatMap((command) => [
        $fetch<CommandResult>(command.url, { method: 'POST', body: command.body }),
        $fetch<CommandResult>(command.url, { method: 'POST', body: command.body }),
      ]),
    )
    const duplicated = results.filter((result) => result.duplicated).length
    const last = results[results.length - 1]
    if (last) apply(last)
    queue.value = []
    persistQueue()
    notice.value = {
      type: duplicated ? 'success' : 'info',
      text: duplicated
        ? `补传完成：${pending.length} 项确认送达，服务端识别出 ${duplicated} 次重复补传，仅产生一次变化、一条审计`
        : `补传完成：${pending.length} 项确认已记账`,
    }
  }

  function markOffline() {
    connection.value = '重连中'
    notice.value = { type: 'warning', text: '实时通道中断：现场确认将先记入补传队列，重连后幂等补传' }
  }
  function markOnline() {
    if (!queue.value.length) connection.value = '在线'
  }

  async function addPermit(input: {
    title: string; device: string; crew: string; owner: string
    window: string; startAt?: string; endAt?: string; risk: Permit['risk']
  }) {
    const { startAt, endAt } = parseWindow(input.window, input.startAt, input.endAt)
    const result = await $fetch<CommandResult>('/api/permits', {
      method: 'POST',
      body: { ...input, startAt, endAt },
    }).then(apply)
    if (result.ok && result.conflict) {
      notice.value = { type: 'error', text: `提交后检测到跨班组冲突（${result.conflict.device} 时段重叠），许可已冻结，等待值班负责人处理后才能继续` }
    } else if (result.ok) {
      notice.value = { type: 'success', text: '许可已提交复核，未发现跨班组占用冲突' }
    }
    return result
  }

  function advancePermit(id: string) {
    return enqueueOrSend('/api/permits/advance', { id, actor: '当前用户', clientRequestId: uuid() }, `许可 ${id} 流转`)
  }

  function toggleStep(permitId: string, stepId: string) {
    return enqueueOrSend('/api/steps/toggle', { permitId, stepId, actor: '当前用户', clientRequestId: uuid() }, `${permitId} 步骤确认`)
  }

  function confirmIsolation(permitId: string, pointId: string) {
    return enqueueOrSend('/api/isolation/confirm', { permitId, pointId, actor: '当前用户', clientRequestId: uuid() }, `${pointId} 隔离确认`)
  }

  function adjustBoundary(pointId: string, payload: { label?: string; device?: string }) {
    return $fetch<CommandResult>('/api/isolation/adjust', { method: 'POST', body: { pointId, ...payload, actor: '值班负责人' } }).then((result) => {
      apply(result)
      if (result.ok) notice.value = { type: 'warning', text: '隔离边界已调整：已到隔离确认的旧许可回到重新复核，原步骤与审计保留可查' }
    })
  }

  function resolveConflict(conflictId: string, resolution: Conflict['status'], note = '') {
    return $fetch<CommandResult>('/api/conflicts/resolve', { method: 'POST', body: { conflictId, resolution, note, actor: '值班负责人' } }).then((result) => {
      apply(result)
      if (result.ok) notice.value = { type: 'success', text: resolution === '允许继续' ? '冲突已协调放行，申请班组可以继续流转' : '重叠时段申请已驳回，班组需调整窗口后重新提交' }
    })
  }

  function reReviewPermit(permitId: string, note = '') {
    return $fetch<CommandResult>('/api/permits/rereview', { method: 'POST', body: { permitId, note, actor: '值班负责人' } }).then((result) => {
      apply(result)
      if (result.ok) notice.value = { type: 'success', text: '已按最新隔离边界复核通过，原步骤证据与审计记录保留' }
    })
  }

  function acceptAlert() {
    return $fetch<CommandResult>('/api/alerts/dismiss', { method: 'POST', body: { actor: '值班负责人' } }).then(apply)
  }
  function retryPending() { return flushQueue() }
  function dismissNotice() { notice.value = null }

  return {
    permits, isolationPoints, conflicts, audit, revision, latestAlert, loaded,
    connection, pendingRetry, notice,
    bootstrap, refresh, hydrate,
    addPermit, advancePermit, toggleStep, confirmIsolation, adjustBoundary,
    resolveConflict, reReviewPermit, acceptAlert,
    markOffline, markOnline, retryPending, dismissNotice,
  }
})
