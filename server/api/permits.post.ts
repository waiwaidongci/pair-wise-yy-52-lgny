import { createPermit, getState } from '~/server/utils/store'
import type { CommandResult } from '~/types'

export default defineEventHandler(async (event): Promise<CommandResult> => {
  const body = await readBody(event)
  if (!body?.title?.trim() || !body?.device?.trim() || !body?.startAt || !body?.endAt) {
    return { ok: false, state: getState(), error: '作业名称、设备编号和计划时间窗必填' }
  }
  const { conflicts } = createPermit({
    title: String(body.title),
    device: String(body.device),
    crew: String(body.crew || '未分配班组'),
    owner: String(body.owner || '当前用户'),
    window: String(body.window),
    startAt: new Date(body.startAt).toISOString(),
    endAt: new Date(body.endAt).toISOString(),
    risk: body.risk ?? '二级',
  })
  return { ok: true, state: getState(), conflict: conflicts[0] }
})
