# still-sink · L3 沉水层

**来源**：本站自写。240 秒里用 `multiply` 把画面中间调慢慢压暗（最终 alpha 0.35），
读成「光被水吸收了」，不是「关灯」。

**装配前提**：它依赖 L0（`tide-medium`）每帧铺满不透明底。如果装到没有不透明 L0 的站，
`multiply` 会逐帧累加、越叠越黑；`E_NO_BASE` 只保证有 L0/L1，不保证 L0 不透明，这是站点装配的责任。

**关键文件**：`index.ts`（`costMs 0.6`、`expendable: true`、`SINK_SECONDS=240`）。
