import { adjustBoundary, getState } from '~/server/utils/store'
import type { CommandResult } from '~/types'

/**
 * 调整隔离边界：隔离点台账边界版本 +1，
 * 已到隔离确认的旧许可自动回到重新复核，原步骤和审计仍可查看。
 */
export default defineEventHandler(async (event): Promise<CommandResult> => {
  const body = await readBody(event)
  const result = adjustBoundary({
    pointId: String(body?.pointId),
    device: body?.device ? String(body.device) : undefined,
    label: body?.label ? String(body.label) : undefined,
    actor: String(body?.actor || '值班负责人'),
  })
  return { ok: result.ok, state: getState(), error: 'error' in result ? result.error : undefined }
})
