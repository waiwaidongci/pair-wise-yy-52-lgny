import type { ActionEnvelope, ActionResponse, Conflict, IsolationPoint, OperationsState, Permit, PermitSnapshot } from '~/types'
import { buildSeedState } from './seed'

/** 已生效、会对设备形成占用的许可状态（待执行起到关闭前） */
const EFFECTIVE_STATUSES: Permit['status'][] = ['待执行', '执行中', '待结束', '待关闭']
/** 已完成隔离确认（隔离已到位）的状态，边界调整后这些许可必须重新复核 */
const ISOLATION_CONFIRMED: Permit['status'][] = ['执行中', '待结束', '待关闭']
const STATUS_FLOW: Record<Permit['status'], Permit['status']> = {
  待复核: '待执行',
  待执行: '执行中',
  执行中: '待结束',
  待结束: '待关闭',
  待关闭: '已完成',
  已完成: '已完成',
}

interface OpRecord {
  ok: boolean
  message?: string
  hits: number
}

export interface LedgerStore {
  state: OperationsState
  /** opId → 首次执行结果；同一 opId 重复补传只命中记录，不再产生业务变化 */
  opLog: Map<string, OpRecord>
  seq: { permit: number; conflict: number; audit: number; point: number }
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function nowParts() {
  // 统一以风电场所在时区（北京时间）记账
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const value: Record<string, number> = {}
  for (const part of fmt.formatToParts(new Date())) {
    if (part.type !== 'literal') value[part.type] = Number(part.value)
  }
  return value
}

function stampNow() {
  const p = nowParts()
  return {
    iso: `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:00+08:00`,
    hm: `${pad2(p.hour)}:${pad2(p.minute)}`,
    mdhm: `${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`,
    compactDate: `${String(p.year).slice(2)}${pad2(p.month)}${pad2(p.day)}`,
  }
}

/** 由绝对时间键生成展示文本，如 09-29 18:00 — 30 02:00 */
export function formatWindow(startKey: string, endKey: string) {
  const fmt = (key: string, withMonth: boolean) => {
    const [date = '', time = ''] = key.split('T')
    const [, m = '01', d = '01'] = date.split('-')
    return `${withMonth ? `${m}-` : ''}${d} ${time}`
  }
  const [sd = '', ed = ''] = [startKey, endKey].map((k) => k.split('T')[0] ?? '')
  const sameMonth = sd.slice(0, 7) === ed.slice(0, 7)
  const sameDay = sd === ed
  const endLabel = sameDay ? endKey.split('T')[1] : fmt(endKey, !sameMonth)
  return `${fmt(startKey, true)} — ${endLabel}`
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  // 同格式 YYYY-MM-DDTHH:MM，按字符串比较即按时间比较；端点相接不算占用冲突
  return aStart < bEnd && bStart < aEnd
}

function maxSuffix(items: { id: string }[], prefix: string) {
  return items.reduce((max, item) => {
    const tail = Number(item.id.replace(prefix, ''))
    return Number.isFinite(tail) ? Math.max(max, tail) : max
  }, 0)
}

function createStore(): LedgerStore {
  const state = buildSeedState()
  return {
    state,
    opLog: new Map(),
    seq: {
      permit: maxSuffix(state.permits, 'WP-'),
      conflict: maxSuffix(state.conflicts, 'CF-'),
      audit: maxSuffix(state.audit, 'AE-'),
      point: 600,
    },
  }
}

declare global {
  var __windFarmLedger: LedgerStore | undefined
}

export function useLedger(): LedgerStore {
  if (!globalThis.__windFarmLedger) globalThis.__windFarmLedger = createStore()
  return globalThis.__windFarmLedger
}

/** 对外快照：审计/许可/冲突/隔离点全部来自同一份服务端数据 */
export function snapshot(store: LedgerStore): OperationsState {
  store.state.serverTime = stampNow().iso
  let dedupHits = 0
  store.opLog.forEach((record) => { dedupHits += record.hits })
  store.state.dedupHits = dedupHits
  return structuredClone(store.state)
}

function addAudit(store: LedgerStore, event: { actor: string; action: string; target: string; detail: string; permitId?: string; opId?: string }) {
  const id = `AE-${++store.seq.audit}`
  store.state.audit.unshift({ id, time: stampNow().hm, ...event })
}

function archiveSnapshot(permit: Permit, reason: string): PermitSnapshot {
  const snap: PermitSnapshot = {
    revision: permit.revision,
    at: stampNow().mdhm,
    reason,
    status: permit.status,
    windowLabel: permit.window,
    isolationPoints: structuredClone(permit.isolationPoints),
    steps: structuredClone(permit.steps),
  }
  permit.history.unshift(snap)
  return snap
}

function findConflicts(permit: Permit, all: Permit[]) {
  const result: { holder: Permit; codes: string[] }[] = []
  for (const holder of all) {
    if (holder.id === permit.id || !EFFECTIVE_STATUSES.includes(holder.status)) continue
    if (!overlaps(permit.windowStart, permit.windowEnd, holder.windowStart, holder.windowEnd)) continue
    // 值班负责人已明确放行与该占用方的重叠作业，则不再视为冲突
    if (permit.overlapAllowedWith?.includes(holder.id)) continue
    const codes = permit.deviceCodes.filter((code) => holder.deviceCodes.includes(code))
    if (codes.length) result.push({ holder, codes })
  }
  return result
}

function registerConflicts(store: LedgerStore, permit: Permit, hits: { holder: Permit; codes: string[] }[], env: ActionEnvelope) {
  for (const hit of hits) {
    const id = `CF-${String(++store.seq.conflict).padStart(3, '0')}`
    const conflict: Conflict = {
      id,
      status: '待处理',
      device: hit.codes.join(' / '),
      permitId: permit.id,
      permitTitle: permit.title,
      crew: permit.crew,
      holderPermitId: hit.holder.id,
      holderTitle: hit.holder.title,
      holderCrew: hit.holder.crew,
      overlapLabel: `${permit.window} 与已生效窗口 ${hit.holder.window} 重叠`,
      message: `设备 ${hit.codes.join(' / ')} 已被 ${hit.holder.crew}的有效许可 ${hit.holder.id} 占用，${permit.crew}的重叠申请挂起，等待值班负责人裁决。`,
      createdAt: stampNow().mdhm,
    }
    store.state.conflicts.unshift(conflict)
    permit.holdConflictIds.push(id)
    addAudit(store, {
      actor: '系统',
      action: '冲突登记',
      target: `${id} · ${conflict.device}`,
      detail: `${permit.crew} ${permit.id} 与 ${hit.holder.crew} ${hit.holder.id} 在 ${hit.codes.join(' / ')} 上时间窗重叠，已挂起待值班负责人处理`,
      permitId: permit.id,
      opId: env.opId,
    })
  }
  if (hits.length) {
    permit.reviewRequired = true
    const ids = permit.holdConflictIds.join('、')
    permit.reviewReason = `跨班组冲突待值班负责人处理（${ids}）`
  }
}

function requireDispatcher(env: ActionEnvelope): string | undefined {
  if (env.role !== '值班负责人') return '该操作仅值班负责人可执行'
}

function dispatchInternal(store: LedgerStore, env: ActionEnvelope): { ok: boolean; message?: string } {
  const { state } = store
  const bump = () => { state.revision += 1 }
  const permitById = (id: string) => state.permits.find((item) => item.id === id)

  switch (env.type) {
    case 'submit-permit': {
      const { title, device, deviceCodes, crew, owner, windowStart, windowEnd, risk } = env as unknown as {
        title: string; device: string; deviceCodes: string[]; crew: string; owner: string
        windowStart: string; windowEnd: string; risk: Permit['risk']
      }
      if (!title?.trim() || !device?.trim() || !Array.isArray(deviceCodes) || !deviceCodes.length) return { ok: false, message: '作业名称与占用设备不能为空' }
      if (!(windowStart < windowEnd)) return { ok: false, message: '计划窗口的开始时间必须早于结束时间' }
      const id = `WP-${stampNow().compactDate}-${String(++store.seq.permit).padStart(3, '0')}`
      const permit: Permit = {
        id, title: title.trim(), device: device.trim(), deviceCodes: [...new Set(deviceCodes)],
        crew, owner, windowStart, windowEnd, window: formatWindow(windowStart, windowEnd),
        status: '待复核', risk, revision: 1, reviewRequired: false, holdConflictIds: [], overlapAllowedWith: [],
        createdAt: stampNow().mdhm,
        isolationPoints: deviceCodes.map((code, index) => ({
          id: `IP-${store.seq.point + index}`, device: code,
          label: index === 0 ? '主隔离点' : `共用边界 ${code}`, type: '开关' as const, state: '待操作' as const,
        })),
        steps: [
          { id: 'ST-N1', text: '核对设备双重编号与工作范围', done: false, owner },
          { id: 'ST-N2', text: '完成隔离、锁定、验电和接地', done: false, owner },
        ],
        history: [],
      }
      store.seq.point += deviceCodes.length
      state.permits.unshift(permit)
      addAudit(store, { actor: owner, action: '新建许可', target: id, detail: `${title}（${permit.device}，${permit.window}，${risk}风险）`, permitId: id, opId: env.opId })
      const hits = findConflicts(permit, state.permits)
      registerConflicts(store, permit, hits, env)
      bump()
      return hits.length
        ? { ok: true, message: `提交成功，但检测到与 ${hits.length} 个已生效许可跨班组占用冲突，已挂起等待值班负责人处理` }
        : { ok: true, message: '提交成功，已进入安全复核' }
    }

    case 'advance-permit': {
      const permit = permitById(String(env.permitId ?? ''))
      if (!permit) return { ok: false, message: '许可不存在' }
      if (permit.status === '已完成') return { ok: false, message: '该许可已关闭' }
      if (permit.reviewRequired) return { ok: false, message: permit.reviewReason ? `许可被挂起：${permit.reviewReason}` : '许可待复核，暂不能推进' }
      // 推进前再次统一检查设备占用（防止提交后又有新许可生效）
      const hits = findConflicts(permit, state.permits)
      if (hits.length) {
        registerConflicts(store, permit, hits, env)
        bump()
        return { ok: false, message: '推进前复查发现跨班组占用冲突，已登记并挂起，等待值班负责人处理' }
      }
      const from = permit.status
      // 待执行 → 执行中 即“隔离确认”，要求所有隔离点到位
      if (from === '待执行') {
        const pending = permit.isolationPoints.filter((point) => point.state !== '已隔离')
        if (pending.length) return { ok: false, message: `隔离确认未通过：${pending.map((p) => p.label).join('、')} 尚未隔离` }
      }
      const to = STATUS_FLOW[from]
      permit.status = to
      permit.revision += 1
      bump()
      addAudit(store, {
        actor: env.actor,
        action: from === '待执行' ? '隔离确认' : '流程推进',
        target: permit.id,
        detail: from === '待执行'
          ? `${permit.isolationPoints.length} 处隔离点全部到位，状态由“${from}”变更为“${to}”`
          : `状态由“${from}”变更为“${to}”（r${permit.revision}）`,
        permitId: permit.id,
        opId: env.opId,
      })
      return { ok: true, message: `已推进至“${to}”` }
    }

    case 'toggle-step': {
      const permit = permitById(String(env.permitId ?? ''))
      const step = permit?.steps.find((item) => item.id === env.stepId)
      if (!permit || !step) return { ok: false, message: '步骤不存在' }
      if (permit.reviewRequired) return { ok: false, message: '许可处于挂起复核状态，现场步骤暂停记录' }
      step.done = !step.done
      if (!step.done) step.evidence = undefined
      bump()
      addAudit(store, {
        actor: env.actor,
        action: step.done ? '完成步骤' : '撤销步骤',
        target: `${permit.id} / ${step.id}`,
        detail: `${step.text}${step.done ? '（现场确认已记录）' : '（确认已撤销）'}`,
        permitId: permit.id,
        opId: env.opId,
      })
      return { ok: true, message: step.done ? '步骤完成已记账一次' : '步骤已撤销' }
    }

    case 'set-point-state': {
      const permit = permitById(String(env.permitId ?? ''))
      const point = permit?.isolationPoints.find((item) => item.id === env.pointId)
      if (!permit || !point) return { ok: false, message: '隔离点不存在' }
      if (permit.reviewRequired) return { ok: false, message: '许可处于挂起复核状态，隔离操作暂停' }
      const next = String(env.state ?? '') as IsolationPoint['state']
      if (!['已隔离', '待操作', '已恢复'].includes(next)) return { ok: false, message: '隔离点状态不合法' }
      if (point.state === next) return { ok: false, message: '隔离点状态未变化' }
      const before = point.state
      point.state = next
      bump()
      addAudit(store, { actor: env.actor, action: '隔离操作', target: `${permit.id} / ${point.id}`, detail: `${point.device} ${point.label}：${before} → ${next}`, permitId: permit.id, opId: env.opId })
      return { ok: true, message: `${point.label}已记为“${next}”` }
    }

    case 'resolve-conflict': {
      const guard = requireDispatcher(env)
      if (guard) return { ok: false, message: guard }
      const conflict = state.conflicts.find((item) => item.id === String(env.conflictId ?? ''))
      if (!conflict) return { ok: false, message: '冲突记录不存在' }
      if (conflict.status !== '待处理') return { ok: false, message: `冲突 ${conflict.id} 已处理（${conflict.status}）` }
      const note = String(env.note ?? '').trim()
      const now = stampNow().mdhm
      if (env.decision === '放行') {
        conflict.status = '已放行'
        conflict.resolvedAt = now
        conflict.resolvedBy = `值班负责人 · ${env.actor}`
        conflict.resolutionNote = note || '值班负责人确认先后顺序与交接条件，允许继续'
      } else if (env.decision === '改期') {
        conflict.status = '待改期'
        conflict.resolvedAt = now
        conflict.resolvedBy = `值班负责人 · ${env.actor}`
        conflict.resolutionNote = note || '不允许同时开工，要求申请班组调整作业窗口后重新提交'
      } else {
        return { ok: false, message: '裁决类型不合法' }
      }
      const permit = permitById(conflict.permitId)
      if (permit && env.decision === '放行') {
        permit.holdConflictIds = permit.holdConflictIds.filter((id) => id !== conflict.id)
        if (!permit.overlapAllowedWith.includes(conflict.holderPermitId)) permit.overlapAllowedWith.push(conflict.holderPermitId)
        if (!permit.holdConflictIds.length) {
          permit.reviewRequired = false
          permit.reviewReason = undefined
        }
      }
      bump()
      addAudit(store, {
        actor: `值班负责人 · ${env.actor}`,
        action: env.decision === '放行' ? '冲突放行' : '冲突要求改期',
        target: `${conflict.id} · ${conflict.device}`,
        detail: env.decision === '放行'
          ? `同意 ${conflict.crew} ${conflict.permitId} 在落实交接条件后继续；${note || '按先后顺序开工'}`
          : `驳回重叠窗口，要求 ${conflict.crew} ${conflict.permitId} 改期后重报；${note || ''}`,
        permitId: conflict.permitId,
        opId: env.opId,
      })
      return { ok: true, message: env.decision === '放行' ? '已放行，申请班组可继续推进许可' : '已要求申请班组改期' }
    }

    case 'reschedule-permit': {
      const permit = permitById(String(env.permitId ?? ''))
      if (!permit) return { ok: false, message: '许可不存在' }
      const { windowStart, windowEnd } = env as unknown as { windowStart: string; windowEnd: string }
      if (!(windowStart < windowEnd)) return { ok: false, message: '新窗口的开始时间必须早于结束时间' }
      const waits = state.conflicts.filter((c) => c.permitId === permit.id && c.status === '待改期')
      if (!waits.length) return { ok: false, message: '该许可没有待改期裁决，无需改期重报' }
      // 改期后重新做占用检查（先用候选时间试算，未通过则保持原样）
      const candidate: Permit = { ...permit, windowStart, windowEnd }
      const hits = findConflicts(candidate, state.permits)
      if (hits.length) return { ok: false, message: '新窗口仍与已生效许可重叠，请重新选择时间' }
      const oldWindow = permit.window
      permit.windowStart = windowStart
      permit.windowEnd = windowEnd
      permit.window = formatWindow(windowStart, windowEnd)
      archiveSnapshot(permit, `作业窗口改期：${oldWindow} → ${permit.window}`)
      permit.revision += 1
      for (const conflict of waits) {
        conflict.status = '已改期'
        conflict.resolutionNote = `${conflict.resolutionNote ?? ''}；申请班组已改期为 ${permit.window}`.trim()
      }
      permit.holdConflictIds = permit.holdConflictIds.filter((id) => !waits.some((c) => c.id === id))
      permit.overlapAllowedWith = []
      permit.reviewRequired = false
      permit.reviewReason = undefined
      bump()
      addAudit(store, { actor: env.actor, action: '作业改期', target: permit.id, detail: `${oldWindow} → ${permit.window}（r${permit.revision}），占用复查通过，重新进入安全复核`, permitId: permit.id, opId: env.opId })
      return { ok: true, message: '改期成功，占用复查通过，许可重新进入复核' }
    }

    case 'adjust-boundary': {
      const permit = permitById(String(env.permitId ?? ''))
      if (!permit) return { ok: false, message: '许可不存在' }
      if (permit.status === '已完成') return { ok: false, message: '已关闭许可不能调整隔离边界' }
      const op = String(env.op ?? '')
      const oldRevision = permit.revision
      archiveSnapshot(permit, op === 'remove' ? `隔离边界调整（移除隔离点 ${env.pointId}）` : '隔离边界调整（新增隔离点）')
      let affectedCode = ''
      let detail = ''
      if (op === 'remove') {
        const index = permit.isolationPoints.findIndex((item) => item.id === env.pointId)
        if (index < 0) return { ok: false, message: '隔离点不存在' }
        const [removed] = permit.isolationPoints.splice(index, 1)
        affectedCode = removed.device
        detail = `移除 ${removed.device} ${removed.label}（${removed.id}）`
      } else if (op === 'add') {
        const { device, label, pointType } = env as unknown as { device: string; label: string; pointType?: IsolationPoint['type'] }
        if (!device?.trim() || !label?.trim()) return { ok: false, message: '新隔离点的设备与名称不能为空' }
        const point: IsolationPoint = { id: `IP-${++store.seq.point}`, device: device.trim(), label: label.trim(), type: pointType ?? '开关', state: '待操作' }
        permit.isolationPoints.push(point)
        if (!permit.deviceCodes.includes(point.device)) permit.deviceCodes.push(point.device)
        affectedCode = point.device
        detail = `新增 ${point.device} ${point.label}（${point.id}，待操作）`
      } else {
        return { ok: false, message: '边界调整类型不合法' }
      }
      permit.revision += 1
      bump()
      addAudit(store, { actor: env.actor, action: '边界调整', target: `${permit.id} · r${oldRevision} → r${permit.revision}`, detail: `${detail}；调整前的步骤与隔离点已归档，可在修订历史中查看`, permitId: permit.id, opId: env.opId })

      // 边界调整联动：所有已到隔离确认、共用该设备边界的许可（含被调整许可自身）回退复核
      const ripple = state.permits.filter((other) =>
        ISOLATION_CONFIRMED.includes(other.status)
        && other.deviceCodes.includes(affectedCode)
        && (other.id === permit.id || other.isolationPoints.some((p) => p.device === affectedCode)),
      )
      for (const target of ripple) {
        if (target.reviewRequired) continue
        target.reviewRequired = true
        target.reviewReason = `${permit.id === target.id ? '本许可' : permit.id} 隔离边界发生变化（${affectedCode}），已到隔离确认，须由值班负责人重新复核`
        bump()
        addAudit(store, { actor: '系统', action: '触发复核', target: target.id, detail: `隔离边界变化涉及 ${affectedCode}，${target.crew}该许可已完成隔离确认，回退至待复核，原步骤与审计保留可查`, permitId: target.id, opId: env.opId })
      }
      return {
        ok: true,
        message: ripple.length
          ? `边界已调整至 r${permit.revision}；${ripple.map((p) => p.id).join('、')} 已到隔离确认，须重新复核`
          : `边界已调整至 r${permit.revision}`,
      }
    }

    case 'recheck-permit': {
      const guard = requireDispatcher(env)
      if (guard) return { ok: false, message: guard }
      const permit = permitById(String(env.permitId ?? ''))
      if (!permit) return { ok: false, message: '许可不存在' }
      if (!permit.reviewRequired) return { ok: false, message: '该许可当前不处于待复核状态' }
      const pendingConflicts = state.conflicts.filter((c) => c.permitId === permit.id && (c.status === '待处理' || c.status === '待改期'))
      if (pendingConflicts.length) return { ok: false, message: `仍有未决冲突 ${pendingConflicts.map((c) => c.id).join('、')}，请先在冲突台账中裁决` }
      const reason = permit.reviewReason ?? '值班负责人重新复核'
      permit.reviewRequired = false
      permit.reviewReason = undefined
      bump()
      addAudit(store, { actor: `值班负责人 · ${env.actor}`, action: '复核通过', target: permit.id, detail: `${reason}；复核通过，许可可继续流转（保留原步骤与历史修订）`, permitId: permit.id, opId: env.opId })
      return { ok: true, message: '复核通过，许可解除挂起' }
    }

    default:
      return { ok: false, message: '未知操作类型' }
  }
}

/** 统一写入口：同一 opId 的重复补传只回放首次结果，不再产生第二次变化/审计 */
export function dispatch(store: LedgerStore, env: ActionEnvelope): ActionResponse {
  if (!env?.opId) return { ok: false, duplicate: false, message: '缺少操作编号 opId', state: snapshot(store) }
  const seen = store.opLog.get(env.opId)
  if (seen) {
    seen.hits += 1
    return { ok: seen.ok, duplicate: true, message: seen.message ?? '重复补传已忽略，未产生新的变化', state: snapshot(store) }
  }
  const result = dispatchInternal(store, env)
  if (result.ok) store.opLog.set(env.opId, { ok: true, message: result.message, hits: 0 })
  return { ok: result.ok, duplicate: false, message: result.message, state: snapshot(store) }
}
