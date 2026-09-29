<script setup lang="ts">
import { useOperationsStore } from '~/stores/operations'
import type { Permit, PointState } from '~/types'

const store = useOperationsStore()
const selectedDevice = ref('WTG-03')

interface PointRow {
  permitId: string
  permit: Permit
  point: Permit['isolationPoints'][number]
}
const rows = computed<PointRow[]>(() => store.permits.flatMap((permit) =>
  permit.isolationPoints
    .filter((point) => point.device === selectedDevice.value)
    .map((point) => ({ permitId: permit.id, permit, point })),
))
const deviceConflicts = computed(() => store.conflicts.filter((c) =>
  c.device.includes(selectedDevice.value)
  || store.permits.find((p) => p.id === c.permitId)?.deviceCodes.includes(selectedDevice.value),
))
// 该设备上已隔离到位、可执行“隔离确认”（待执行 → 执行中）的许可
const confirmable = computed(() => store.permits.find((permit) =>
  permit.status === '待执行'
  && !permit.reviewRequired
  && permit.deviceCodes.includes(selectedDevice.value)
  && permit.isolationPoints.length > 0
  && permit.isolationPoints.every((p) => p.state === '已隔离'),
))

const confirmTitle = computed(() => (confirmable.value ? `${confirmable.value.id}（${confirmable.value.crew}）全部隔离点已到位` : ''))
async function setPoint(permitId: string, pointId: string, next: PointState) {
  await store.dispatch('set-point-state', { permitId, pointId, state: next }, `隔离操作 ${pointId}`)
}
async function confirmIsolation(permitId: string) {
  await store.dispatch('advance-permit', { permitId }, `隔离确认 ${permitId}`)
}
</script>

<template>
  <div class="page">
    <div class="head"><div><p class="eyebrow">LOCKOUT / TAGOUT · 统一占用记账</p><h1 class="page-title">设备隔离与锁定点</h1><p class="muted">隔离点归属服务端账本，跨班组占用同一设备时由冲突台账统一裁决；隔离确认后边界调整会触发复核。</p></div><UButton color="primary" icon="i-heroicons-plus" @click="navigateTo('/permits?new=1')">登记隔离点（随许可）</UButton></div>
    <div class="device-grid">
      <article v-for="device in store.devices" :key="device.id" class="panel device" :class="{ active: selectedDevice === device.id }" @click="selectedDevice = device.id">
        <div class="inline justify-between"><UBadge variant="subtle">{{ device.id }}</UBadge><UBadge :color="device.state === '运行' ? 'green' : device.state === '检修隔离' ? 'red' : 'amber'" variant="subtle">{{ device.state }}</UBadge></div>
        <h2>{{ device.name }}</h2>
        <div class="kv"><span>当前负荷</span><b>{{ device.load }}</b></div>
        <div class="kv"><span>隔离点（账本）</span><b>{{ store.permits.flatMap((p) => p.isolationPoints).filter((p) => p.device === device.id).length }} 个</b></div>
        <div class="kv"><span>责任班组</span><b>{{ device.crew }}</b></div>
      </article>
    </div>
    <section class="grid lower">
      <article class="panel p-4">
        <h2>{{ selectedDevice }} · 隔离检查单</h2>
        <div v-for="row in rows" :key="row.point.id" class="point">
          <div class="lock-icon"><UIcon name="i-heroicons-lock-closed" /></div>
          <div><b>{{ row.point.label }}</b><small>{{ row.point.type }} · {{ row.point.id }} · {{ row.permit.id }}（{{ row.permit.crew }}）</small></div>
          <UBadge :color="row.point.state === '已隔离' ? 'green' : row.point.state === '已恢复' ? 'gray' : 'amber'" variant="subtle">{{ row.point.state }}</UBadge>
          <div class="seg">
            <button :class="{ on: row.point.state === '待操作' }" :disabled="row.permit.reviewRequired" @click="setPoint(row.permit.id, row.point.id, '待操作')">待操作</button>
            <button :class="{ on: row.point.state === '已隔离' }" :disabled="row.permit.reviewRequired" @click="setPoint(row.permit.id, row.point.id, '已隔离')">隔离</button>
            <button :class="{ on: row.point.state === '已恢复' }" :disabled="row.permit.reviewRequired" @click="setPoint(row.permit.id, row.point.id, '已恢复')">恢复</button>
          </div>
        </div>
        <UAlert v-if="!rows.length" color="gray" title="该设备暂无隔离点" description="在作业许可中调整隔离边界即可登记到统一台账。" />
        <div v-if="confirmable" class="confirm-bar"><UAlert color="green" variant="soft" :title="confirmTitle" description="隔离确认后许可进入执行中，操作将进入审计时间线。" /><UButton color="primary" icon="i-heroicons-check-badge" @click="confirmIsolation(confirmable.id)">完成隔离确认</UButton></div>
      </article>
      <article class="panel p-4">
        <h2>{{ selectedDevice }} · 占用与冲突</h2>
        <div v-if="!deviceConflicts.length" class="empty muted">该设备暂无跨班组冲突登记。</div>
        <div v-for="conflict in deviceConflicts" :key="conflict.id" class="cf">
          <div class="inline justify-between wrap"><b>{{ conflict.id }}</b><UBadge size="xs" :color="conflict.status === '待处理' ? 'red' : conflict.status === '待改期' ? 'amber' : 'green'" variant="subtle">{{ conflict.status }}</UBadge></div>
          <p class="muted">{{ conflict.crew }} vs {{ conflict.holderCrew }}</p>
          <small>{{ conflict.overlapLabel }}</small>
          <small v-if="conflict.resolutionNote" class="block muted">裁决：{{ conflict.resolutionNote }}</small>
        </div>
        <h3>锁定器具台账</h3>
        <div class="tool"><span>LK-2107</span><b>WTG-03 · 周野</b></div>
        <div class="tool"><span>LK-2118</span><b>LINE-A2 · 待领用</b></div>
        <div class="tool"><span>GND-042</span><b>17 号杆 · 谭勇</b></div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.head{display:flex;justify-content:space-between;margin-bottom:18px}.head h1{margin:3px 0 7px}.head p{margin:0}.eyebrow{font-size:12px;color:#2563eb;font-weight:700}.device-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:16px}.device{padding:16px;cursor:pointer}.device.active{border-color:#2563eb;box-shadow:0 0 0 2px #dbeafe}.device h2{font-size:15px;margin:14px 0}.kv{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #edf0f5;font-size:13px}.kv span{color:#667085}.lower{grid-template-columns:1.3fr .7fr;gap:16px}.panel h2{font-size:17px;margin:0 0 14px}.point{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #edf0f5}.point>div:nth-child(2){flex:1}.point b,.point small{display:block}.point small{color:#667085;margin-top:4px}.lock-icon{display:grid;place-items:center;width:34px;height:34px;background:#eff6ff;color:#2563eb;border-radius:7px}.seg{display:inline-flex;border:1px solid #dfe5ec;border-radius:6px;overflow:hidden}.seg button{border:0;background:#fff;padding:4px 9px;font-size:11px;cursor:pointer;color:#667085}.seg button.on{background:#2563eb;color:#fff}.seg button:disabled{opacity:.45;cursor:not-allowed}.confirm-bar{display:flex;align-items:center;gap:12px;margin-top:14px}.confirm-bar .flex-1,.confirm-bar>div{flex:1}.cf{border:1px solid #e2e8f0;border-left:3px solid #ef4444;border-radius:7px;padding:9px 11px;margin-bottom:9px}.cf.已放行,.cf.已改期{border-left-color:#22c55e}.cf p{margin:5px 0 2px;font-size:13px}.cf small{font-size:12px;color:#667085}.empty{font-size:13px;padding:6px 0 12px}.panel h3{font-size:15px;margin:18px 0 10px}.tool{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #edf0f5}.tool span{color:#2563eb;font-family:monospace}.tool b{font-size:13px}
@media(max-width:1050px){.device-grid{grid-template-columns:1fr 1fr}.lower{grid-template-columns:1fr}}@media(max-width:600px){.head{flex-direction:column;gap:12px}.device-grid{grid-template-columns:1fr}}
</style>
