<script setup lang="ts">
import { useOperationsStore } from '~/stores/operations'
import type { Permit, PointState } from '~/types'

const store = useOperationsStore()
const route = useRoute()
const selectedId = ref(String(route.query.id || store.permits[0]?.id || ''))
const modal = ref(route.query.new === '1')
const historyOpen = ref(false)

const knownDevices = computed(() => store.devices.map((d) => d.id))
const form = reactive({
  title: '', device: '',
  deviceCodes: ['LINE-A2', 'BUS-A'] as string[],
  customCode: '',
  crew: '电气二班', owner: '孙禾',
  start: '2026-09-29T19:00', end: '2026-09-29T21:00',
  risk: '二级' as Permit['risk'],
})
const reschedule = reactive({ start: '2026-09-30T14:00', end: '2026-09-30T16:00' })
const addPoint = reactive({ open: false, device: 'BUS-A', label: '', type: '开关' as '开关' | '刀闸' | '阀门' | '接地' })

const selected = computed(() => store.permits.find((item) => item.id === selectedId.value) ?? store.permits[0])
const completed = computed(() => (selected.value ? Math.round((selected.value.steps.filter((step) => step.done).length / selected.value.steps.length) * 100) : 0))
const stageIndex = computed(() => ['待复核', '待执行', '执行中', '待结束', '待关闭', '已完成'].indexOf(selected.value?.status ?? ''))
const permitConflicts = computed(() => (selected.value ? store.conflicts.filter((c) => c.permitId === selected.value!.id) : []))
const unresolvedConflicts = computed(() => permitConflicts.value.filter((c) => c.status === '待处理' || c.status === '待改期'))
const canRecheck = computed(() => selected.value?.reviewRequired && !unresolvedConflicts.value.length)
const awaitingReschedule = computed(() => unresolvedConflicts.value.some((c) => c.status === '待改期'))

watch(() => route.query.id, (id) => { if (id) selectedId.value = String(id) })

function toggleDevice(code: string) {
  const index = form.deviceCodes.indexOf(code)
  if (index >= 0) form.deviceCodes.splice(index, 1)
  else form.deviceCodes.push(code)
}
async function createPermit() {
  const codes = [...new Set([...form.deviceCodes, form.customCode.trim()].filter(Boolean))]
  if (!form.title.trim() || !codes.length) return
  const result = await store.dispatch('submit-permit', {
    title: form.title,
    device: form.device.trim() || codes.join(' · '),
    deviceCodes: codes,
    crew: form.crew, owner: form.owner,
    windowStart: form.start, windowEnd: form.end, risk: form.risk,
  }, `提交许可 ${form.title}`)
  if (result.state && !result.queued) {
    const newest = result.state.permits[0]
    if (newest) selectedId.value = newest.id
  }
  modal.value = false
  form.title = ''
}
async function advance() {
  if (selected.value) await store.dispatch('advance-permit', { permitId: selected.value.id }, `推进 ${selected.value.id}`)
}
async function toggleStep(stepId: string) {
  if (selected.value) await store.dispatch('toggle-step', { permitId: selected.value.id, stepId }, '记录现场步骤')
}
async function setPoint(pointId: string, next: PointState) {
  if (selected.value) await store.dispatch('set-point-state', { permitId: selected.value.id, pointId, state: next }, `隔离操作 ${pointId}`)
}
async function recheck() {
  if (selected.value) await store.dispatch('recheck-permit', { permitId: selected.value.id }, `复核 ${selected.value.id}`)
}
async function doReschedule() {
  if (selected.value) await store.dispatch('reschedule-permit', { permitId: selected.value.id, windowStart: reschedule.start, windowEnd: reschedule.end }, `改期 ${selected.value.id}`)
}
async function removePoint(pointId: string) {
  if (!selected.value) return
  await store.dispatch('adjust-boundary', { permitId: selected.value.id, op: 'remove', pointId }, `移除隔离点 ${pointId}`)
}
async function addBoundaryPoint() {
  if (!selected.value || !addPoint.label.trim()) return
  await store.dispatch('adjust-boundary', { permitId: selected.value.id, op: 'add', device: addPoint.device, label: addPoint.label, pointType: addPoint.type }, '新增隔离点调整边界')
  addPoint.label = ''
  addPoint.open = false
}
</script>

<template>
  <div class="page">
    <div class="head"><div><p class="eyebrow">许可全生命周期 · 服务端统一流转</p><h1 class="page-title">作业许可证</h1><p class="muted">提交即按设备编码与时间窗记账占用；跨班组重叠自动登记冲突并挂起，值班负责人处理后才能继续。</p></div><UButton icon="i-heroicons-plus" color="primary" @click="modal = true">新建许可</UButton></div>
    <div class="permit-layout">
      <aside class="panel permit-list">
        <button v-for="permit in store.permits" :key="permit.id" :class="{ active: permit.id === selectedId }" @click="selectedId = permit.id"><span><b>{{ permit.id }}</b><small>{{ permit.title }} · r{{ permit.revision }}</small></span><UBadge :color="permit.reviewRequired ? 'red' : 'amber'" variant="subtle">{{ permit.reviewRequired ? '挂起' : permit.status }}</UBadge></button>
      </aside>
      <section v-if="selected" class="grid detail-grid">
        <article class="panel p-4">
          <div class="detail-head"><div><small class="muted">{{ selected.id }} · 修订 r{{ selected.revision }} · 创建 {{ selected.createdAt }}</small><h2>{{ selected.title }}</h2><p>{{ selected.deviceCodes.join('、') }} · {{ selected.window }}</p></div><UBadge size="lg" :color="selected.reviewRequired ? 'red' : 'green'" variant="subtle">{{ selected.reviewRequired ? '待复核（挂起）' : selected.status }}</UBadge></div>
          <div class="flow"><div v-for="(step, index) in ['申请', '复核', '执行', '结束', '关闭']" :key="step" :class="{ done: index <= Math.min(stageIndex, 4), current: index === stageIndex }"><i>{{ index + 1 }}</i><span>{{ step }}</span></div></div>

          <UAlert v-if="selected.reviewRequired" color="red" variant="soft" class="mb-3" icon="i-heroicons-shield-exclamation" :title="awaitingReschedule ? '值班负责人要求改期' : '许可挂起 · 待复核'" :description="selected.reviewReason || '存在未处理事项，复核前流程与现场步骤暂停。'" />

          <div v-for="conflict in permitConflicts" :key="conflict.id" class="conflict-line">
            <div class="inline justify-between wrap"><b>{{ conflict.id }} · {{ conflict.device }} 跨班组冲突</b><UBadge size="xs" :color="conflict.status === '待处理' ? 'red' : conflict.status === '待改期' ? 'amber' : 'green'" variant="subtle">{{ conflict.status }}</UBadge></div>
            <p class="muted">本许可 {{ conflict.crew }} 与已生效的 {{ conflict.holderCrew }} {{ conflict.holderPermitId }}（{{ conflict.holderTitle }}）冲突</p>
            <small>{{ conflict.overlapLabel }}</small>
            <div v-if="conflict.status === '待改期'" class="reschedule mt-2">
              <p class="muted">按值班负责人要求选择新窗口，重报后服务端重新做占用检查：</p>
              <div class="inline wrap">
                <input v-model="reschedule.start" type="datetime-local" class="dt" />
                <span>至</span>
                <input v-model="reschedule.end" type="datetime-local" class="dt" />
                <UButton size="sm" color="primary" @click="doReschedule">改期重报</UButton>
              </div>
            </div>
          </div>

          <div v-if="canRecheck" class="recheck-bar">
            <div class="flex-1"><UAlert color="amber" variant="soft" title="等待值班负责人重新复核" description="冲突已处理或边界变化已确认，复核通过后许可继续流转，原步骤与修订历史均保留。" /></div>
            <UButton color="primary" icon="i-heroicons-shield-check" :disabled="store.role !== '值班负责人'" @click="recheck">值班负责人复核通过</UButton>
          </div>

          <div class="inline justify-between"><h3>操作步骤</h3><UButton size="xs" variant="ghost" icon="i-heroicons-history" @click="historyOpen = !historyOpen">{{ historyOpen ? '收起修订历史' : `修订历史（${selected.history.length}）` }}</UButton></div>
          <div v-if="historyOpen" class="history">
            <div class="snap current"><b>当前版本 r{{ selected.revision }}（{{ selected.status }}）</b><small>{{ selected.window }}</small></div>
            <div v-for="snap in selected.history" :key="`${snap.revision}-${snap.at}`" class="snap">
              <div class="inline justify-between"><b>r{{ snap.revision }} · {{ snap.at }}</b><UBadge size="xs" variant="subtle">{{ snap.status }}</UBadge></div>
              <small class="block muted">{{ snap.reason }} · {{ snap.windowLabel }}</small>
              <ul>
                <li v-for="point in snap.isolationPoints" :key="point.id">{{ point.id }} {{ point.device }} {{ point.label }} · {{ point.state }}</li>
              </ul>
              <ul>
                <li v-for="step in snap.steps" :key="step.id" :class="{ undone: !step.done }">{{ step.done ? '✓' : '○' }} {{ step.text }}（{{ step.owner }}）</li>
              </ul>
            </div>
            <p v-if="!selected.history.length" class="muted">尚无历史修订；调整隔离边界或改期后，旧版步骤与隔离点会归档于此，审计时间线同步可查。</p>
          </div>
          <div v-for="step in selected.steps" :key="step.id" class="step"><UCheckbox :model-value="step.done" :disabled="selected.reviewRequired" @update:model-value="toggleStep(step.id)" /><div><b :class="{ completed: step.done }">{{ step.text }}</b><small>责任人 {{ step.owner }} · {{ step.evidence || '尚未上传证据' }}</small></div><UButton size="xs" variant="ghost" icon="i-heroicons-camera">证据</UButton></div>
          <UProgress :value="completed" class="mt-4" /><div class="inline justify-between mt-1"><span class="muted">步骤完成度</span><b>{{ completed }}%</b></div>
        </article>
        <aside class="grid right">
          <article class="panel p-4">
            <div class="inline justify-between"><h3>隔离点与锁定（统一台账）</h3><UButton size="xs" variant="ghost" icon="i-heroicons-plus" :disabled="selected.reviewRequired || selected.status === '已完成'" @click="addPoint.open = !addPoint.open">调整边界</UButton></div>
            <div v-if="addPoint.open" class="add-point">
              <p class="muted">边界调整后，已到隔离确认且共用该设备的许可将被回退复核。</p>
              <select v-model="addPoint.device" class="dt full"><option v-for="code in knownDevices" :key="code" :value="code">{{ code }}</option></select>
              <UInput v-model="addPoint.label" placeholder="隔离点名称，如 线路侧接地刀闸" size="sm" />
              <select v-model="addPoint.type" class="dt full"><option>开关</option><option>刀闸</option><option>阀门</option><option>接地</option></select>
              <UButton size="xs" color="primary" :disabled="!addPoint.label" @click="addBoundaryPoint">新增并调整边界</UButton>
            </div>
            <div v-for="point in selected.isolationPoints" :key="point.id" class="point">
              <span><b>{{ point.label }}</b><small>{{ point.device }} · {{ point.type }} · {{ point.id }}</small></span>
              <div class="point-actions">
                <UBadge :color="point.state === '已隔离' ? 'green' : point.state === '已恢复' ? 'gray' : 'amber'" variant="subtle">{{ point.state }}</UBadge>
                <div class="seg">
                  <button :class="{ on: point.state === '待操作' }" :disabled="selected.reviewRequired" @click="setPoint(point.id, '待操作')">待操作</button>
                  <button :class="{ on: point.state === '已隔离' }" :disabled="selected.reviewRequired" @click="setPoint(point.id, '已隔离')">隔离</button>
                  <button :class="{ on: point.state === '已恢复' }" :disabled="selected.reviewRequired" @click="setPoint(point.id, '已恢复')">恢复</button>
                </div>
                <UButton v-if="selected.status !== '已完成' && !selected.reviewRequired" size="xs" color="red" variant="ghost" icon="i-heroicons-trash" @click="removePoint(point.id)" />
              </div>
            </div>
          </article>
          <article class="panel p-4"><h3>流程操作</h3><p class="muted">推进前服务端重新检查隔离到位情况、跨班组占用与未决事项；隔离点全部到位方可由“待执行”进入“执行中”。</p><UButton block color="primary" icon="i-heroicons-arrow-right-circle" :disabled="selected.reviewRequired || selected.status === '已完成'" @click="advance">推进到下一状态</UButton><p v-if="selected.reviewRequired" class="muted block mt-2">当前许可挂起中：冲突由值班负责人在台账裁决，或由负责人完成复核后自动解锁。</p></article>
        </aside>
      </section>
    </div>
    <UModal v-model="modal"><article class="p-5 modal-inner"><h2>申请作业许可</h2><p class="muted">提交时服务端即按“设备编码 × 时间窗”校验占用；与已生效许可重叠将登记跨班组冲突并挂起。</p><div class="form-grid"><UFormGroup label="作业名称"><UInput v-model="form.title" placeholder="如 A2 线路避雷器消缺" /></UFormGroup><UFormGroup label="负责人 / 班组"><div class="inline"><UInput v-model="form.owner" /><UInput v-model="form.crew" /></div></UFormGroup><UFormGroup label="占用设备（可多选）"><div class="codes"><label v-for="code in knownDevices" :key="code" class="code-chip" :class="{ on: form.deviceCodes.includes(code) }"><input type="checkbox" :checked="form.deviceCodes.includes(code)" @change="toggleDevice(code)" />{{ code }}</label><UInput v-model="form.customCode" placeholder="其他设备编码" size="sm" class="custom-code" /></div></UFormGroup><UFormGroup label="设备展示名（可选）"><UInput v-model="form.device" placeholder="默认使用设备编码" /></UFormGroup><UFormGroup label="开始时间"><input v-model="form.start" type="datetime-local" class="dt full" /></UFormGroup><UFormGroup label="结束时间"><input v-model="form.end" type="datetime-local" class="dt full" /></UFormGroup><UFormGroup label="风险等级"><USelect v-model="form.risk" :options="['一级', '二级', '三级']" /></UFormGroup></div><div class="inline justify-end mt-4"><UButton color="gray" @click="modal = false">取消</UButton><UButton color="primary" :disabled="!form.title || (!form.deviceCodes.length && !form.customCode.trim())" @click="createPermit">提交校验</UButton></div></article></UModal>
  </div>
</template>

<style scoped>
.head{display:flex;justify-content:space-between;gap:16px;margin-bottom:18px}.head h1{margin:3px 0 7px}.head p{margin:0}.eyebrow{font-size:12px;color:#2563eb;font-weight:700}.permit-layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px}.permit-list{padding:8px;height:fit-content;max-height:calc(100vh - 130px);overflow:auto}.permit-list button{width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:13px 11px;border:0;background:transparent;border-radius:7px;text-align:left;color:inherit;cursor:pointer}.permit-list button:hover,.permit-list button.active{background:#eff6ff}.permit-list b,.permit-list small{display:block}.permit-list small{color:#667085;margin-top:4px;font-size:12px}.detail-grid{grid-template-columns:minmax(0,1.5fr) minmax(300px,.7fr);gap:16px}.right{height:fit-content;gap:14px}.detail-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:16px}.detail-head h2{margin:4px 0}.detail-head p{margin:0;color:#667085}.flow{display:grid;grid-template-columns:repeat(5,1fr);margin:20px 0}.flow>div{position:relative;text-align:center;color:#94a3b8}.flow>div:after{content:"";position:absolute;left:55%;right:-45%;top:13px;height:2px;background:#e2e8f0}.flow>div:last-child:after{display:none}.flow i{position:relative;z-index:1;display:grid;place-items:center;width:28px;height:28px;margin:auto;border-radius:50%;background:#e2e8f0;font-style:normal;font-size:12px}.flow span{display:block;font-size:12px;margin-top:5px}.flow .done{color:#2563eb}.flow .done i{background:#2563eb;color:#fff}.flow .done:after{background:#2563eb}.panel h3{font-size:15px;margin:18px 0 10px}.step{display:flex;align-items:flex-start;gap:10px;padding:12px 0;border-bottom:1px solid #edf0f5}.step div{flex:1}.step small{display:block;color:#667085;margin-top:4px}.step .completed{text-decoration:line-through;color:#667085}.point{display:flex;justify-content:space-between;gap:8px;padding:11px 0;border-bottom:1px solid #edf0f5}.point b,.point small{display:block}.point small{color:#667085;margin-top:4px}.point-actions{display:flex;flex-direction:column;align-items:flex-end;gap:5px}.seg{display:inline-flex;border:1px solid #dfe5ec;border-radius:6px;overflow:hidden}.seg button{border:0;background:#fff;padding:3px 8px;font-size:11px;cursor:pointer;color:#667085}.seg button.on{background:#2563eb;color:#fff}.seg button:disabled{opacity:.45;cursor:not-allowed}.conflict-line{border:1px solid #fecaca;background:#fef2f2;border-radius:8px;padding:10px 12px;margin:8px 0}.conflict-line p{margin:5px 0;font-size:13px}.conflict-line small{font-size:12px;color:#92400e}.reschedule .dt{padding:5px 8px;border:1px solid #dfe5ec;border-radius:6px}.recheck-bar{display:flex;align-items:center;gap:12px;justify-content:space-between;margin:10px 0;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px}.recheck-bar .n-alert{flex:1}.history{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:8px;max-height:280px;overflow:auto}.snap{padding:8px 0;border-bottom:1px dashed #cbd5e1}.snap:last-child{border-bottom:0}.snap.current{background:#eff6ff;border-radius:6px;padding:8px}.snap ul{margin:6px 0 0;padding-left:18px;font-size:12px;color:#475569}.snap ul li.undone{color:#94a3b8}.add-point{display:grid;gap:7px;border:1px dashed #cbd5e1;border-radius:7px;padding:9px;margin-bottom:8px;background:#f8fafc}.codes{display:flex;flex-wrap:wrap;gap:6px}.code-chip{display:inline-flex;align-items:center;gap:4px;border:1px solid #dfe5ec;border-radius:999px;padding:4px 10px;font-size:12px;cursor:pointer;background:#fff}.code-chip.on{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.custom-code{max-width:150px}.dt{padding:6px 8px;border:1px solid #dfe5ec;border-radius:6px;font-size:13px}.dt.full{width:100%}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.mt-2{margin-top:8px}.mt-1{margin-top:6px}.block{display:block}.modal-inner{min-width:560px}
@media(max-width:980px){.permit-layout{grid-template-columns:1fr}.permit-list{display:flex;overflow:auto;max-height:none}.permit-list button{min-width:230px}.detail-grid{grid-template-columns:1fr}}@media(max-width:620px){.head{flex-direction:column}.form-grid{grid-template-columns:1fr}.modal-inner{min-width:0}}
</style>
