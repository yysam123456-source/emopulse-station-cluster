> ⛔ **已归档 · 2026-11-18 策略转向**
>
> 本文描述的是「站群（7 站 + 8 showcase 叠加）」旧方向。用户已明确推翻：
> 不做站群、改单域名按路径分站、不管 LICENSE、卖点是「多种效果叠加的复合页面」。
>
> **当前权威文档：[`docs/HANDOFF.md`](../../HANDOFF.md)**。本文保留只为追溯历史决策，**不要按它施工**。

# G2 系统设计 · 导航页

> 本团队阶段门 **G2** 的唯一架构交付物按 `docs/TEAM-SOP.md` §6 规定为 **`docs/ARCHITECTURE-NEXUS.md`**。
> 本文件仅作导航，**不含正文**，避免站群内出现两份互相冲突的架构文档。

| 内容 | 文件 |
| --- | --- |
| **系统设计 + 任务分解正文（v2.1，含主理人 D2 定点修订）** | [`ARCHITECTURE-NEXUS.md`](./ARCHITECTURE-NEXUS.md) |
| 类图（独立渲染） | [`class-diagram.mermaid`](./class-diagram.mermaid) |
| 时序图（独立渲染） | [`sequence-diagram.mermaid`](./sequence-diagram.mermaid) |
| 上游 PRD（G1） | [`PRD-NEXUS.md`](./PRD-NEXUS.md) |
| 协作规范（主理人） | [`TEAM-SOP.md`](./TEAM-SOP.md) |
| 原架构 v1.1（继承） | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| QA 基线（G4 输入） | [`QA-REPORT.md`](./QA-REPORT.md) |

## 正文结构速览

- Part A · 系统设计：§0 设计总纲 / §1 实现方案与 R1·R3·R4 裁决 / §2 架构不变量落地清单 / §3 分层架构与 ADR / §4 完整文件清单 / §5 数据结构与接口 / §6 程序调用流程
- Part B · 任务分解：§7 有序任务列表（T01~T05，按 PRD §8.2 序 S0~S9）/ §8 共享知识 K1~K18 / §9 依赖包 / §10 待明确 / §11 8 站 slug 表 / 附 A 追踪矩阵 / 附 B 准出自检

> 工程师（G3）请直接阅读 `ARCHITECTURE-NEXUS.md`；QA（G4）请以该文档 §2 与 §7.6 S9 硬门清单为验收索引。
