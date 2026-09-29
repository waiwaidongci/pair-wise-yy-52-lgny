import { useOperationsStore } from '~/stores/operations'

export default defineNuxtPlugin(async () => {
  const store = useOperationsStore()
  await store.bootstrap()
})
