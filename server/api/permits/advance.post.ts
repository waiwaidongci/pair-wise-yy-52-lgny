import { advancePermit, getState } from '~/server/utils/store'
import type { CommandResult } from '~/types'

/** 许可流转推进：冲突冻结 / 待重新复核的许可由服务端拒绝 */
export default defineEventHandler(async (event): Promise<CommandResult> => {
  const body = await readBody(event)
  const result = advancePermit(
    String(body?.id),
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
