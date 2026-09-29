import { useOperationsStore } from '~/stores/operations'

/** 启动即从服务端统一账本载入：许可、隔离点、冲突、审计同一份数据（沿用演示种子） */
export default defineNuxtPlugin(async () => {
  const store = useOperationsStore()
  if (!store.loaded) {
    const fresh = await useFetch<OperationsState>('/api/state', { key: 'wind-farm-ledger' })
    if (fresh.data.value) store.hydrate(fresh.data.value)
  }
})
