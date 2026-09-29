import type { AuditEvent, Conflict, IsolationPoint, Permit } from '~/types'

/**
 * 服务端统一记账：许可流转、隔离点台账、跨班组冲突、审计留痕
 * 全部保存在同一份 Nitro 单例状态中，所有班组看到的占用与冲突一致。
 */

interface ServerState {
  permits: Permit[]
  isolationPoints: IsolationPoint[]
  conflicts: Conflict[]
  audit: AuditEvent[]
  revision: number
  latestAlert: string
  /** 已处理过的补传请求（幂等键 -> 已落账的审计事件 id） */
  processedRequests: Map<string, string>
}

const now = () => new Date()
// 统一以 UTC 存储时间，入参为北京时间小时（演示数据口径：2026-09-29，UTC+8）
const today = (h: number, m = 0) => {
  const d = new Date(Date.UTC(2026, 8, 29, h - 8, m))
  return d.toISOString()
}
const tomorrow = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 30, h - 8, m)).toISOString()
const clock = () => now().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

let seq = 100
const nextId = (prefix: string) => `${prefix}-${++seq}`

function snapshotHistory(permit: Permit, action: string, detail: string, actor: string): Permit['history'][number] {
  return {
    id: nextId('HS'),
    time: clock(),
    action,
    detail,
    actor,
    revision: permit.revision,
    steps: structuredClone(permit.steps),
    isolationPoints: structuredClone(permit.isolationPoints),
  }
}

function seed(): ServerState {
  const p018: Permit = {
    id: 'WP-260929-018', title: '3 号风机齿轮箱更换', device: 'WTG-03 · 箱变 03', crew: '机务二班', owner: '李骁',
    window: '09-29 14:00 — 22:00', startAt: today(14), endAt: today(22),
    status: '执行中', risk: '一级', revision: 4, reviewRequired: false, blockedByConflict: false,
    requestedPointIds: ['IP-301', 'IP-302', 'IP-303'],
    isolationPoints: [
      { id: 'IP-301', device: 'WTG-03', label: '塔基 690V 主开关', type: '开关', state: '已隔离', boundaryRevision: 1, confirmedBy: 'WP-260929-018' },
      { id: 'IP-302', device: 'BOX-03', label: '箱变低压侧刀闸', type: '刀闸', state: '已隔离', boundaryRevision: 1, confirmedBy: 'WP-260929-018' },
      { id: 'IP-303', device: 'WTG-03', label: '叶轮机械锁', type: '阀门', state: '已隔离', boundaryRevision: 1, confirmedBy: 'WP-260929-018' },
    ],
    steps: [
      { id: 'ST-01', text: '核对工作票、设备双重编号与现场标识', done: true, owner: '周野', evidence: '现场照片 2 张', boundaryRevision: 1 },
      { id: 'ST-02', text: '断开 690V 主开关并执行机械锁定', done: true, owner: '周野', evidence: '锁具编号 LK-2107', boundaryRevision: 1 },
      { id: 'ST-03', text: '验电、放电并装设接地线', done: false, owner: '何岚' },
      { id: 'ST-04', text: '全体作业人员确认隔离边界', done: false, owner: '李骁' },
    ],
    history: [],
  }
  const p021: Permit = {
    id: 'WP-260929-021', title: '2 号集电线路绝缘子更换', device: 'LINE-A2 · 杆塔 17–23', crew: '线路一班', owner: '何岚',
    window: '09-29 18:00 — 30 02:00', startAt: today(18), endAt: today(26),
    status: '待复核', risk: '一级', revision: 2, reviewRequired: true, blockedByConflict: false,
    requestedPointIds: ['IP-411', 'IP-412', 'IP-413'],
    isolationPoints: [
      { id: 'IP-411', device: 'LINE-A2', label: 'A2 进线断路器', type: '开关', state: '待操作', boundaryRevision: 2 },
      { id: 'IP-412', device: 'LINE-A2', label: '17 号杆接地刀闸', type: '接地', state: '待操作', boundaryRevision: 1 },
      { id: 'IP-413', device: 'BUS-A', label: '母线侧隔离刀闸', type: '刀闸', state: '已隔离', boundaryRevision: 1, confirmedBy: 'WP-260929-021' },
    ],
    steps: [
      { id: 'ST-11', text: '核对线路双重名称与停电范围', done: true, owner: '何岚', boundaryRevision: 1 },
      { id: 'ST-12', text: '断开 A2 进线并完成五防校验', done: false, owner: '孙禾' },
      { id: 'ST-13', text: '17、23 号杆验电并装设接地线', done: false, owner: '谭勇' },
    ],
    history: [],
  }
  const p004: Permit = {
    id: 'WP-260930-004', title: '箱变 12 温控器更换', device: 'BOX-12', crew: '电气一班', owner: '孙禾',
    window: '09-30 08:00 — 12:00',
    startAt: tomorrow(8),
    endAt: tomorrow(12),
    status: '待执行', risk: '二级', revision: 1, reviewRequired: false, blockedByConflict: false,
    requestedPointIds: ['IP-501'],
    isolationPoints: [
      { id: 'IP-501', device: 'BOX-12', label: '高压负荷开关', type: '开关', state: '待操作', boundaryRevision: 1 },
    ],
    steps: [
      { id: 'ST-21', text: '核对箱变编号和低压侧负荷转移', done: true, owner: '孙禾', boundaryRevision: 1 },
      { id: 'ST-22', text: '断开高压负荷开关并锁定', done: false, owner: '孙禾' },
    ],
    history: [],
  }

  const permits = [p018, p021, p004]
  for (const permit of permits) permit.history.push(snapshotHistory(permit, '初始版本', `许可创建，修订 r${permit.revision}`, permit.owner))

  const isolationPoints: IsolationPoint[] = [
    ...structuredClone(p018.isolationPoints),
    ...structuredClone(p021.isolationPoints),
    ...structuredClone(p004.isolationPoints),
  ]

  const audit: AuditEvent[] = [
    { id: 'AE-901', time: '16:42:05', actor: '李骁', action: '完成步骤', target: 'WP-260929-018 / ST-02', detail: '上传机械锁具编号 LK-2107', permitId: 'WP-260929-018' },
    { id: 'AE-902', time: '16:18:30', actor: '系统', action: '冲突预警', target: 'LINE-A2', detail: '检测到线路一班与电气二班在 18:00–20:00 重叠作业' },
    { id: 'AE-903', time: '15:56:12', actor: '赵清', action: '复核通过', target: 'WP-260929-014', detail: '同意执行，要求每 2 小时回报风速' },
  ]

  return {
    permits,
    isolationPoints,
    conflicts: [],
    audit,
    revision: 12,
    latestAlert: '18:00–20:00 LINE-A2 存在跨班组重叠作业',
    processedRequests: new Map(),
  }
}

const globalRef = globalThis as unknown as { __windFarmOpsStore?: ServerState }
const state: ServerState = globalRef.__windFarmOpsStore ?? seed()
globalRef.__windFarmOpsStore = state

function addAudit(actor: string, action: string, target: string, detail: string, permitId?: string, clientRequestId?: string) {
  const event: AuditEvent = { id: nextId('AE'), time: clock(), actor, action, target, detail, permitId, clientRequestId }
  state.audit.unshift(event)
  return event
}

function bump() { state.revision += 1 }

/** 两个时间窗是否重叠（端点相接不算冲突） */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd)
}

/** 许可是否对设备形成“有效占用”：未驳回/未完成，且已通过复核 */
function isActiveHolder(permit: Permit) {
  return !['已驳回', '已完成', '待复核'].includes(permit.status)
}

/**
 * 提交/推进许可时统一进行跨班组冲突检测。
 * 占用口径：同一隔离设备（隔离点台账中的 device）、时间窗重叠、分属不同班组。
 */
function detectConflicts(incoming: Permit): Conflict[] {
  const devices = new Set(incoming.isolationPoints.map((point) => point.device))
  const found: Conflict[] = []
  for (const holder of state.permits) {
    if (holder.id === incoming.id || holder.crew === incoming.crew || !isActiveHolder(holder)) continue
    if (!overlaps(incoming.startAt, incoming.endAt, holder.startAt, holder.endAt)) continue
    const sharedPoint = holder.isolationPoints.find((point) => devices.has(point.device))
      ?? state.isolationPoints.find((point) => devices.has(point.device) && holder.requestedPointIds.includes(point.id))
    if (!sharedPoint) continue
    // 已有同一对许可/同一隔离点的未处理冲突，不重复记账
    const exists = state.conflicts.some(
      (conflict) => conflict.status === '待值班负责人处理'
        && conflict.incomingPermitId === incoming.id
        && conflict.holderPermitId === holder.id
        && conflict.device === sharedPoint.device,
    )
    if (exists) continue
    found.push({
      id: nextId('CF'),
      device: sharedPoint.device,
      pointId: sharedPoint.id,
      pointLabel: sharedPoint.label,
      holderPermitId: holder.id,
      holderCrew: holder.crew,
      incomingPermitId: incoming.id,
      incomingCrew: incoming.crew,
      window: incoming.window,
      status: '待值班负责人处理',
      createdAt: clock(),
    })
  }
  return found
}

export function getState() {
  return {
    site: '海州湾 H2 风电场',
    generatedAt: new Date().toISOString(),
    onlineDevices: 30,
    totalDevices: 32,
    windSpeed: 10.8,
    revision: state.revision,
    permits: state.permits,
    isolationPoints: state.isolationPoints,
    conflicts: state.conflicts,
    audit: state.audit,
    latestAlert: state.latestAlert,
  }
}

export interface CreatePermitInput {
  title: string
  device: string
  crew: string
  owner: string
  window: string
  startAt: string
  endAt: string
  risk: Permit['risk']
}

/** 新班组提交许可：命中重叠占用即登记冲突并冻结，等值班负责人处理 */
export function createPermit(input: CreatePermitInput) {
  const id = `WP-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${String(state.permits.length + 31).padStart(3, '0')}`
  const pointId = nextId('IP')
  const permit: Permit = {
    id,
    ...input,
    status: '待复核',
    risk: input.risk,
    revision: 1,
    reviewRequired: false,
    blockedByConflict: false,
    requestedPointIds: [pointId],
    isolationPoints: [{ id: pointId, device: input.device, label: '主隔离点', type: '开关', state: '待操作', boundaryRevision: 1 }],
    steps: [
      { id: 'ST-31', text: '核对设备双重编号与工作范围', done: false, owner: input.owner },
      { id: 'ST-32', text: '完成隔离、锁定、验电和接地', done: false, owner: input.owner },
    ],
    history: [],
  }
  // 提交即占用待校验：以请求点参与检测
  state.permits.unshift(permit)
  const conflicts = detectConflicts(permit)
  if (conflicts.length) {
    state.conflicts.unshift(...conflicts)
    permit.blockedByConflict = true
    permit.reviewRequired = true
    state.latestAlert = `${permit.crew} 的 ${permit.id} 与既有许可在 ${conflicts.map((c) => c.device).join('、')} 时段重叠，等待值班负责人处理`
    addAudit(permit.owner, '提交许可-冲突冻结', permit.id, state.latestAlert, permit.id)
    for (const conflict of conflicts) {
      addAudit('系统', '登记跨班组冲突', conflict.id, `${conflict.incomingCrew} 申请占用 ${conflict.device}（${conflict.pointLabel}），与 ${conflict.holderCrew} ${conflict.holderPermitId} 时间窗重叠`, permit.id)
    }
  } else {
    addAudit(permit.owner, '新建许可', permit.id, permit.title, permit.id)
  }
  permit.history.push(snapshotHistory(permit, '许可提交', conflicts.length ? '提交时命中跨班组冲突，冻结等待处理' : '提交复核，无冲突', permit.owner))
  bump()
  return { permit, conflicts }
}

const FLOW: Record<Permit['status'], Permit['status'] | undefined> = {
  待复核: '待执行',
  待执行: '执行中',
  执行中: '待结束',
  待结束: '待关闭',
  待关闭: '已完成',
  已完成: undefined,
  已驳回: undefined,
}

export function advancePermit(id: string, actor = '当前用户', clientRequestId?: string) {
  if (clientRequestId && state.processedRequests.has(clientRequestId)) {
    return { ok: true as const, duplicated: true as const, duplicatedAuditId: state.processedRequests.get(clientRequestId), permit: state.permits.find((p) => p.id === id) }
  }
  const permit = state.permits.find((item) => item.id === id)
  if (!permit) return { ok: false as const, error: '许可不存在' }
  if (permit.blockedByConflict) return { ok: false as const, error: '存在待值班负责人处理的跨班组冲突，暂不能推进' }
  if (permit.reviewRequired) return { ok: false as const, error: '隔离边界已调整，需要值班负责人重新复核' }
  const next = FLOW[permit.status]
  if (!next) return { ok: false as const, error: '当前状态不可推进' }
  const previous = permit.status
  permit.status = next
  permit.revision += 1
  permit.history.push(snapshotHistory(permit, '流程推进', `状态由“${previous}”变更为“${next}”`, actor))
  const event = addAudit(actor, '流程推进', permit.id, `状态由“${previous}”变更为“${next}”${clientRequestId ? '（断线补传）' : ''}`, permit.id, clientRequestId)
  if (clientRequestId) state.processedRequests.set(clientRequestId, event.id)
  bump()
  return { ok: true as const, duplicated: false as const, permit }
}

export function toggleStep(id: string, stepId: string, actor = '当前用户', clientRequestId?: string) {
  // 断线补传幂等：同一个 clientRequestId 只落一次账，重复补传不产生新变化
  if (clientRequestId && state.processedRequests.has(clientRequestId)) {
    const duplicatedAuditId = state.processedRequests.get(clientRequestId)!
    return { ok: true as const, duplicated: true as const, duplicatedAuditId, permit: state.permits.find((p) => p.id === id) }
  }
  const permit = state.permits.find((item) => item.id === id)
  const step = permit?.steps.find((item) => item.id === stepId)
  if (!permit || !step) return { ok: false as const, error: '步骤不存在' }

  const willComplete = !step.done
  step.done = willComplete
  if (willComplete) step.boundaryRevision = Math.max(1, ...permit.isolationPoints.map((point) => point.boundaryRevision))
  permit.revision += 1
  permit.history.push(snapshotHistory(permit, willComplete ? '完成步骤' : '撤销步骤', `${step.id} ${step.text}`, actor))
  const event = addAudit(
    actor,
    willComplete ? '完成步骤' : '撤销步骤',
    `${permit.id} / ${step.id}`,
    `${step.text}${clientRequestId ? '（断线补传）' : ''}`,
    permit.id,
    clientRequestId,
  )
  if (clientRequestId) state.processedRequests.set(clientRequestId, event.id)
  bump()
  return { ok: true as const, duplicated: false as const, permit }
}

export interface AdjustBoundaryInput {
  pointId: string
  label?: string
  device?: string
  actor?: string
}

/**
 * 调整隔离边界：台账中的隔离点边界版本 +1，
 * 所有已经到“隔离确认”阶段（步骤已完成或许可已进入执行）的旧许可回到重新复核，
 * 其原步骤与历史快照仍可查看。
 */
export function adjustBoundary(input: AdjustBoundaryInput) {
  const actor = input.actor ?? '值班负责人'
  const point = state.isolationPoints.find((item) => item.id === input.pointId)
  if (!point) return { ok: false as const, error: '隔离点不存在' }
  const before = `${point.device} / ${point.label}（边界 r${point.boundaryRevision}）`
  if (input.device) point.device = input.device
  if (input.label) point.label = input.label
  point.boundaryRevision += 1
  point.state = '待操作'
  point.confirmedBy = undefined

  const affected: Permit[] = []
  for (const permit of state.permits) {
    const linked = permit.isolationPoints.find((item) => item.id === point.id)
    if (!linked) continue
    linked.device = point.device
    linked.label = point.label
    linked.boundaryRevision = point.boundaryRevision
    linked.state = '待操作'
    linked.confirmedBy = undefined
    const confirmed = permit.status === '执行中'
      || permit.status === '待结束'
      || permit.status === '待关闭'
      || permit.steps.some((step) => step.done)
    if (confirmed) {
      const reason = `隔离点 ${point.id} 边界由 r${point.boundaryRevision - 1} 调整为 r${point.boundaryRevision}，旧隔离确认失效，需重新复核`
      permit.reviewRequired = true
      applyReReview(permit, reason, actor, point)
      affected.push(permit)
    } else {
      permit.revision += 1
      permit.history.push(snapshotHistory(permit, '边界调整', `隔离点 ${point.id} 更新为 r${point.boundaryRevision}，尚未隔离确认，同步最新边界`, actor))
    }
  }

  addAudit(actor, '调整隔离边界', point.id, `${before} → ${point.device} / ${point.label}（边界 r${point.boundaryRevision}）；触发 ${affected.length} 张已确认许可重新复核`)
  state.latestAlert = `隔离点 ${point.id} 边界调整为 r${point.boundaryRevision}，${affected.length} 张旧许可需要值班负责人重新复核`
  bump()
  return { ok: true as const, point, affected }
}

// 边界调整后，对已经到隔离确认阶段的旧许可发起重新复核；原步骤与历史快照保留
function applyReReview(permit: Permit, reason: string, actor: string, point: IsolationPoint) {
  const previousStatus = permit.status
  permit.revision += 1
  permit.reReviewReason = reason
  permit.reviewRequired = true
  if (!['待复核'].includes(permit.status)) permit.status = '待复核'
  permit.history.push(snapshotHistory(permit, '触发重新复核', `${reason}；原状态“${previousStatus}”，原步骤与证据保留可查`, actor))
  addAudit('系统', '旧许可重新复核', permit.id, reason, permit.id)
}

export function confirmIsolation(permitId: string, pointId: string, actor = '当前用户', clientRequestId?: string) {
  if (clientRequestId && state.processedRequests.has(clientRequestId)) {
    return { ok: true as const, duplicated: true as const, duplicatedAuditId: state.processedRequests.get(clientRequestId) }
  }
  const permit = state.permits.find((item) => item.id === permitId)
  const point = permit?.isolationPoints.find((item) => item.id === pointId)
  if (!permit || !point) return { ok: false as const, error: '隔离点不存在' }
  point.state = '已隔离'
  point.confirmedBy = permit.id
  const ledgerPoint = state.isolationPoints.find((item) => item.id === pointId)
  if (ledgerPoint) { ledgerPoint.state = '已隔离'; ledgerPoint.confirmedBy = permit.id }
  permit.revision += 1
  permit.history.push(snapshotHistory(permit, '隔离确认', `${point.id} ${point.label} 已隔离并确认，边界 r${point.boundaryRevision}`, actor))
  const event = addAudit(actor, '隔离确认', `${permit.id} / ${point.id}`, `${point.label} 按边界 r${point.boundaryRevision} 完成隔离${clientRequestId ? '（断线补传）' : ''}`, permit.id, clientRequestId)
  if (clientRequestId) state.processedRequests.set(clientRequestId, event.id)
  bump()
  return { ok: true as const, duplicated: false as const, permit }
}

/** 值班负责人处理跨班组冲突：允许继续（解除冻结）或驳回 */
export function resolveConflict(conflictId: string, resolution: '允许继续' | '驳回', actor = '值班负责人', note = '') {
  const conflict = state.conflicts.find((item) => item.id === conflictId)
  if (!conflict) return { ok: false as const, error: '冲突不存在' }
  if (conflict.status !== '待值班负责人处理') return { ok: false as const, error: '该冲突已处理' }
  const incoming = state.permits.find((item) => item.id === conflict.incomingPermitId)
  conflict.status = resolution
  conflict.resolvedAt = clock()
  conflict.resolvedBy = actor
  conflict.resolution = note
  if (incoming) {
    incoming.revision += 1
    if (resolution === '允许继续') {
      incoming.blockedByConflict = false
      incoming.reviewRequired = false
      incoming.reReviewReason = undefined
      incoming.history.push(snapshotHistory(incoming, '冲突处理-放行', `值班负责人允许与 ${conflict.holderCrew} 错峰占用 ${conflict.device}：${note || '按交接顺序继续'}`, actor))
      addAudit(actor, '冲突放行', conflict.id, `允许 ${incoming.crew} ${incoming.id} 在 ${conflict.device} 继续流转`, incoming.id)
    } else {
      incoming.status = '已驳回'
      incoming.history.push(snapshotHistory(incoming, '冲突处理-驳回', `值班负责人驳回重叠时段申请：${note || '调整时间窗后重新提交'}`, actor))
      addAudit(actor, '冲突驳回', conflict.id, `驳回 ${incoming.crew} ${incoming.id} 对 ${conflict.device} 的重叠占用`, incoming.id)
    }
  }
  // 同一张许可的其它冲突仍未处理时保持冻结
  const stillPending = state.conflicts.some((c) => c.incomingPermitId === conflict.incomingPermitId && c.status === '待值班负责人处理')
  if (incoming && resolution === '允许继续' && stillPending) incoming.blockedByConflict = true
  if (!state.conflicts.some((c) => c.status === '待值班负责人处理')) state.latestAlert = ''
  bump()
  return { ok: true as const, conflict }
}

/** 值班负责人对边界调整后的旧许可完成重新复核（原步骤与审计保留） */
export function reReviewPermit(permitId: string, actor = '值班负责人', note = '') {
  const permit = state.permits.find((item) => item.id === permitId)
  if (!permit) return { ok: false as const, error: '许可不存在' }
  if (!permit.reviewRequired) return { ok: false as const, error: '该许可无需重新复核' }
  permit.reviewRequired = false
  permit.reReviewReason = undefined
  permit.revision += 1
  permit.history.push(snapshotHistory(permit, '复核通过', `值班负责人按最新隔离边界重新复核通过：${note || '确认边界与原作业步骤仍有效'}; 原步骤证据保留`, actor))
  addAudit(actor, '重新复核通过', permit.id, `边界 r${Math.max(...permit.isolationPoints.map((p) => p.boundaryRevision))} 复核通过，原 ${permit.steps.filter((s) => s.done).length} 个已完成步骤保留可查`, permit.id)
  bump()
  return { ok: true as const, permit }
}

export function dismissAlert(actor = '值班负责人') {
  state.latestAlert = ''
  addAudit(actor, '确认提醒', '实时提醒', '值班负责人已知悉并协调当前提醒')
  bump()
}
