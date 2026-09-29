<script setup lang="ts">
import { useOperationsStore } from '~/stores/operations'

const store = useOperationsStore()
const { data } = await useFetch('/api/operations')
const { reconnect } = useRealtime((event) => {
  if (event.type === 'connection') store.connection = event.payload.startsWith('在线') ? '在线' : '离线'
})

const counts = computed(() => ({
  active: store.permits.filter((item) => ['执行中', '待结束'].includes(item.status)).length,
  pending: store.permits.filter((item) => ['待复核', '待执行'].includes(item.status)).length,
  conflicts: store.pendingConflicts.length,
  recheck: store.permits.filter((item) => item.reviewRequired).length,
}))

async function resolve(id: string, decision: '放行' | '改期') {
  await store.dispatch('resolve-conflict', { conflictId: id, decision, note: '' }, `冲突 ${id} 裁决：${decision}`)
}
</script>

<template>
  <div class="page">
    <div class="head">
      <div><p class="eyebrow">现场安全运行</p><h1 class="page-title">隔离与作业许可总览</h1><p class="muted">许可流转、隔离点、跨班组冲突与审计同源于服务端统一账本（r{{ store.state?.revision }}）。</p></div>
      <div class="inline wrap"><UButton color="gray" variant="outline" icon="i-heroicons-arrow-path" @click="reconnect">检查连接</UButton><UButton color="primary" icon="i-heroicons-document-plus" @click="navigateTo('/permits?new=1')">申请作业许可</UButton></div>
    </div>
    <UAlert v-if="store.latestAlert" class="mb-4" color="red" variant="soft" icon="i-heroicons-exclamation-triangle" title="跨班组占用冲突 · 待值班负责人裁决" :description="store.latestAlert" :actions="[{ label: '前往裁决', click: () => navigateTo('/permits') }]" />
    <UAlert v-else-if="counts.recheck" class="mb-4" color="amber" variant="soft" icon="i-heroicons-shield-exclamation" title="隔离边界变化触发重新复核" description="有已到隔离确认的许可因共用边界调整被回退至待复核，复核前不得继续作业。" :actions="[{ label: '查看许可', click: () => navigateTo('/permits') }]" />
    <section class="grid metrics">
      <article class="panel metric"><span>执行中许可</span><strong>{{ counts.active }}</strong><small>多个班组在场</small></article>
      <article class="panel metric"><span>待复核 / 待执行</span><strong>{{ counts.pending }}</strong><small>最早 18:00 开工</small></article>
      <article class="panel metric"><span>待处理冲突</span><strong class="danger">{{ counts.conflicts }}</strong><small>设备重叠占用已挂起</small></article>
      <article class="panel metric"><span>设备在线</span><strong>{{ data?.onlineDevices }}/{{ data?.totalDevices }}</strong><small>平均风速 {{ data?.windSpeed }} m/s</small></article>
    </section>
    <section class="grid main-grid">
      <article class="panel p-4">
        <div class="panel-head"><div><h2>当前作业状态</h2><p class="muted">状态以服务端账本为准，推进前统一复查占用冲突</p></div><UBadge color="blue" variant="subtle">账本 r{{ store.state?.revision }}</UBadge></div>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>许可 / 作业</th><th>占用设备</th><th>负责人</th><th>时间窗</th><th>状态</th><th></th></tr></thead><tbody>
          <tr v-for="permit in store.permits" :key="permit.id"><td><b>{{ permit.id }}</b><small class="block muted">{{ permit.title }} · r{{ permit.revision }}</small></td><td>{{ permit.deviceCodes.join('、') }}</td><td>{{ permit.owner }} · {{ permit.crew }}</td><td>{{ permit.window }}</td><td><UBadge :color="permit.reviewRequired ? 'red' : permit.status === '执行中' ? 'green' : 'amber'" variant="subtle">{{ permit.reviewRequired ? '待复核（挂起）' : permit.status }}</UBadge></td><td><UButton size="xs" variant="ghost" @click="navigateTo(`/permits?id=${permit.id}`)">进入</UButton></td></tr>
        </tbody></table></div>
      </article>
      <aside class="grid side-grid">
        <article class="panel p-4 conflict-card">
          <div class="panel-head"><h2>跨班组冲突台账</h2><UBadge color="red" variant="subtle">{{ store.pendingConflicts.length }} 待处理</UBadge></div>
          <p v-if="!store.conflicts.length" class="muted">暂无冲突登记。</p>
          <div v-for="conflict in store.conflicts" :key="conflict.id" class="conflict" :class="conflict.status">
            <div class="inline justify-between wrap"><b>{{ conflict.id }} · {{ conflict.device }}</b><UBadge size="xs" :color="conflict.status === '待处理' ? 'red' : conflict.status === '待改期' ? 'amber' : 'green'" variant="subtle">{{ conflict.status }}</UBadge></div>
            <p class="muted">{{ conflict.crew }} {{ conflict.permitId }} × {{ conflict.holderCrew }} {{ conflict.holderPermitId }}</p>
            <small class="block">{{ conflict.overlapLabel }}</small>
            <p v-if="conflict.status === '待处理'" class="muted tip">申请班组已挂起，处理后才能继续：</p>
            <div v-if="conflict.status === '待处理'" class="inline mt-1">
              <UButton size="xs" color="green" variant="soft" :disabled="store.role !== '值班负责人'" @click="resolve(conflict.id, '放行')">值班负责人放行</UButton>
              <UButton size="xs" color="amber" variant="soft" :disabled="store.role !== '值班负责人'" @click="resolve(conflict.id, '改期')">要求改期</UButton>
            </div>
            <small v-else class="block muted resolve">{{ conflict.resolvedBy }}：{{ conflict.resolutionNote }}</small>
          </div>
        </article>
        <article class="panel p-4"><h2>设备状态（统一记账）</h2>
          <div v-for="device in store.devices" :key="device.id" class="device-row" @click="navigateTo('/devices')"><span class="dot" :class="device.state === '运行' ? 'green' : device.state === '检修隔离' ? 'red' : 'amber'" /><div><b>{{ device.id }}</b><small>{{ device.name }} · {{ device.crew }}</small></div><UBadge :color="device.state === '运行' ? 'green' : device.state === '检修隔离' ? 'red' : 'amber'" variant="subtle">{{ device.state }}</UBadge></div>
        </article>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:18px}.head h1{margin:3px 0 7px}.head p{margin:0}.eyebrow{font-size:12px;color:#2563eb;font-weight:700}.metrics{grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}.metric{padding:17px}.main-grid{grid-template-columns:minmax(0,1.55fr) minmax(320px,.8fr);gap:16px}.panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px}.panel h2{font-size:17px;margin:0 0 12px}.panel-head h2{margin:0}.panel-head p{font-size:12px;margin:3px 0}.block,.device-row small{display:block}.side-grid{gap:14px}.device-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid #edf0f5;cursor:pointer}.device-row div{flex:1}.dot{width:9px;height:9px;border-radius:50%;flex:none}.dot.green{background:#22c55e}.dot.amber{background:#f59e0b}.dot.red{background:#ef4444}.conflict{border:1px solid #e2e8f0;border-left:3px solid #ef4444;border-radius:7px;padding:10px 12px;margin-bottom:10px;background:#fff}.conflict.待改期{border-left-color:#f59e0b}.conflict.已放行,.conflict.已改期{border-left-color:#22c55e;background:#f6fef9}.conflict p{margin:6px 0 2px;font-size:13px}.conflict small{font-size:12px;color:#667085}.conflict .tip{margin-top:7px}.conflict .resolve{margin-top:6px}.mt-1{margin-top:6px}
@media(max-width:1100px){.metrics{grid-template-columns:1fr 1fr}.main-grid{grid-template-columns:1fr}}@media(max-width:620px){.head{flex-direction:column}.metrics{grid-template-columns:1fr}}
</style>
