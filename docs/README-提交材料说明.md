# 赛博答辩厅 · Defense Arena — 提交材料包

**2026 第九届传智杯全国大学生数智创新与AI应用大赛 · AI创新应用挑战赛（Vibe Coding 赛道）**
**选题方向**：① 多 Agent 协同工作流看板 × ② 场景化轻量 RAG 知识库（融合）
**作品一句话**：上传论文 PDF，五位 AI 评委（主席 + 4 位风格迥异的质询专家）在可视化沙盘上对 AI 答辩人展开全真模拟答辩，输出五维评分雷达与主席终评报告。

---

## 📦 本包内容清单

| # | 材料 | 位置 | 比赛要求对应 |
|---|---|---|---|
| 1 | 演示视频（MP4 · 1080p · 6分06秒 · 含配音字幕） | `演示视频-赛博答辩厅.mp4` | 5-8 分钟 + ≥2 分钟 AI 协同复现（3:10-5:25 段落） |
| 2 | 技术文档（PDF · 6 页） | `技术文档/技术文档.pdf` | ≤30 页；意图控制策略/架构设计/可复现性论证 |
| 3 | AI 对话历史快照（4 份完整 Prompt 迭代链 PDF + 索引） | `AI对话快照/` | ≥3 个核心功能迭代的完整 Prompt 链（含引导修 Bug 过程） |
| 4 | Prompt 演进日志（总览） | `AI对话快照/PROMPT_LOG.md` | 过程可复现性佐证 |
| 5 | 完整源码副本（不含 node_modules） | `源码/defense-arena/` | 离线评审备份 |

## 🔗 代码仓库（主提交渠道）

**https://github.com/fang020523-maker/defense-arena**（Public）

- 21 次细粒度 Git 提交，每次对应一个功能模块落地或一次与 AI 的核心交互（无一次性 initial commit）
- 十分钟极速复现指南见仓库 `README.md`（环境 / 依赖 / 环境变量模板 / 四步复现 / FAQ）
- 仓库自带示例论文（`public/sample-paper.pdf`）与测试语料，评委可零准备直接体验

## ⚡ 十分钟复现（摘要）

```bash
git clone https://github.com/fang020523-maker/defense-arena.git
cd defense-arena && npm install && npm run dev
# 打开 http://localhost:5173 → 填入自己的 DeepSeek API Key（platform.deepseek.com）
# 拖入任意文字版论文 PDF → 开始答辩
```

零付费依赖：唯一外部服务为 DeepSeek API（评委自备 Key 即可完整复现）。

## 🧪 可复现性佐证

- `npm run test:rag`：离线 RAG 管线验证（真实论文语料 + 异常 PDF 断言）
- `npm run mock:llm` + `DEEPSEEK_BASE_URL` 指向本地 Mock：零成本全流程端到端复现
- 演示视频中答辩环节为**真实 DeepSeek Key 驱动**的完整实录（85 秒全场）

---
*参赛者：fang020523-maker · 开发范式：Vibe Coding（人类定义问题与意图，AI 生成全部代码）*
