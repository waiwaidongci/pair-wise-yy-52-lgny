<script setup lang="ts">
import { useOperationsStore } from '~/stores/operations'
import type { Permit } from '~/types'

const store = useOperationsStore()
await store.bootstrap()
const route = useRoute()
const selectedId = ref(String(route.query.id || store.permits[0]?.id))
const modal = ref(route.query.new === '1')
const form = reactive({ title: '', device: '', crew: '电气一班', owner: '孙禾', window: '09-30 08:00 — 12:00', risk: '二级' as Permit['risk'] })
const selected = computed(() => store.permits.find((item) => item.id === selectedId.value) ?? store.permits[0])
const completed = computed(() => selected.value ? Math.round(selected.value.steps.filter((step) => step.done).length / selected.value.steps.length * 100) : 0)
const statusIndex = computed(() => ['待复核', '待执行', '执行中', '待结束', '待关闭', '已完成'].indexOf(selected.value?.status ?? ''))

const blockingConflicts = computed(() => selected.value
  ? store.conflicts.filter((conflict) => conflict.incomingPermitId === selected.value!.id && conflict.status === '待值班负责人处理')
  : [])

const historyOpen = ref(false)
const snapshotId = ref('')
const snapshotEntry = computed(() => selected.value?.history.find((entry) => entry.id === snapshotId.value))

const boundaryModal = ref(false)
const boundaryForm = reactive({ pointId: '', device: '', label: '' })
function openBoundary(pointId: string) {
  const point = selected.value?.isolationPoints.find((item) => item.id === pointId)
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

async function createPermit() {
  if (!form.title.trim() || !form.device.trim()) return
  const result = await store.addPermit({ ...form })
  if (result.ok) {
    const permit = result.state.permits[0]
    selectedId.value = permit.id
    modal.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="head"><div><p class="eyebrow">许可全生命周期</p><h1 class="page-title">作业许可证</h1><p class="muted">申请、占用校验、复核、执行与关闭全部走服务端统一台账；每一步留存负责人、时间与边界版本。</p></div><UButton icon="i-heroicons-plus" color="primary" @click="modal = true">新建许可</UButton></div>
    <div class="permit-layout">
      <aside class="panel permit-list">
        <button v-for="permit in store.permits" :key="permit.id" :class="{ active: permit.id === selectedId }" @click="selectedId = permit.id"><span><b>{{ permit.id }}</b><small>{{ permit.title }}</small></span>
          <UBadge v-if="permit.blockedByConflict" color="red" variant="subtle">冲突冻结</UBadge>
          <UBadge v-else-if="permit.reviewRequired" color="orange" variant="subtle">待复核</UBadge>
          <UBadge v-else color="amber" variant="subtle">{{ permit.status }}</UBadge>
        </button>
      </aside>
      <section v-if="selected" class="grid detail-grid">
        <article class="panel p-4">
          <div class="detail-head"><div><small class="muted">{{ selected.id }} · 修订 r{{ selected.revision }}</small><h2>{{ selected.title }}</h2><p>{{ selected.device }} · {{ selected.window }}</p></div><UBadge size="lg" :color="selected.blockedByConflict || selected.reviewRequired ? 'red' : 'green'" variant="subtle">{{ selected.blockedByConflict ? '冲突冻结' : selected.reviewRequired ? '待重新复核' : selected.status }}</UBadge></div>
          <div class="flow"><div v-for="(step,index) in ['申请','复核','执行','结束','关闭']" :key="step" :class="{ done: index <= statusIndex && statusIndex >= 0, current: index === statusIndex }"><i>{{ index + 1 }}</i><span>{{ step }}</span></div></div>

          <UAlert v-if="selected.blockedByConflict" color="red" variant="soft" class="mb-3" icon="i-heroicons-no-symbol" title="跨班组占用冲突：许可已冻结" :description="`提交重叠时段时设备已被有效许可占用，需值班负责人处理后才能继续。涉及 ${blockingConflicts.map((c) => c.device).join('、')}`">
            <template #actions>
              <div class="inline">
                <UButton size="xs" color="green" variant="soft" v-for="conflict in blockingConflicts" :key="conflict.id" @click="store.resolveConflict(conflict.id, '允许继续', '值班负责人协调错峰后放行')">放行 {{ conflict.device }}</UButton>
                <UButton size="xs" color="red" variant="ghost" v-if="blockingConflicts[0]" @click="store.resolveConflict(blockingConflicts[0].id, '驳回', '请调整时间窗后重新提交')">驳回申请</UButton>
              </div>
            </template>
          </UAlert>
          <UAlert v-else-if="selected.reviewRequired" color="orange" variant="soft" class="mb-3" icon="i-heroicons-arrow-path-rounded-square" title="隔离边界已调整：旧许可需重新复核" :description="selected.reReviewReason || '共用隔离点边界发生变化，原隔离确认已失效，值班负责人复核前不能继续推进；原步骤与审计仍可查看。'">
            <template #actions>
              <UButton size="xs" color="primary" variant="soft" icon="i-heroicons-check-badge" @click="store.reReviewPermit(selected.id)">值班负责人复核通过</UButton>
            </template>
          </UAlert>

          <h3>操作步骤</h3>
          <div v-for="step in selected.steps" :key="step.id" class="step">
            <UCheckbox :model-value="step.done" @update:model-value="store.toggleStep(selected.id, step.id)" />
            <div><b :class="{ completed: step.done }">{{ step.text }}</b><small>责任人 {{ step.owner }} · {{ step.evidence || '尚未上传证据' }}<template v-if="step.boundaryRevision"> · 完成于边界 r{{ step.boundaryRevision }}</template></small></div>
            <UButton size="xs" variant="ghost" icon="i-heroicons-camera">证据</UButton>
          </div>
          <UProgress :value="completed" class="mt-4" /><div class="inline justify-between mt-1"><span class="muted">步骤完成度</span><b>{{ completed }}%</b></div>

          <div class="history-head"><h3>版本步骤与审计快照</h3><UButton size="xs" variant="outline" icon="i-heroicons-queue-list" @click="historyOpen = !historyOpen">{{ historyOpen ? '收起' : `查看 ${selected.history.length} 个版本` }}</UButton></div>
          <div v-if="historyOpen" class="history">
            <button v-for="entry in [...selected.history].reverse()" :key="entry.id" :class="{ active: snapshotId === entry.id }" @click="snapshotId = entry.id">
              <b>r{{ entry.revision }} · {{ entry.action }}</b><small>{{ entry.time }} · {{ entry.actor }} — {{ entry.detail }}</small>
            </button>
            <div v-if="snapshotEntry" class="snapshot">
              <p class="muted">快照 r{{ snapshotEntry.revision }}（{{ snapshotEntry.action }}）时的原始步骤与隔离边界：</p>
              <div v-for="s in snapshotEntry.steps" :key="s.id" class="snap-row"><UIcon :name="s.done ? 'i-heroicons-check-circle' : 'i-heroicons-circle-dashed'" :class="s.done ? 'success' : 'muted'" /><span>{{ s.text }}</span><UBadge size="xs" :color="s.done ? 'green' : 'gray'" variant="subtle">{{ s.done ? `已完成${s.boundaryRevision ? ` · r${s.boundaryRevision}` : ''}` : '未完成' }}</UBadge></div>
              <div v-for="p in snapshotEntry.isolationPoints" :key="p.id" class="snap-row"><UIcon name="i-heroicons-lock-closed" class="muted" /><span>{{ p.device }} · {{ p.label }}</span><UBadge size="xs" color="gray" variant="subtle">边界 r{{ p.boundaryRevision }} · {{ p.state }}</UBadge></div>
            </div>
            <UAlert v-else color="gray" variant="soft" title="选择一个版本查看当时的步骤与隔离边界快照" />
          </div>
        </article>
        <aside class="grid right">
          <article class="panel p-4">
            <h3>隔离点与锁定 <small class="muted">（服务端统一台账）</small></h3>
            <div v-for="point in selected.isolationPoints" :key="point.id" class="point">
              <span><b>{{ point.label }}</b><small>{{ point.device }} · {{ point.type }} · {{ point.id }}</small><small>隔离边界 r{{ point.boundaryRevision }}<template v-if="point.confirmedBy"> · 由 {{ point.confirmedBy }} 确认</template></small></span>
              <div class="point-actions">
                <UBadge :color="point.state === '已隔离' ? 'green' : 'amber'" variant="subtle">{{ point.state }}</UBadge>
                <UButton v-if="point.state !== '已隔离'" size="xs" variant="soft" icon="i-heroicons-lock-closed" @click="store.confirmIsolation(selected.id, point.id)">隔离确认</UButton>
                <UButton size="xs" variant="ghost" icon="i-heroicons-pencil-square" @click="openBoundary(point.id)">调整边界</UButton>
              </div>
            </div>
          </article>
          <article class="panel p-4"><h3>流程操作</h3><p class="muted">推进前服务端重新检查隔离冲突、跨班组重叠与边界复核状态。</p>
            <UButton block color="primary" icon="i-heroicons-arrow-right-circle" :disabled="selected.blockedByConflict || selected.reviewRequired || selected.status === '已完成' || selected.status === '已驳回'" @click="store.advancePermit(selected.id)">推进到下一状态</UButton>
            <p v-if="selected.blockedByConflict" class="hint danger">冲突冻结中：值班负责人处理后才能继续</p>
            <p v-else-if="selected.reviewRequired" class="hint warning">边界调整后须重新复核</p>
            <UButton block class="mt-2" color="gray" variant="outline" icon="i-heroicons-arrow-uturn-left">退回补件</UButton><UButton block class="mt-2" color="red" variant="soft" icon="i-heroicons-exclamation-triangle">申请紧急暂停</UButton></article>
        </aside>
      </section>
    </div>
    <UModal v-model="modal"><article class="p-5"><h2>申请作业许可</h2><p class="muted">提交即按服务端占用台账校验：设备被有效许可占用且时间窗重叠、班组不同，将登记冲突并冻结。</p><div class="form-grid"><UFormGroup label="作业名称"><UInput v-model="form.title" /></UFormGroup><UFormGroup label="设备编号（如 WTG-03）"><UInput v-model="form.device" /></UFormGroup><UFormGroup label="班组"><UInput v-model="form.crew" /></UFormGroup><UFormGroup label="负责人"><UInput v-model="form.owner" /></UFormGroup><UFormGroup label="计划窗口（09-29 14:00 — 16:00）"><UInput v-model="form.window" /></UFormGroup><UFormGroup label="风险等级"><USelect v-model="form.risk" :options="['一级','二级','三级']" /></UFormGroup></div><div class="inline justify-end mt-4"><UButton color="gray" @click="modal = false">取消</UButton><UButton color="primary" :disabled="!form.title || !form.device" @click="createPermit">提交复核</UButton></div></article></UModal>
    <UModal v-model="boundaryModal"><article class="p-5"><h2>调整隔离边界</h2><p class="muted">保存后该隔离点边界版本 +1，所有已经到隔离确认的旧许可将回到重新复核；原步骤、证据与审计快照保留可查。</p><div class="form-grid"><UFormGroup label="设备编号"><UInput v-model="boundaryForm.device" /></UFormGroup><UFormGroup label="隔离点名称"><UInput v-model="boundaryForm.label" /></UFormGroup></div><div class="inline justify-end mt-4"><UButton color="gray" @click="boundaryModal = false">取消</UButton><UButton color="primary" :disabled="!boundaryForm.device && !boundaryForm.label" @click="submitBoundary">保存新边界</UButton></div></article></UModal>
  </div>
</template>

<style scoped>
.head{display:flex;justify-content:space-between;gap:16px;margin-bottom:18px}.head h1{margin:3px 0 7px}.head p{margin:0}.eyebrow{font-size:12px;color:#2563eb;font-weight:700}.permit-layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px}.permit-list{padding:8px;height:fit-content}.permit-list button{width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:13px 11px;border:0;background:transparent;border-radius:7px;text-align:left;color:inherit;cursor:pointer}.permit-list button:hover,.permit-list button.active{background:#eff6ff}.permit-list b,.permit-list small{display:block}.permit-list small{color:#667085;margin-top:4px;font-size:12px}.detail-grid{grid-template-columns:minmax(0,1.5fr) minmax(300px,.7fr);gap:16px}.right{height:fit-content;gap:14px}.detail-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:16px}.detail-head h2{margin:4px 0}.detail-head p{margin:0;color:#667085}.flow{display:grid;grid-template-columns:repeat(5,1fr);margin:20px 0}.flow>div{position:relative;text-align:center;color:#94a3b8}.flow>div:after{content:"";position:absolute;left:55%;right:-45%;top:13px;height:2px;background:#e2e8f0}.flow>div:last-child:after{display:none}.flow i{position:relative;z-index:1;display:grid;place-items:center;width:28px;height:28px;margin:auto;border-radius:50%;background:#e2e8f0;font-style:normal;font-size:12px}.flow span{display:block;font-size:12px;margin-top:5px}.flow .done{color:#2563eb}.flow .done i{background:#2563eb;color:#fff}.flow .done:after{background:#2563eb}.panel h3{font-size:15px;margin:18px 0 10px}.step{display:flex;align-items:flex-start;gap:10px;padding:12px 0;border-bottom:1px solid #edf0f5}.step div{flex:1}.step small{display:block;color:#667085;margin-top:4px}.step .completed{text-decoration:line-through;color:#667085}.point{display:flex;justify-content:space-between;gap:10px;padding:11px 0;border-bottom:1px solid #edf0f5}.point b,.point small{display:block}.point small{color:#667085;margin-top:4px}.point-actions{display:flex;flex-direction:column;align-items:flex-end;gap:5px}.hint{font-size:12px;margin:8px 0 0}.history-head{display:flex;align-items:center;justify-content:space-between;margin-top:20px}.history-head h3{margin:0}.history button{display:block;width:100%;text-align:left;border:0;background:#f8fafc;border:1px solid #e8edf4;border-radius:7px;padding:9px 11px;margin-bottom:7px;cursor:pointer}.history button.active,.history button:hover{background:#eff6ff;border-color:#bfdbfe}.history b,.history small{display:block}.history small{color:#667085;font-size:12px;margin-top:3px}.snapshot{border:1px dashed #cbd5e1;border-radius:8px;padding:12px;margin-bottom:10px}.snap-row{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px}.snap-row span{flex:1}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.mt-2{margin-top:8px}.mb-3{margin-bottom:12px}
@media(max-width:980px){.permit-layout{grid-template-columns:1fr}.permit-list{display:flex;overflow:auto}.permit-list button{min-width:230px}.detail-grid{grid-template-columns:1fr}}@media(max-width:620px){.head{flex-direction:column}.form-grid{grid-template-columns:1fr}}
</style>
