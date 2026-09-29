export type PermitStatus = '待复核' | '待执行' | '执行中' | '待结束' | '待关闭' | '已完成'
export type ActorRole = '值班负责人' | '工作负责人'
export type ConflictStatus = '待处理' | '待改期' | '已放行' | '已改期'
export type PointState = '已隔离' | '待操作' | '已恢复'

export interface IsolationPoint {
  id: string
  device: string
  label: string
  type: '开关' | '刀闸' | '阀门' | '接地'
  state: PointState
}

export interface PermitStep {
  id: string
  text: string
  done: boolean
  owner: string
  evidence?: string
}

/** 历史修订快照：隔离边界调整、改期、复核等变化后，旧版本步骤与隔离点仍可查看 */
export interface PermitSnapshot {
  revision: number
  at: string
  reason: string
  status: PermitStatus
  windowLabel: string
  isolationPoints: IsolationPoint[]
  steps: PermitStep[]
}

export interface Permit {
  id: string
  title: string
  device: string
  /** 占用的统一设备编码，如 WTG-03 / LINE-A2 / BUS-A，用于跨班组占用记账 */
  deviceCodes: string[]
  crew: string
  owner: string
  /** 绝对时间键 YYYY-MM-DDTHH:MM，用于重叠计算 */
  windowStart: string
  windowEnd: string
  /** 展示用时间窗，如 09-29 18:00 — 30 02:00 */
  window: string
  status: PermitStatus
  risk: '一级' | '二级' | '三级'
  isolationPoints: IsolationPoint[]
  steps: PermitStep[]
  revision: number
  /** 待值班负责人处理：冲突未决或边界调整后需重新复核 */
  reviewRequired: boolean
  reviewReason?: string
  /** 未决冲突编号（跨班组占用冲突台账） */
  holdConflictIds: string[]
  /** 值班负责人已放行的“重叠占用许可”编号：授权与该许可时间窗重叠时继续作业 */
  overlapAllowedWith: string[]
  createdAt: string
  history: PermitSnapshot[]
}

export interface Conflict {
  id: string
  status: ConflictStatus
  device: string
  permitId: string
  permitTitle: string
  crew: string
  holderPermitId: string
  holderTitle: string
  holderCrew: string
  overlapLabel: string
  message: string
  createdAt: string
  resolvedAt?: string
  resolvedBy?: string
  resolutionNote?: string
}

export interface AuditEvent {
  id: string
  time: string
  actor: string
  action: string
  target: string
  detail: string
  permitId?: string
  /** 来源操作的幂等编号，重复补传不会产生第二条 */
  opId?: string
}

export interface DeviceInfo {
  id: string
  name: string
  state: string
  load: string
  points: number
  crew: string
}

export interface OperationsState {
  site: { name: string; onlineDevices: number; totalDevices: number; windSpeed: number }
  serverTime: string
  revision: number
  permits: Permit[]
  conflicts: Conflict[]
  audit: AuditEvent[]
  devices: DeviceInfo[]
  /** 被幂等去重命中的补传次数（仅计数，不产生业务变化） */
  dedupHits: number
}

/** 前端 → 服务端的统一写操作 */
export interface ActionEnvelope {
  opId: string
  actor: string
  role: ActorRole
  type:
    | 'submit-permit'
    | 'advance-permit'
    | 'toggle-step'
    | 'resolve-conflict'
    | 'reschedule-permit'
    | 'recheck-permit'
    | 'adjust-boundary'
    | 'set-point-state'
  [key: string]: unknown
}

export interface ActionResponse {
  ok: boolean
  duplicate: boolean
  message?: string
  state: OperationsState
}
