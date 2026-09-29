import { toggleStep, getState } from '~/server/utils/store'
import type { CommandResult } from '~/types'

/**
 * 完成/撤销步骤。
 * clientRequestId 由现场端为每次确认生成并在断线重连后原样补传，
 * 服务端按该键幂等：重复补传只产生一次变化、一条审计。
 */
export default defineEventHandler(async (event): Promise<CommandResult> => {
  const body = await readBody(event)
  const result = toggleStep(
    String(body?.permitId),
    String(body?.stepId),
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
