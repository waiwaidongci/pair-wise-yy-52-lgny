import { useOperationsStore } from '~/stores/operations'

type RealtimeEvent = { type: 'permit-update' | 'connection'; payload: string }

/** 实时通道模拟：连接状态以统一账本的连接动作为准（离线挂起 / 上线补传） */
export function useRealtime(onEvent: (event: RealtimeEvent) => void) {
  let timer: ReturnType<typeof setInterval> | undefined
  let socket: WebSocket | undefined

  function connect() {
    const store = useOperationsStore()
    const url = useRuntimeConfig().public.wsUrl as string | undefined
    if (url && import.meta.client) {
      socket = new WebSocket(url)
      socket.onmessage = (event) => onEvent(JSON.parse(event.data) as RealtimeEvent)
      socket.onclose = () => onEvent({ type: 'connection', payload: '离线' })
      return
    }
    onEvent({ type: 'connection', payload: store.connection === '在线' ? '在线 · 模拟通道' : '离线 · 补传队列保留中' })
    timer = setInterval(() => {
      const updates = [
        'WTG-03 隔离点状态已由周野确认',
        '风速 10.8m/s，高空作业保持暂停',
        'LINE-A2 跨班组冲突仍待值班负责人裁决',
      ]
      onEvent({ type: 'permit-update', payload: updates[Math.floor(Math.random() * updates.length)]! })
    }, 9000)
  }
  function disconnect() { if (timer) clearInterval(timer); socket?.close() }
  onMounted(connect)
  onBeforeUnmount(disconnect)
  return { reconnect: connect, disconnect }
}
