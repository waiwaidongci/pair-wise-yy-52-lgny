import { dispatch, useLedger } from '~/server/utils/ledger'
import type { ActionEnvelope, ActionResponse } from '~/types'

/**
 * 所有写操作的统一入口。
 * 客户端（含断线重连后的补传）必须携带稳定的 opId：
 * 同一 opId 只在首次产生一次业务变化与一条审计，重复补传返回 duplicate=true。
 */
export default defineEventHandler(async (event): Promise<ActionResponse> => {
  const body = await readBody<ActionEnvelope>(event)
  return dispatch(useLedger(), body)
})
