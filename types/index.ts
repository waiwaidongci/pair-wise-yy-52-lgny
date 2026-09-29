export type PermitStatus = '待复核' | '待执行' | '执行中' | '待结束' | '待关闭' | '已完成' | '已驳回'

export type ConflictStatus = '待值班负责人处理' | '允许继续' | '驳回'

export interface IsolationPoint {
  id: string
  device: string
  label: string
  type: '开关' | '刀闸' | '阀门' | '接地'
  state: '已隔离' | '待操作' | '已恢复'
  /** 隔离边界版本：边界每次调整后 +1，用来识别已确认的旧边界 */
  boundaryRevision: number
  /** 最近一次在该点完成隔离确认的许可 */
  confirmedBy?: string
}

export interface PermitStep {
  id: string
  text: string
  done: boolean
  owner: string
  evidence?: string
  /** 步骤完成时所处的隔离边界版本 */
  boundaryRevision?: number
}

export interface PermitHistoryEntry {
  id: string
  time: string
  action: string
  detail: string
  actor: string
  revision: number
  /** 动作发生时的步骤与隔离点快照，边界调整后仍可回看 */
  steps: PermitStep[]
  isolationPoints: IsolationPoint[]
}

export interface Permit {
  id: string
  title: string
  device: string
  crew: string
  owner: string
  window: string
  /** ISO 时间，跨班组时段重叠检测的统一记账口径 */
  startAt: string
  endAt: string
  status: PermitStatus
  risk: '一级' | '二级' | '三级'
  isolationPoints: IsolationPoint[]
  steps: PermitStep[]
  revision: number
  reviewRequired: boolean
  /** 提交时命中跨班组冲突，许可冻结等待值班负责人处理 */
  blockedByConflict: boolean
  /** 边界调整后需要重新复核的说明，清空即视为复核完成 */
  reReviewReason?: string
  /** 许可提交时携带的隔离点 id（占用登记的依据） */
  requestedPointIds: string[]
  history: PermitHistoryEntry[]
}

export interface Conflict {
  id: string
  device: string
  pointLabel: string
  pointId: string
  /** 已有效占用设备的许可 */
  holderPermitId: string
  holderCrew: string
  /** 提交重叠时段的新许可 */
  incomingPermitId: string
  incomingCrew: string
  window: string
  status: ConflictStatus
  createdAt: string
  resolvedAt?: string
  resolvedBy?: string
  resolution?: string
}

export interface AuditEvent {
  id: string
  time: string
  actor: string
  action: string
  target: string
  detail: string
  permitId?: string
  /** 断线补传的幂等键，重复补传只产生一次变化 */
  clientRequestId?: string
}

export interface OperationsState {
  site: string
  generatedAt: string
  onlineDevices: number
  totalDevices: number
  windSpeed: number
  revision: number
  permits: Permit[]
  /** 全风场隔离点台账（边界的唯一登记处） */
  isolationPoints: IsolationPoint[]
  conflicts: Conflict[]
  audit: AuditEvent[]
  latestAlert: string
}

export interface CommandResult {
  ok: boolean
  state: OperationsState
  conflict?: Conflict
  /** 命中幂等去重：本次补传没有产生新的变化 */
  duplicated?: boolean
  error?: string
}
