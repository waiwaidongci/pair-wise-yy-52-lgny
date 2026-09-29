import { snapshot, useLedger } from '~/server/utils/ledger'

/** 服务端统一账本的只读快照：许可流转 / 隔离点 / 跨班组冲突 / 审计同源 */
export default defineEventHandler(() => {
  return snapshot(useLedger())
})
