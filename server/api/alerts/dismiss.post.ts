import { dismissAlert, getState } from '~/server/utils/store'
import type { CommandResult } from '~/types'

export default defineEventHandler(async (event): Promise<CommandResult> => {
  const body = await readBody(event).catch(() => ({}))
  dismissAlert(String(body?.actor || '值班负责人'))
  return { ok: true, state: getState() }
})
