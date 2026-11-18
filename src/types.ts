/* ============================================================
 * 赛博答辩厅 · 全局类型定义
 * ============================================================ */

/** 智能体标识：主席 + 4 位质询评委 + AI 答辩者 */
export type AgentId = 'chair' | 'yan' | 'wen' | 'shi' | 'rui' | 'student'

/** 霓虹配色（对应 index.css 中的 --color-neon-*） */
export type AccentColor = 'cyan' | 'violet' | 'amber' | 'rose' | 'emerald'

export interface AgentProfile {
  id: AgentId
  /** 姓名，如 严正声 */
  name: string
  /** 头衔，如 严格博导 · 方法论把关 */
  title: string
  emoji: string
  accent: AccentColor
  role: 'chair' | 'judge' | 'student'
  /** 关注侧重（用于检索查询加权与人设） */
  focus: string
}

/* ---------------- 论文语料 ---------------- */

export interface TextChunk {
  id: number
  /** 来源页码（1-based） */
  page: number
  text: string
}

export interface Corpus {
  fileName: string
  totalPages: number
  totalChars: number
  chunks: TextChunk[]
  /** 从首页启发式推断的论文标题 */
  title: string
  /** 摘要摘录（供开场陈述与主席总结使用） */
  abstractExcerpt: string
}

/* ---------------- 答辩配置 ---------------- */

export type DefenseType = 'proposal' | 'midterm' | 'final'

export const DEFENSE_TYPE_LABEL: Record<DefenseType, string> = {
  proposal: '开题答辩',
  midterm: '中期答辩',
  final: '毕业答辩',
}

export interface DefenseConfig {
  defenseType: DefenseType
  /** 学科领域，如 计算机 / 软件工程 */
  field: string
  /** 质询轮数（1-3） */
  rounds: number
  /** 压力模式：评委更尖锐，且末轮触发连环追问 */
  pressure: boolean
  /** 用户自定义开场陈述（留空则由 AI 答辩者代写） */
  customOpening?: string
}

/* ---------------- 消息流 ---------------- */

export type MessageKind = 'system' | 'opening' | 'question' | 'answer' | 'score' | 'verdict'

export interface ArenaMessage {
  id: string
  agentId: AgentId
  kind: MessageKind
  /** 第几轮质询（question/answer 有效） */
  round?: number
  /** 是否追问（压力模式末轮） */
  followUp?: boolean
  content: string
  /** 评委问题的切入点（问题首行「关注点：」解析而来） */
  focus?: string
  /** 思维链摘录（deepseek-reasoner） */
  thinking?: string
  /** 引用命中的论文片段编号 */
  citations?: number[]
  /** 流式输出中 */
  streaming?: boolean
  ts: number
}

/* ---------------- 评分 ---------------- */

export type ScoreDim = 'topic' | 'innovation' | 'method' | 'delivery' | 'effort'

export const SCORE_DIMS: { key: ScoreDim; label: string }[] = [
  { key: 'topic', label: '选题意义' },
  { key: 'innovation', label: '创新性' },
  { key: 'method', label: '方法严谨' },
  { key: 'delivery', label: '表达答辩' },
  { key: 'effort', label: '工作量' },
]

export type DimScores = Record<ScoreDim, number>

export interface JudgeScore {
  judgeId: AgentId
  scores: DimScores
  /** 一句话点评 */
  comment: string
  /** 本场问出的最尖锐问题 */
  sharpest: string
  /** 最薄弱环节 */
  weakest: string
}

/* ---------------- 会话状态 ---------------- */

export type Phase = 'setup' | 'opening' | 'questioning' | 'scoring' | 'verdict' | 'done'

export type AgentStatus = 'idle' | 'thinking' | 'speaking' | 'done'

/** localStorage 中的历史答辩摘要 */
export interface SessionSummary {
  id: string
  time: number
  thesisTitle: string
  defenseType: DefenseType
  radar: DimScores
  totalScore: number
  verdictExcerpt: string
}
