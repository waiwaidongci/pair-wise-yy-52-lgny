# 风电场检修隔离与作业许可协调平台

源提示词编号：9。覆盖风机、箱变和线路隔离点、锁定与验电步骤、作业许可状态流、跨班组冲突检测、实时提醒、断线重连、失败操作重试和审计记录。

## 技术栈

Nuxt 3、Nuxt UI、Pinia、Nuxt Router、TanStack Query、ofetch、WebSocket 模拟、TypeScript。

## 运行

```bash
npm install
npm run dev
```

开发地址：http://localhost:62052

```bash
npm run build
node .output/server/index.mjs
```

## 服务端统一账本

许可流转、隔离点、跨班组冲突、审计记录同源存放于 Nitro 内存账本（`server/utils/ledger.ts`），
启动时载入 `server/utils/seed.ts` 中的演示数据（含进行中许可、挂起冲突、边界修订历史）。

- `GET /api/state`：账本只读快照（许可 / 冲突 / 审计 / 设备 / 版本号 / 去重计数）。
- `POST /api/action`：所有写操作的唯一入口，负载为 `ActionEnvelope`，必须带稳定 `opId`。
  - 同一 `opId` 只在首次产生业务变化与一条审计；断线补传、手动重放命中时返回 `duplicate: true`，账本版本与审计均不变。
  - 动作类型：`submit-permit`、`advance-permit`、`toggle-step`、`set-point-state`、`resolve-conflict`、`reschedule-permit`、`adjust-boundary`、`recheck-permit`。

### 关键规则

- **占用与冲突**：处于「待执行 / 执行中 / 待结束 / 待关闭」的许可按“设备编码 × 时间窗”占用设备；
  新提交（或推进复查）与已生效许可重叠即登记冲突，许可挂起；值班负责人可放行或要求改期，处理完成后申请班组才能继续。
- **隔离确认**：待执行许可的全部隔离点须为「已隔离」才能进入执行中。
- **边界调整复核**：调整隔离边界会归档当前修订快照（旧步骤、隔离点仍可查看）；
  已到隔离确认且共用该设备边界的许可自动回退至待复核，值班负责人复核通过前步骤与流程暂停。
- **审计**：所有写操作（含系统登记的冲突与复核触发）在同一审计时间线留痕，可按许可过滤。
- **断线**：顶栏可模拟断线，离线操作进入本地补传队列；上线后按原 `opId` 重放，服务端幂等去重（“重复补传验证”按钮可重放整批操作验证只产生一次变化）。
