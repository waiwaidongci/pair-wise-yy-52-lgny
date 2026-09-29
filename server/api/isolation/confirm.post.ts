import { confirmIsolation, getState } from '~/server/utils/store'
import type { CommandResult } from '~/types'

/** 隔离点确认（同样支持断线补传幂等） */
export default defineEventHandler(async (event): Promise<CommandResult> => {
  const body = await readBody(event)
  const result = confirmIsolation(
    String(body?.permitId),
    String(body?.pointId),
    String(body?.actor || '当前用户'),
    body?.clientRequestId ? String(body.clientRequestId) : undefined,
  )
  return {
    ok: result.ok,
    state: getState(),
    duplicated: 'duplicated' in result ? result.duplicated : undefined,
    error: 'error' in result ? result.error : undefined,
  }
})
