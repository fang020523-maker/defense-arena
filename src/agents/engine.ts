/**
 * 答辩编排引擎（状态机）
 *
 * 开场陈述 → 多轮质询（4 评委 × N 轮，压力模式末轮追问）
 *   → 结构化评分（JSON 模式） → 主席终评（Markdown 报告）
 *
 * 每一步都是流式调用，驱动画布节点状态与消息流。
 */
import { ChatApiError, extractJson, streamChat } from '../api/deepseek'
import type { ChatMessage } from '../api/deepseek'
import { retrieve } from '../rag/bm25'
import { useDefense } from '../store/useDefense'
import type {
  AgentId,
  ArenaMessage,
  DimScores,
  JudgeScore,
  MessageKind,
  ScoreDim,
  TextChunk,
} from '../types'
import { DEFENSE_TYPE_LABEL, SCORE_DIMS } from '../types'
import {
  JUDGES,
  chairSystemPrompt,
  getAgent,
  judgeSystemPrompt,
  studentSystemPrompt,
} from './roles'

let controller: AbortController | null = null

/** 中止答辩（用户点击「中止」） */
export function stopArena(): void {
  controller?.abort()
}

const uid = () => Math.random().toString(36).slice(2, 10)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function ensureActive(): void {
  if (controller?.signal.aborted) throw new DOMException('aborted', 'AbortError')
}

/* ==================== 上下文构造 ==================== */

function fmtChunks(chunks: TextChunk[]): string {
  return chunks.map((c) => `【片段${c.id} · 第${c.page}页】\n${c.text}`).join('\n\n')
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

/** 压缩答辩记录：开头两条 + 最近若干条，控制总长度 */
function fmtTranscript(messages: ArenaMessage[], maxChars = 2800): string {
  const meaningful = messages.filter(
    (m) => m.kind === 'question' || m.kind === 'answer' || m.kind === 'opening',
  )
  const fmt = (m: ArenaMessage) =>
    m.kind === 'question'
      ? `${getAgent(m.agentId).name} 问：${clip(m.content, 220)}`
      : m.kind === 'answer'
        ? `答辩人 答：${clip(m.content, 220)}`
        : `（开场陈述）${clip(m.content, 260)}`
  const lines = meaningful.map(fmt)
  if (lines.join('\n').length <= maxChars) return lines.join('\n')
  const head = lines.slice(0, 2)
  const tail: string[] = []
  let budget = maxChars - head.join('\n').length
  for (let i = lines.length - 1; i > 2; i--) {
    if (budget - lines[i].length < 0) break
    tail.unshift(lines[i])
    budget -= lines[i].length + 1
  }
  return [...head, '……', ...tail].join('\n')
}

/* ==================== 流式消息写入 ==================== */

interface StreamArgs {
  agentId: AgentId
  kind: MessageKind
  round?: number
  followUp?: boolean
  citations?: number[]
  chat: ChatMessage[]
  temperature: number
  maxTokens: number
  jsonMode?: boolean
  /** 解析问题首行的「关注点：」 */
  parseFocus?: boolean
}

async function streamToMessage(args: StreamArgs): Promise<ArenaMessage> {
  const store = useDefense.getState()
  const { settings } = store
  const id = uid()
  const msg: ArenaMessage = {
    id,
    agentId: args.agentId,
    kind: args.kind,
    round: args.round,
    followUp: args.followUp,
    citations: args.citations,
    content: '',
    streaming: true,
    ts: Date.now(),
  }
  store.addMessage(msg)

  let acc = ''
  let thinking = ''
  let lastFlush = 0
  let spoke = false

  const doStream = () =>
    streamChat({
      messages: args.chat,
      apiKey: settings.apiKey,
      model: settings.model,
      temperature: args.temperature,
      maxTokens: args.maxTokens,
      jsonMode: args.jsonMode,
      signal: controller?.signal,
      onDelta: (t) => {
        acc += t
        if (!spoke) {
          spoke = true
          useDefense.getState().setAgentStatus(args.agentId, 'speaking')
        }
        const now = Date.now()
        if (now - lastFlush > 90) {
          lastFlush = now
          useDefense.getState().updateMessage(id, { content: acc })
        }
      },
      onReasoning: (t) => {
        thinking += t
      },
    })

  // 网络类错误自动重试一次（Key 类错误不重试）
  let raw: string
  try {
    raw = await doStream()
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    const msgText = err instanceof ChatApiError ? err.message : '网络异常'
    if (/API Key/.test(msgText)) throw err
    await sleep(1500)
    raw = await doStream()
  }

  let content = raw.trim()
  let focus: string | undefined
  if (args.parseFocus) {
    const m = content.match(/^关注点[：:]\s*(.+)$/m)
    if (m) {
      focus = m[1].trim().slice(0, 20)
      content = content.replace(m[0], '').trim()
    }
  }

  const final: ArenaMessage = {
    ...msg,
    content,
    focus,
    thinking: thinking || undefined,
    streaming: false,
  }
  useDefense.getState().updateMessage(id, {
    content,
    focus,
    thinking: final.thinking,
    streaming: false,
  })
  useDefense.getState().setAgentStatus(args.agentId, 'done')
  return final
}

function pushSystem(content: string): void {
  useDefense.getState().addMessage({
    id: uid(),
    agentId: 'chair',
    kind: 'system',
    content,
    ts: Date.now(),
  })
}

/* ==================== 各阶段 ==================== */

async function runOpening(): Promise<void> {
  const { config, corpus, index } = useDefense.getState()
  if (!corpus || !index) return

  pushSystem(
    `${DEFENSE_TYPE_LABEL[config.defenseType]}现在开始。首先请答辩人进行 5 分钟开场陈述，重点介绍选题背景、研究内容与主要成果。`,
  )
  useDefense.getState().patch({
    phase: 'opening',
    progressLabel: '开场陈述 · 答辩人发言中',
    activeEdge: null,
  })
  useDefense.getState().setAgentStatus('student', 'thinking')

  if (config.customOpening?.trim()) {
    useDefense.getState().addMessage({
      id: uid(),
      agentId: 'student',
      kind: 'opening',
      content: config.customOpening.trim(),
      ts: Date.now(),
    })
    useDefense.getState().setAgentStatus('student', 'done')
    await sleep(400)
    return
  }

  const chunks = retrieve(index, `${corpus.title} 研究背景 研究意义 研究方法 主要结论`, 5)
  const chat: ChatMessage[] = [
    { role: 'system', content: studentSystemPrompt(config) },
    {
      role: 'user',
      content: `【论文信息】\n标题：${corpus.title}\n摘要：${corpus.abstractExcerpt}\n\n【论文摘录】\n${fmtChunks(chunks)}\n\n【任务】\n请撰写约 400 字的开场陈述（可用少量要点列表），须覆盖：①选题背景与意义 ②研究内容与目标 ③方法路线 ④${config.defenseType === 'proposal' ? '研究计划与预期成果' : config.defenseType === 'midterm' ? '阶段性进展' : '核心结果与贡献'} ⑤创新点${config.defenseType === 'final' ? '' : ' ⑥后续计划'}。语气自信从容，像真实的答辩现场。`,
    },
  ]
  await streamToMessage({
    agentId: 'student',
    kind: 'opening',
    citations: chunks.map((c) => c.id),
    chat,
    temperature: 0.9,
    maxTokens: 900,
  })
}

async function askJudge(
  judge: (typeof JUDGES)[number],
  round: number,
  totalRounds: number,
): Promise<ArenaMessage | null> {
  const store = useDefense.getState()
  const { config, corpus, index, messages } = store
  if (!corpus || !index) return null
  const isFollowUp =
    config.pressure && round === totalRounds && messages.some((m) => m.agentId === judge.id && m.kind === 'question')

  store.setAgentStatus(judge.id, 'thinking')
  store.patch({
    phase: 'questioning',
    activeEdge: { from: judge.id, to: 'student', kind: 'question' },
    progressLabel: `第 ${round}/${totalRounds} 轮 · ${judge.name}${isFollowUp ? ' 追问中' : ' 质询中'}`,
  })

  const prevQA = isFollowUp
    ? (() => {
        const qs = messages.filter((m) => m.agentId === judge.id && m.kind === 'question')
        const lastQ = qs[qs.length - 1]
        const idx = messages.findIndex((m) => m.id === lastQ?.id)
        const lastA = messages.slice(idx + 1).find((m) => m.kind === 'answer')
        return { q: lastQ?.content ?? '', a: lastA?.content ?? '' }
      })()
    : null

  const query = isFollowUp
    ? `${judge.focus} ${prevQA?.q ?? ''} ${prevQA?.a ?? ''}`
    : `${judge.focus} ${corpus.title}`
  const chunks = retrieve(index, query, 4)

  const instruction = isFollowUp
    ? `【本轮指令 · 压力追问】\n你此前的提问：「${clip(prevQA!.q, 160)}」\n答辩人的回答：「${clip(prevQA!.a, 240)}」\n请针对该回答中模糊、回避或存疑之处，提出一个更尖锐的追问。`
    : `【本轮指令】\n请从你最关注的维度出发，提出一个此前未被问过的具体问题。`

  const chat: ChatMessage[] = [
    { role: 'system', content: judgeSystemPrompt(judge, config) },
    {
      role: 'user',
      content: `【论文信息】\n标题：${corpus.title}\n摘要：${corpus.abstractExcerpt}\n\n【论文摘录（你的提问依据）】\n${fmtChunks(chunks)}\n\n【答辩记录】\n${fmtTranscript(messages)}\n\n${instruction}`,
    },
  ]

  return streamToMessage({
    agentId: judge.id,
    kind: 'question',
    round,
    followUp: isFollowUp,
    citations: chunks.map((c) => c.id),
    chat,
    temperature: config.pressure ? 1.15 : 1.0,
    maxTokens: 320,
    parseFocus: true,
  })
}

async function answerJudge(
  judge: (typeof JUDGES)[number],
  round: number,
  question: ArenaMessage,
): Promise<void> {
  const store = useDefense.getState()
  const { config, index } = store
  if (!index) return

  store.setAgentStatus('student', 'thinking')
  store.patch({ activeEdge: { from: 'student', to: judge.id, kind: 'answer' } })
  store.patch({ progressLabel: `第 ${round} 轮 · 答辩人回应 ${judge.name}` })

  const chunks = retrieve(index, question.content, 4)
  const chat: ChatMessage[] = [
    { role: 'system', content: studentSystemPrompt(config) },
    {
      role: 'user',
      content: `【论文摘录（回答依据）】\n${fmtChunks(chunks)}\n\n【评委提问】\n${judge.name}（${judge.title}）：${question.content}\n\n【任务】\n请以论文作者身份正面作答。`,
    },
  ]
  await streamToMessage({
    agentId: 'student',
    kind: 'answer',
    round,
    followUp: question.followUp,
    citations: chunks.map((c) => c.id),
    chat,
    temperature: 0.8,
    maxTokens: 700,
  })
}

function validateScores(raw: Record<string, unknown>): DimScores {
  const scores = { topic: 0, innovation: 0, method: 0, delivery: 0, effort: 0 } as DimScores
  const valid: number[] = []
  for (const { key } of SCORE_DIMS) {
    const v = Number(raw[key])
    if (Number.isFinite(v) && v >= 0 && v <= 100) {
      scores[key] = Math.round(v)
      valid.push(scores[key])
    }
  }
  if (valid.length === 0) throw new ChatApiError('评分数据缺失')
  const avg = Math.round(valid.reduce((s, v) => s + v, 0) / valid.length)
  for (const { key } of SCORE_DIMS) {
    if (scores[key] === 0) scores[key] = avg
  }
  return scores
}

async function runScoring(): Promise<JudgeScore[]> {
  const { config, corpus, messages } = useDefense.getState()
  if (!corpus) return []
  pushSystem('质询环节结束。请各位评委合议，独立提交评分与意见。')
  useDefense.getState().patch({ phase: 'scoring', activeEdge: null, progressLabel: '评委评分中' })

  const results: JudgeScore[] = []
  for (const judge of JUDGES) {
    ensureActive()
    useDefense.getState().setAgentStatus(judge.id, 'thinking')
    useDefense.getState().patch({ progressLabel: `评委评分中 · ${judge.name}` })

    const chat: ChatMessage[] = [
      {
        role: 'system',
        content: `${judgeSystemPrompt(judge, config)}\n\n# 评分任务\n质询已全部结束。请基于整场答辩表现独立评分，输出严格的 JSON（不要输出任何其他内容）：\n{"scores":{"topic":0-100整数,"innovation":0-100整数,"method":0-100整数,"delivery":0-100整数,"effort":0-100整数},"comment":"一句话总评","sharpest":"你本场问出的最尖锐问题","weakest":"论文最薄弱的环节"}\n评分维度：topic=选题意义 innovation=创新性 method=方法严谨 delivery=表达答辩 effort=工作量。请拉开区分度，不要全给高分。`,
      },
      {
        role: 'user',
        content: `【论文信息】\n标题：${corpus.title}\n摘要：${corpus.abstractExcerpt}\n\n【答辩全程记录】\n${fmtTranscript(messages, 3600)}\n\n请提交你的评分 JSON。`,
      },
    ]

    const raw = await streamToMessage({
      agentId: judge.id,
      kind: 'score',
      chat,
      temperature: 0.2,
      maxTokens: 450,
      jsonMode: true,
    })
    const json = extractJson<{
      scores?: Record<string, unknown>
      comment?: string
      sharpest?: string
      weakest?: string
    }>(raw.content)
    results.push({
      judgeId: judge.id,
      scores: validateScores((json.scores ?? {}) as Record<string, unknown>),
      comment: (json.comment ?? '').slice(0, 80),
      sharpest: (json.sharpest ?? '').slice(0, 160),
      weakest: (json.weakest ?? '').slice(0, 80),
    })
    await sleep(300)
  }

  const radar = { topic: 0, innovation: 0, method: 0, delivery: 0, effort: 0 } as DimScores
  for (const { key } of SCORE_DIMS) {
    radar[key] = Math.round(results.reduce((s, r) => s + r.scores[key], 0) / results.length)
  }
  useDefense.getState().patch({ scores: results, radar })
  return results
}

async function runVerdict(scores: JudgeScore[]): Promise<string> {
  const { config, corpus, messages } = useDefense.getState()
  if (!corpus) return ''
  pushSystem('下面请委员会主席宣读终评报告。')
  useDefense.getState().setAgentStatus('chair', 'thinking')
  useDefense.getState().patch({ phase: 'verdict', progressLabel: '主席撰写终评报告中', activeEdge: null })

  const scoreBrief = scores
    .map((s) => {
      const dims = SCORE_DIMS.map(({ key, label }) => `${label}${s.scores[key]}`).join('，')
      return `${getAgent(s.judgeId).name}：${dims}。总评：${s.comment}`
    })
    .join('\n')

  const chat: ChatMessage[] = [
    { role: 'system', content: chairSystemPrompt(config) },
    {
      role: 'user',
      content: `【论文信息】\n标题：${corpus.title}\n摘要：${corpus.abstractExcerpt}\n\n【各位评委评分与意见】\n${scoreBrief}\n\n【答辩全程记录】\n${fmtTranscript(messages, 4200)}\n\n请撰写《答辩终评报告》。`,
    },
  ]
  const msg = await streamToMessage({
    agentId: 'chair',
    kind: 'verdict',
    chat,
    temperature: 0.6,
    maxTokens: 4096,
  })
  return msg.content
}

/* ==================== 主流程 ==================== */

/** 完整答辩：开场 → 质询 → 评分 → 终评 */
export async function runArena(): Promise<void> {
  const state = useDefense.getState()
  const { config, corpus, index, settings } = state
  if (!corpus || !index) {
    state.setError('请先上传论文并完成配置')
    return
  }
  if (!settings.apiKey) {
    state.setError('请先在「设置」中填入 DeepSeek API Key')
    return
  }

  controller = new AbortController()
  useDefense.getState().patch({
    running: true,
    error: null,
    messages: [],
    scores: [],
    radar: null,
    verdict: '',
    progressLabel: '',
  })

  try {
    ensureActive()
    await runOpening()

    for (let round = 1; round <= config.rounds; round++) {
      ensureActive()
      pushSystem(`── 进入第 ${round} 轮质询 ──`)
      for (const judge of JUDGES) {
        ensureActive()
        const q = await askJudge(judge, round, config.rounds)
        if (!q) continue
        await sleep(250)
        ensureActive()
        await answerJudge(judge, round, q)
        await sleep(250)
      }
    }

    ensureActive()
    const scores = await runScoring()
    ensureActive()
    const verdict = await runVerdict(scores)

    useDefense.getState().patch({
      phase: 'done',
      running: false,
      progressLabel: '答辩结束',
      activeEdge: null,
    })
    saveSession(verdict)
  } catch (err) {
    const aborted = (err as Error).name === 'AbortError'
    const st = useDefense.getState()
    if (aborted) {
      const hasQA = st.messages.some((m) => m.kind === 'question')
      st.patch({
        running: false,
        progressLabel: hasQA ? '已中止 · 可直接生成评分' : '已中止',
        activeEdge: null,
        error: null,
      })
    } else {
      st.patch({
        running: false,
        error: err instanceof ChatApiError ? err.message : '答辩流程异常中断，请重试',
        activeEdge: null,
      })
    }
    // 归位所有 speaking/thinking 状态
    const s2 = useDefense.getState().agentStatus
    const reset: Record<string, string> = {}
    for (const [k, v] of Object.entries(s2)) {
      if (v === 'thinking' || v === 'speaking') reset[k] = 'idle'
    }
    useDefense.setState({ agentStatus: { ...s2, ...reset } as typeof s2 })
  } finally {
    controller = null
  }
}

/** 中止后跳过剩余质询，直接评分 + 终评 */
export async function runScoringOnly(): Promise<void> {
  const { messages, settings } = useDefense.getState()
  if (!messages.some((m) => m.kind === 'question')) return
  if (!settings.apiKey) {
    useDefense.getState().setError('请先在「设置」中填入 DeepSeek API Key')
    return
  }
  controller = new AbortController()
  useDefense.getState().patch({ running: true, error: null })
  try {
    const scores = await runScoring()
    ensureActive()
    const verdict = await runVerdict(scores)
    useDefense.getState().patch({
      phase: 'done',
      running: false,
      progressLabel: '答辩结束',
      activeEdge: null,
    })
    saveSession(verdict)
  } catch (err) {
    const st = useDefense.getState()
    st.patch({
      running: false,
      error: err instanceof ChatApiError ? err.message : '评分流程异常，请重试',
      activeEdge: null,
    })
  } finally {
    controller = null
  }
}

function saveSession(verdict: string): void {
  const { config, corpus, radar } = useDefense.getState()
  if (!corpus || !radar) return
  const totalScore = Math.round(
    SCORE_DIMS.reduce((s, { key }) => s + radar[key as ScoreDim], 0) / SCORE_DIMS.length,
  )
  useDefense.getState().saveHistory({
    id: uid(),
    time: Date.now(),
    thesisTitle: corpus.title,
    defenseType: config.defenseType,
    radar,
    totalScore,
    verdictExcerpt: verdict.replace(/[#*\n]/g, ' ').slice(0, 120),
  })
}
