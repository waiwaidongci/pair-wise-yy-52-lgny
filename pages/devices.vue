<script setup lang="ts">
import { useOperationsStore } from '~/stores/operations'

const store = useOperationsStore()
await store.bootstrap()

const devices = computed(() => {
  const list = [
    { id: 'WTG-03', name: '3 号风力发电机组', baseLoad: '0 kW' },
    { id: 'LINE-A2', name: 'A2 集电线路', baseLoad: '0.8 MW' },
    { id: 'BOX-12', name: '12 号箱式变压器', baseLoad: '2.4 MW' },
    { id: 'BUS-A', name: 'A 段 35kV 母线', baseLoad: '18.6 MW' },
    { id: 'BOX-03', name: '3 号箱式变压器', baseLoad: '0 kW' },
  ]
  return list.map((device) => {
    const points = store.isolationPoints.filter((point) => point.device === device.id)
    const holders = [...new Set(store.permits.filter((permit) => permit.isolationPoints.some((point) => point.device === device.id) && !['已完成', '已驳回'].includes(permit.status)).map((permit) => permit.crew))]
    const isolated = points.some((point) => point.state === '已隔离')
    const pending = points.some((point) => point.state === '待操作')
    return {
      ...device,
      points: points.length,
      crew: holders.join('、') || '公用',
      state: isolated ? (pending ? '部分隔离' : '检修隔离') : '运行',
    }
  })
})

const selectedDevice = ref('WTG-03')
const selectedPoints = computed(() => store.isolationPoints.filter((point) => point.device === selectedDevice.value))
const selectedPermitIds = computed(() => new Set(
  store.permits.filter((permit) => permit.isolationPoints.some((point) => point.device === selectedDevice.value)).map((permit) => permit.id),
))
const pendingConflicts = computed(() => store.conflicts.filter((item) => item.status === '待值班负责人处理'))
const resolvedConflicts = computed(() => store.conflicts.filter((item) => item.status !== '待值班负责人处理'))

const boundaryModal = ref(false)
const boundaryForm = reactive({ pointId: '', device: '', label: '' })
function openBoundary(pointId: string) {
  const point = store.isolationPoints.find((item) => item.id === pointId)
  if (!point) return
  boundaryForm.pointId = point.id
  boundaryForm.device = point.device
  boundaryForm.label = point.label
  boundaryModal.value = true
}
async function submitBoundary() {
  await store.adjustBoundary(boundaryForm.pointId, { device: boundaryForm.device, label: boundaryForm.label })
  boundaryModal.value = false
}
</script>

<template>
  <div class="page">
    <div class="head"><div><p class="eyebrow">LOCKOUT / TAGOUT</p><h1 class="page-title">设备隔离与锁定点</h1><p class="muted">隔离点是全风场唯一台账：占用、冲突、边界版本与隔离确认均记账在服务端。</p></div><UBadge color="blue" variant="subtle">台账版本 r{{ store.revision }}</UBadge></div>
    <div class="device-grid">
      <article v-for="device in devices" :key="device.id" class="panel device" :class="{ active: selectedDevice === device.id }" @click="selectedDevice = device.id"><div class="inline justify-between"><UBadge variant="subtle">{{ device.id }}</UBadge><UBadge :color="device.state === '运行' ? 'green' : device.state.includes('隔离') ? 'red' : 'amber'" variant="subtle">{{ device.state }}</UBadge></div><h2>{{ device.name }}</h2><div class="kv"><span>当前负荷</span><b>{{ device.baseLoad }}</b></div><div class="kv"><span>隔离点</span><b>{{ device.points }} 个</b></div><div class="kv"><span>占用班组</span><b>{{ device.crew }}</b></div></article>
    </div>
    <section class="grid lower">
      <article class="panel p-4">
        <h2>{{ selectedDevice }} · 隔离检查单（统一台账）</h2>
        <div v-for="point in selectedPoints" :key="point.id" class="point">
          <div class="lock-icon"><UIcon name="i-heroicons-lock-closed" /></div>
          <div><b>{{ point.label }}</b><small>{{ point.type }} · {{ point.id }} · 边界 r{{ point.boundaryRevision }}</small><small v-if="point.confirmedBy">由 {{ point.confirmedBy }} 完成隔离确认</small></div>
          <UBadge :color="point.state === '已隔离' ? 'green' : 'amber'" variant="subtle">{{ point.state }}</UBadge>
          <UButton size="xs" variant="ghost" icon="i-heroicons-pencil-square" @click="openBoundary(point.id)">调整边界</UButton>
        </div>
        <UAlert v-if="!selectedPoints.length" color="gray" title="该设备暂无隔离点" description="新许可提交时会自动登记主隔离点。" />
        <div v-if="selectedPermitIds.size" class="mt-3">
          <small class="muted">当前关联许可：</small>
          <UBadge v-for="id in selectedPermitIds" :key="id" class="ml-2" color="blue" variant="subtle">{{ id }}</UBadge>
        </div>
      </article>
      <article class="panel p-4">
        <h2>跨班组冲突记账</h2>
        <UAlert v-if="!store.conflicts.length" color="green" variant="soft" icon="i-heroicons-shield-check" title="暂无冲突" description="班组提交重叠时段时会在此登记并冻结许可。" />
        <div v-for="conflict in pendingConflicts" :key="conflict.id" class="conflict-card">
          <div class="inline justify-between"><UBadge color="red" variant="subtle">{{ conflict.id }} 待处理</UBadge><small class="muted">{{ conflict.createdAt }}</small></div>
          <p><b>{{ conflict.device }}</b> · {{ conflict.pointLabel }}</p>
          <p class="muted">{{ conflict.incomingCrew }}（{{ conflict.incomingPermitId }}）在 {{ conflict.window }} 申请占用，与 {{ conflict.holderCrew }}（{{ conflict.holderPermitId }}）有效占用时段重叠</p>
          <div class="inline">
            <UButton size="xs" color="green" variant="soft" @click="store.resolveConflict(conflict.id, '允许继续', '同意按交接顺序错峰')">允许继续</UButton>
            <UButton size="xs" color="red" variant="ghost" @click="store.resolveConflict(conflict.id, '驳回', '重叠时段禁止同时占用')">驳回</UButton>
          </div>
        </div>
        <div v-for="conflict in resolvedConflicts" :key="conflict.id" class="conflict-card resolved">
          <div class="inline justify-between"><UBadge :color="conflict.status === '允许继续' ? 'green' : 'gray'" variant="subtle">{{ conflict.status }}</UBadge><small class="muted">{{ conflict.resolvedAt }} · {{ conflict.resolvedBy }}</small></div>
          <p class="muted">{{ conflict.incomingCrew }} vs {{ conflict.holderCrew }} · {{ conflict.device }}{{ conflict.resolution ? ` — ${conflict.resolution}` : '' }}</p>
        </div>
        <h3 class="mt-4">锁定器具台账</h3><div class="tool"><span>LK-2107</span><b>WTG-03 · 周野</b></div><div class="tool"><span>LK-2118</span><b>LINE-A2 · 待领用</b></div><div class="tool"><span>GND-042</span><b>17 号杆 · 谭勇</b></div>
      </article>
    </section>
    <UModal v-model="boundaryModal"><article class="p-5"><h2>调整隔离边界</h2><p class="muted">边界版本 +1 后，所有已经到隔离确认的旧许可自动回到重新复核，原步骤与审计仍可查看。</p><div class="form-grid"><UFormGroup label="设备编号"><UInput v-model="boundaryForm.device" /></UFormGroup><UFormGroup label="隔离点名称"><UInput v-model="boundaryForm.label" /></UFormGroup></div><div class="inline justify-end mt-4"><UButton color="gray" @click="boundaryModal = false">取消</UButton><UButton color="primary" @click="submitBoundary">保存新边界</UButton></div></article></UModal>
  </div>
</template>

<style scoped>
.head{display:flex;justify-content:space-between;margin-bottom:18px}.head h1{margin:3px 0 7px}.head p{margin:0}.eyebrow{font-size:12px;color:#2563eb;font-weight:700}.device-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:16px}.device{padding:16px;cursor:pointer}.device.active{border-color:#2563eb;box-shadow:0 0 0 2px #dbeafe}.device h2{font-size:16px;margin:14px 0}.kv{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #edf0f5;font-size:13px}.kv span{color:#667085}.lower{grid-template-columns:1.2fr .8fr;gap:16px}.panel h2{font-size:17px;margin:0 0 14px}.point{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #edf0f5}.point>div:nth-child(2){flex:1}.point b,.point small{display:block}.point small{color:#667085;margin-top:4px}.lock-icon{display:grid;place-items:center;width:34px;height:34px;background:#eff6ff;color:#2563eb;border-radius:7px}.conflict-card{border:1px solid #fecaca;background:#fef2f2;border-radius:8px;padding:11px;margin-bottom:10px}.conflict-card.resolved{background:#f8fafc;border-color:#e2e8f0}.conflict-card p{margin:6px 0;font-size:13px}.conflict-card .inline{margin-top:6px}.tool{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #edf0f5}.tool span{color:#2563eb;font-family:monospace}.tool b{font-size:13px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.mt-2{margin-top:8px}.mt-3{margin-top:12px}.mt-4{margin-top:16px}.ml-2{margin-left:8px}
@media(max-width:1200px){.device-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:1050px){.device-grid{grid-template-columns:1fr 1fr}.lower{grid-template-columns:1fr}}@media(max-width:600px){.head{flex-direction:column;gap:12px}.device-grid{grid-template-columns:1fr}.form-grid{grid-template-columns:1fr}}
</style>
