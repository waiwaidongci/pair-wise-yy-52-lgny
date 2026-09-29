import { getState, reReviewPermit } from '~/server/utils/store'
import type { CommandResult } from '~/types'

/** 值班负责人对边界调整后的旧许可完成重新复核 */
export default defineEventHandler(async (event): Promise<CommandResult> => {
  const body = await readBody(event)
  const result = reReviewPermit(String(body?.permitId), String(body?.actor || '值班负责人'), String(body?.note || ''))
  return { ok: result.ok, state: getState(), error: 'error' in result ? result.error : undefined }
})
