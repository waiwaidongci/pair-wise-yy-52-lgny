<script setup lang="ts">
import { useOperationsStore } from '~/stores/operations'

const store = useOperationsStore()
await store.bootstrap()
const { data } = await useFetch('/api/operations')
useRealtime((event) => {
  if (event.type === 'connection') store.connection = event.payload.startsWith('在线') ? '在线' : '重连中'
  if (event.type === 'permit-update') store.latestAlert = event.payload
})
const counts = computed(() => ({
  active: store.permits.filter((item) => ['执行中', '待结束'].includes(item.status)).length,
  pending: store.permits.filter((item) => ['待复核', '待执行'].includes(item.status)).length,
  conflicts: store.conflicts.filter((item) => item.status === '待值班负责人处理').length,
  rereview: store.permits.filter((item) => item.reviewRequired && !item.blockedByConflict).length,
}))
const pendingConflicts = computed(() => store.conflicts.filter((item) => item.status === '待值班负责人处理'))
</script>

<template>
  <div class="page">
    <div class="head">
      <div><p class="eyebrow">现场安全运行</p><h1 class="page-title">隔离与作业许可总览</h1><p class="muted">许可流转、隔离点占用、跨班组冲突和审计留痕统一记账于同一份服务端数据。</p></div>
      <div class="inline wrap"><UButton color="gray" variant="outline" icon="i-heroicons-arrow-path" @click="store.refresh">刷新台账</UButton><UButton color="primary" icon="i-heroicons-document-plus" @click="navigateTo('/permits?new=1')">申请作业许可</UButton></div>
    </div>
    <UAlert v-if="store.latestAlert" class="mb-4" color="amber" variant="soft" icon="i-heroicons-exclamation-triangle" title="实时冲突提醒" :description="store.latestAlert" :actions="[{ label: '值班负责人已知悉', click: store.acceptAlert }]" />
    <section class="grid metrics">
      <article class="panel metric"><span>执行中许可</span><strong>{{ counts.active }}</strong><small>3 个班组在场</small></article>
      <article class="panel metric"><span>待复核 / 待执行</span><strong>{{ counts.pending }}</strong><small>最早 18:00 开工</small></article>
      <article class="panel metric"><span>待处理跨班组冲突</span><strong class="danger">{{ counts.conflicts }}</strong><small>冻结中，须负责人协调</small></article>
      <article class="panel metric"><span>设备在线</span><strong>{{ data?.onlineDevices }}/{{ data?.totalDevices }}</strong><small>平均风速 {{ data?.windSpeed }} m/s · r{{ store.revision }}</small></article>
    </section>
    <section class="grid main-grid">
      <article class="panel p-4">
        <div class="panel-head"><div><h2>当前作业状态</h2><p class="muted">设备有效占用期间，重叠时段的跨班组申请会被自动冻结</p></div><UBadge color="blue" variant="subtle">服务端版本 r{{ store.revision }}</UBadge></div>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>许可 / 作业</th><th>设备</th><th>负责人</th><th>时间窗</th><th>状态</th><th></th></tr></thead><tbody>
          <tr v-for="permit in store.permits" :key="permit.id"><td><b>{{ permit.id }}</b><small class="block muted">{{ permit.title }}</small></td><td>{{ permit.device }}</td><td>{{ permit.owner }} · {{ permit.crew }}</td><td>{{ permit.window }}</td><td>
            <UBadge v-if="permit.blockedByConflict" color="red" variant="subtle">冲突冻结</UBadge>
            <UBadge v-else-if="permit.reviewRequired" color="orange" variant="subtle">边界变更待复核</UBadge>
            <UBadge v-else :color="permit.status === '执行中' ? 'green' : 'amber'" variant="subtle">{{ permit.status }}</UBadge>
          </td><td><UButton size="xs" variant="ghost" @click="navigateTo(`/permits?id=${permit.id}`)">进入</UButton></td></tr>
        </tbody></table></div>
      </article>
      <aside class="grid side-grid">
        <article class="panel p-4">
          <h2>跨班组冲突待办</h2>
          <UAlert v-if="!pendingConflicts.length" color="green" variant="soft" icon="i-heroicons-shield-check" title="暂无未处理冲突" description="所有隔离点占用与时间窗均已协调。" />
          <div v-for="conflict in pendingConflicts" :key="conflict.id" class="conflict">
            <div class="inline wrap justify-between"><UBadge color="red" variant="subtle">{{ conflict.id }}</UBadge><small class="muted">{{ conflict.createdAt }}</small></div>
            <p><b>{{ conflict.device }}</b> · {{ conflict.pointLabel }}</p>
            <p class="muted">{{ conflict.incomingCrew }}（{{ conflict.incomingPermitId }}）申请重叠时段，设备由 {{ conflict.holderCrew }}（{{ conflict.holderPermitId }}）有效占用</p>
            <div class="inline">
              <UButton size="xs" color="green" variant="soft" icon="i-heroicons-check" @click="store.resolveConflict(conflict.id, '允许继续', '同意错峰交接后继续')">允许继续</UButton>
              <UButton size="xs" color="red" variant="ghost" icon="i-heroicons-x-mark" @click="store.resolveConflict(conflict.id, '驳回', '重叠时段不允许同时占用')">驳回</UButton>
            </div>
          </div>
        </article>
        <article class="panel p-4"><h2>现场条件</h2><div class="condition"><span>轮毂高度风速</span><b>10.8 m/s</b></div><div class="condition"><span>能见度</span><b>12 km</b></div><div class="condition"><span>高空作业</span><b class="danger">暂停</b></div><div class="condition"><span>隔离边界待复核</span><b :class="counts.rereview ? 'danger' : 'success'">{{ counts.rereview }} 张许可</b></div></article>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:18px}.head h1{margin:3px 0 7px}.head p{margin:0}.eyebrow{font-size:12px;color:#2563eb;font-weight:700}.metrics{grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}.metric{padding:17px}.main-grid{grid-template-columns:minmax(0,1.65fr) minmax(320px,.8fr);gap:16px}.panel-head{display:flex;justify-content:space-between;margin-bottom:12px}.panel h2{font-size:17px;margin:0 0 12px}.panel-head h2{margin:0}.panel-head p{font-size:12px;margin:3px 0}.block,.device-row small{display:block}.side-grid{gap:14px;align-content:start}.conflict{padding:11px 0;border-bottom:1px solid #edf0f5}.conflict p{margin:6px 0;font-size:13px}.conflict .inline{margin-top:6px}.condition{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid #edf0f5;font-size:14px}.condition span{color:#667085}
@media(max-width:1100px){.metrics{grid-template-columns:1fr 1fr}.main-grid{grid-template-columns:1fr}}@media(max-width:620px){.head{flex-direction:column}.metrics{grid-template-columns:1fr}}
</style>
