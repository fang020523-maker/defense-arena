# PROMPT_LOG · AI 协同开发演进日志

> 本作品在 **Vibe Coding** 范式下完成：人类负责定义问题、意图描述、架构决策与验收引导，AI（Claude/ZCode Agent，模型 GLM）负责代码生成、Bug 修复与重构。
> 本日志记录 ≥5 条核心功能迭代链，每条链包含：**人类意图 Prompt → AI 实现 → 暴露的问题 → 引导修复 → 对应 Git 提交**，与仓库提交历史一一对应，全程可复现。

---

## 迭代链 0 · 立项与选题决策

**人类意图：**

> 「这是比赛页面（saikr.com/vse/2026AICXYY），有十个选题。做一个高大上的，符合城市场景或者选题2/选题4、或和高校相关的方向，先给我 5 个主题选。」
> （二轮收敛）「1 和 2 哪个好做？要求不需要额外开各种环境的会员。」

**AI 响应：**

1. 抓取比赛页面全文，提炼评分标准（可复现 25% / 实用 25% / 创新 20% / 工程 15% / 体验 15%）与交付物清单
2. 输出 5 个候选主题并对拍，分析「文脉 RAG」依赖 Embedding API（DeepSeek 无此能力）而「赛博答辩厅」仅需 Chat API → 推荐后者
3. 给出技术选型对比表：主题① 仅需 1 个 API Key、零付费服务、全场独一份

**人类决策：** 确认主题①「赛博答辩厅」，声明已有 DeepSeek API Key，目标「省赛→国赛全程」。

**产出：** 完整作战计划（3 天冲刺排期 + 交付物清单）。

---

## 迭代链 1 · DeepSeek 流式代理服务（server/index.mjs）

**人类意图：**

> 「搭好前后端骨架。后端做一个 Express 代理把 DeepSeek 的 SSE 流原样转发给前端，API Key 让用户在前端填自己的，服务端只做白名单透传，不要把我的 Key 硬编码。」

**AI 首版实现：** `POST /api/chat` 抓取上游 `fetch` → 逐块 `res.write()` 转发；Key 来源：请求头 `x-api-key` > 环境变量。

**暴露的问题（人类验收引导）：**

> 「评分环节要模型输出严格 JSON，前端要传 response_format，另外评委输出偶尔会带 ```json 包裹，双端都要兜住。」

**AI 修复迭代：**

- 服务端白名单增加 `response_format`（仅放行 `{type:'json_object'}`），防止请求体注入
- 上游 401/402/429 错误码翻译为中文提示（「余额不足」「触发限流」等），在流开始前以 JSON 返回
- 前端 `extractJson()` 容忍 Markdown 代码块包裹与前后杂质，`lastIndexOf('}')` 截取后 `JSON.parse`

**对应提交：** `fb4c188 feat(server)` · 后续 `f5ec24f feat(agents)` 内含 JSON 白名单补充。

---

## 迭代链 2 · RAG 管线：PDF 抽取 → 分块 → BM25

**人类意图：**

> 「论文解析全部在浏览器本地做（隐私卖点），不要向量数据库、不要 Embedding API——DeepSeek 没有 embedding 接口，检索就用轻量 BM25，中文分词你自己设计。加密 PDF 和扫描版要给友好报错。」

**AI 首版实现：** pdf.js 逐页 `getTextContent` → 段落聚合分块（600 字 + 80 重叠，保留页码）→ BM25（中文二元词组 + 英文词级 + 停用词）。

**暴露的问题（真实 Bug 链）：**

1. **API 版本差异**：首版写 `doc.destroy()`，但 pdfjs-dist v6 类型已移除该方法 → 编译报 `TS2339`
   **修复 Prompt（人类引导）：**「看下 pdfjs v6 的类型定义，用 loadingTask 生命周期管理」→ 改为持有 `loadingTask` 引用并 `await loadingTask.destroy()`
2. **TS 严格模式**：`erasableSyntaxOnly` 禁止构造器参数属性 → `constructor(private chunks)` 报 `TS1294`，改为显式字段声明
3. **标题识别误判**：端到端测试时 arXiv 论文标题被识别为版权行 "scholarly works."
   **修复：** 启发式增加垃圾行过滤（copyright/arxiv/distributed under/小写开头行），改为识别出 "Attention Is All You Need"

**验证方式：** 浏览器内注入 `public/sample-paper.pdf` → 成功显示「15 页 / 39.6 千字 / 83 检索块 / ✓ 索引就绪」。

**对应提交：** `bb8e225 feat(rag)` · 标题修复随 `docs` 提交。

---

## 迭代链 3 · 多智能体编排引擎（agents/）

**人类意图：**

> 「五位评委要有真实人格差异，问题必须锚定论文真实内容不许编造；评委要能看到彼此的问答记录、不许问重复问题；压力模式下末轮要有连环追问。评分用 JSON 模式，主席最后写一份结构化终评报告。全程流式，中途可以中止并直接跳去评分。」

**AI 实现要点：**

- `roles.ts`：四位评委覆盖正交评审维度（方法严谨/表达理解/落地价值/前沿创新），System Prompt 含「提问纪律」五条（锚定真实/一次一问/禁止重复/联动深挖/直入主题）+ 压力模式条件分支
- `engine.ts`：状态机 `开场 → N轮×4评委质询 → (压力追问) → JSON评分 → 主席终评`；每步 BM25 检索 Top-4 片段注入上下文；答辩记录压缩至 2.8K 字符防上下文爆炸
- 网络类错误自动重试一次（Key 类错误不重试）

**暴露的问题（真实 Bug 链）：**

1. 首版 `askJudge` 返回 `Promise<void>`，主循环却写 `const q = await askJudge(...); if (!q) continue` → `TS1345`（void 不可判真）
   **修复：** 签名改为 `Promise<ArenaMessage | null>`，直接返回 `streamToMessage` 的结果
2. 点击「开始答辩」后画布切换有白屏间隙——因为 `phase` 要等 `runOpening` 才更新
   **修复：** 引擎启动时的初始 patch 立即置 `phase: 'opening'`，UI 无缝切换

**对应提交：** `f5ec24f feat(agents)`。

---

## 迭代链 4 · 沙盘画布与消息流（React Flow）

**人类意图：**

> 「画布要一眼震撼：答辩人居中、评委环绕、主席居上；谁在说话谁的边就发光流动（质询用评委色、答辩用青色回流）；节点上能看到发言预览和流式光标；右侧消息流自动滚底但别打扰用户手动上翻。」

**AI 实现要点：**

- 自定义 `AgentNode`（framer-motion 布局动画 + 状态徽标 thinking/speaking/done + 60 字预览）
- 9 条静态边由 `activeEdge` 驱动高亮：`animated: true` + `drop-shadow` 发光，非活动边降至 55% 透明度
- 消息流滚底策略：距底 <160px 才自动跟随，用户上翻不打扰

**暴露的问题（真实 Bug 链）：**

1. 边数组字面量宽度推断：首个元素无 `label` 字段导致后续 push 报 `TS2353` → 显式标注 `Edge[]`
2. `e.style.opacity` 是 `CSSProperties`（可能为 string），直接乘法报 `TS2362` → 收敛为数值再运算
3. **窄视口验收争议**：首屏截图评审报「内容重复/裁切」，排查发现是浏览器面板默认 800px 宽触发响应式单列堆叠 + 全页截图拼接造成的误判；设置 1440×900 视口复测 **PASS**——确认为响应式设计而非缺陷

**对应提交：** `d102791 feat(ui) 画布与消息流` · `fd39284 feat(ui) 向导与报告`。

---

## 迭代链 5 · 验证设施：真实论文语料 + 离线 RAG 测试 + Mock LLM 全链路 E2E

**人类意图：**

> 「你可以自己去找一些毕业论文，然后自己进行论文的验证。」

**AI 响应（三层验证设施）：**

1. **测试语料**：自建结构真实的中文学位论文 PDF（Edge 无头打印，含摘要/关键词/五章结构）、下载 arXiv 真实论文（BERT 16页、GPT-3 75页压力样本）、手工构造无文本层 PDF（异常路径）
2. **`scripts/validate-rag.ts`**（`npm run test:rag`）：为使纯逻辑可被 Node 复用，将 pdf.ts 拆分出 `pdfCore.ts`（标题/摘要/校验零浏览器依赖），脚本直接 import 生产源码验证「抽取→标题→摘要→分块→BM25检索」
3. **`scripts/mock-llm.mjs`**（`npm run mock:llm`）：OpenAI 兼容 SSE Mock，按 Prompt 特征区分质询/作答/评分/终评；服务端新增 `DEEPSEEK_BASE_URL` 覆盖能力（同时服务自建网关用户）

**验证结果（全绿）：**

| 验证项 | 结果 |
|---|---|
| 中文论文：标题/摘要/3组中文检索 | ✓ 全命中 |
| BERT（16页130块）/ GPT-3（75页504块压力） | ✓ |
| 无文本层 PDF → 友好报错"疑似扫描版" | ✓ |
| Mock 全流程：开场→4问4答→4份评分→雷达→终评→历史 | ✓ 零 JS 错误 |

**对应提交：** `refactor(rag)` / `feat(server)` 验证设施系列。

---

## 迭代链 6 · Mock E2E 揪出的两个真实缺陷

Mock 全链路跑通的代价是发现了两个此前人工审计漏掉的 Bug——这正是 E2E 的价值：

**Bug 1 · 终评报告未写入 store**
- 症状：phase=done、历史已存，但 `store.verdict` 恒为空 → 报告弹窗永远显示"报告生成中…"、导出缺失主席终评
- 根因：`runVerdict` 返回值只传给了 `saveSession`，漏了 `patch({ verdict })`
- 修复：`runArena` 与 `runScoringOnly` 的终态 patch 均补上 `verdict`

**Bug 2 · 后台标签页分支切换无限阻塞**
- 症状：store 里 phase=questioning，DOM 却停留在向导页（无任何 JS 错误）
- 排查：页面注入探针实测 **1 秒 0 个 requestAnimationFrame 回调**（渲染管线暂停）→ framer-motion `AnimatePresence mode="wait"` 的退出动画永远等不到帧，新分支被无限期推迟挂载
- 用户影响：真实浏览器后台标签页下同样可触发（rAF 节流），答辩启动后切窗口会冻结界面
- 修复：改为同步挂载模式（`initial={false}` 不带 mode），动画仅作视觉过渡，不再阻塞渲染

**连带加固：** Vite `optimizeDeps.include` 预声明懒加载依赖，消除"运行中依赖优化触发整页 reload 清空内存态"的干扰源。

**对应提交：** `fix(engine)` / `fix(ui)` 系列。

---

## 人机分工总结

| 角色 | 职责 |
|---|---|
| **人类（参赛者）** | 选题决策、需求意图描述、验收引导（Bug 症状描述）、真实场景测试、演示视频录制 |
| **AI（GLM via ZCode）** | 赛事情报提炼、技术选型对比、全量代码生成、编译错误修复、视觉验收自动化、文档撰写 |

> 开发全程未复制任何既有开源项目；每个功能模块对应独立 Git 提交，演进路径确定可复现。
