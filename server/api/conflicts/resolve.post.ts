import { getState, resolveConflict } from '~/server/utils/store'
import type { CommandResult } from '~/types'

/** 值班负责人处理跨班组冲突：允许继续 / 驳回，之后申请班组才能继续流转 */
export default defineEventHandler(async (event): Promise<CommandResult> => {
  const body = await readBody(event)
  if (body?.resolution !== '允许继续' && body?.resolution !== '驳回') {
    return { ok: false, state: getState(), error: 'resolution 必须是“允许继续”或“驳回”' }
  }
  const result = resolveConflict(
    String(body?.conflictId),
    body.resolution,
    String(body?.actor || '值班负责人'),
    String(body?.note || ''),
  )
  return { ok: result.ok, state: getState(), error: 'error' in result ? result.error : undefined }
})
