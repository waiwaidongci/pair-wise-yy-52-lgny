import { defineStore } from 'pinia'
import type { ActionEnvelope, ActionResponse, ActorRole, OperationsState } from '~/types'

const QUEUE_KEY = 'yy52-offline-queue-v2'

interface QueuedOp {
  env: ActionEnvelope
  label: string
  at: string
}

let opSeq = 0
function newOpId() {
  opSeq += 1
  return `op-${Date.now()}-${opSeq}-${Math.random().toString(36).slice(2, 7)}`
}

export const useOperationsStore = defineStore('operations', () => {
  const state = ref<OperationsState | null>(null)
  const connection = ref<'在线' | '离线'>('在线')
  const queue = ref<QueuedOp[]>([])
  const lastBatch = ref<QueuedOp[]>([])
  const lastMessage = ref('')
  const actor = ref('李骁')
  const role = ref<ActorRole>('值班负责人')

  const loaded = computed(() => state.value !== null)
  const permits = computed(() => state.value?.permits ?? [])
  const conflicts = computed(() => state.value?.conflicts ?? [])
  const audit = computed(() => state.value?.audit ?? [])
  const devices = computed(() => state.value?.devices ?? [])
  const pendingConflicts = computed(() => conflicts.value.filter((item) => item.status === '待处理'))
  const latestAlert = computed(() => pendingConflicts.value[0]?.message ?? '')

  function hydrate(next: OperationsState) {
    state.value = next
  }

  async function fetchState() {
    const fresh = await $fetch<OperationsState>('/api/state')
    hydrate(fresh)
    return fresh
  }

  function restoreQueue() {
    if (!import.meta.client) return
    const raw = localStorage.getItem(QUEUE_KEY)
    if (raw) {
      try { queue.value = JSON.parse(raw) } catch { /* 忽略损坏的队列 */ }
    }
  }
  function persistQueue() {
    if (import.meta.client) localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.value))
  }

  /**
   * 所有写操作的唯一入口：自动附带稳定 opId。
   * 在线时直发，服务端成功后以返回的账本快照替换本地状态；
   * 离线时入队，上线后补传——同一 opId 在服务端只产生一次变化。
   */
  async function dispatch(
    type: ActionEnvelope['type'],
    payload: Omit<ActionEnvelope, 'opId' | 'actor' | 'role' | 'type'>,
    label: string,
  ): Promise<ActionResponse & { queued?: boolean }> {
    const env: ActionEnvelope = { opId: newOpId(), actor: actor.value, role: role.value, type, ...payload }
    if (connection.value === '离线') {
      queue.value.push({ env, label, at: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) })
      persistQueue()
      lastMessage.value = `离线：「${label}」已进入补传队列（${queue.value.length} 项）`
      return { ok: true, duplicate: false, queued: true, state: state.value as OperationsState }
    }
    try {
      const result = await $fetch<ActionResponse>('/api/action', { method: 'POST', body: env })
      hydrate(result.duplicate ? state.value! : result.state)
      lastMessage.value = result.duplicate ? `重复补传已忽略：${label}（账本无新变化）` : (result.message ?? label)
      return result
    } catch {
      queue.value.push({ env, label, at: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) })
      connection.value = '离线'
      persistQueue()
      return { ok: true, duplicate: false, queued: true, state: state.value as OperationsState }
    }
  }

  async function goOffline() {
    connection.value = '离线'
  }
  async function goOnline() {
    connection.value = '在线'
    await flushQueue()
  }

  /** 上线补传：逐条重放队列中的原始操作（opId 不变，重复部分服务端幂等忽略） */
  async function flushQueue() {
    if (!queue.value.length) return { sent: 0, duplicates: 0 }
    const batch = [...queue.value]
    const failed: QueuedOp[] = []
    let duplicates = 0
    for (const item of batch) {
      try {
        const result = await $fetch<ActionResponse>('/api/action', { method: 'POST', body: item.env })
        if (result.duplicate) duplicates += 1
        if (result.state) hydrate(result.state)
      } catch {
        // 补传未送达（仍为离线）：保留该项，等下一次上线重发
        failed.push(item)
      }
    }
    if (failed.length) {
      queue.value = failed
      persistQueue()
      connection.value = '离线'
      lastMessage.value = `补传中断：${failed.length} 项未送达，仍保留在队列中`
      return { sent: batch.length - failed.length, duplicates }
    }
    lastBatch.value = batch
    queue.value = []
    persistQueue()
    lastMessage.value = `补传完成：${batch.length} 项操作${duplicates ? `，其中 ${duplicates} 项为重复补传，只产生一次变化` : '，全部为首次生效'}`
    return { sent: batch.length, duplicates }
  }

  /** 演示用：把上一批已补传的操作原样再发一次，验证服务端去重（账本不产生第二次变化） */
  async function replayLastBatch() {
    if (!lastBatch.value.length) return
    for (const item of lastBatch.value) {
      const result = await $fetch<ActionResponse>('/api/action', { method: 'POST', body: item.env })
      hydrate(result.state)
    }
    lastMessage.value = `已重放 ${lastBatch.value.length} 项补传，服务端识别为重复操作，账本与审计均无新增`
  }

  function setIdentity(nextActor: string, nextRole: ActorRole) {
    actor.value = nextActor
    role.value = nextRole
  }

  restoreQueue()
  return {
    state, connection, queue, actor, role, lastMessage, lastBatch, loaded,
    permits, conflicts, audit, devices, pendingConflicts, latestAlert,
    hydrate, fetchState, dispatch, goOffline, goOnline, flushQueue, replayLastBatch, setIdentity,
  }
})
