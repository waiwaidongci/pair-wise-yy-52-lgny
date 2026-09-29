import { snapshot, useLedger } from '~/server/utils/ledger'

/** 兼容既有站点信息接口，数据同样取自统一账本 */
export default defineEventHandler(() => {
  const state = snapshot(useLedger())
  return {
    site: state.site.name,
    generatedAt: state.serverTime,
    onlineDevices: state.site.onlineDevices,
    totalDevices: state.site.totalDevices,
    windSpeed: state.site.windSpeed,
    revision: state.revision,
  }
})
