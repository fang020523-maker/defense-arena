/**
 * 全局状态仓库（zustand）
 *
 * 仅持久化「设置」到 localStorage；答辩过程态留在内存，
 * 结束后写入答辩历史摘要。
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BM25Index } from '../rag/bm25'
import type {
  AgentId,
  AgentStatus,
  ArenaMessage,
  Corpus,
  DefenseConfig,
  DimScores,
  JudgeScore,
  Phase,
  SessionSummary,
} from '../types'
import type { ModelId } from '../api/deepseek'

export interface AppSettings {
  apiKey: string
  model: ModelId
}

interface DefenseState {
  /* ----- 输入 ----- */
  config: DefenseConfig
  corpus: Corpus | null
  /** BM25 索引（不可序列化，仅内存） */
  index: BM25Index | null

  /* ----- 运行时 ----- */
  phase: Phase
  running: boolean
  messages: ArenaMessage[]
  agentStatus: Record<AgentId, AgentStatus>
  /** 画布当前高亮的交互边 */
  activeEdge: { from: AgentId; to: AgentId; kind: 'question' | 'answer' } | null
  /** 当前进度描述，如「第 2/2 轮 · 严正声 质询中」 */
  progressLabel: string
  scores: JudgeScore[]
  radar: DimScores | null
  verdict: string
  error: string | null

  /* ----- 设置（持久化） ----- */
  settings: AppSettings

  /* ----- actions ----- */
  setConfig: (patch: Partial<DefenseConfig>) => void
  setCorpus: (corpus: Corpus, index: BM25Index) => void
  setSettings: (patch: Partial<AppSettings>) => void
  setError: (msg: string | null) => void
  /** 引擎内部使用的细粒度更新 */
  patch: (partial: Partial<DefenseState>) => void
  addMessage: (msg: ArenaMessage) => void
  updateMessage: (id: string, patch: Partial<ArenaMessage>) => void
  removeMessage: (id: string) => void
  setAgentStatus: (id: AgentId, status: AgentStatus) => void
  /** 全部重置回 setup（保留设置与历史） */
  resetArena: () => void
  saveHistory: (summary: SessionSummary) => void
}

const HISTORY_KEY = 'defense_arena_history'

export function loadHistory(): SessionSummary[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as SessionSummary[]
  } catch {
    return []
  }
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY)
}

const initialRuntime = {
  phase: 'setup' as Phase,
  running: false,
  messages: [] as ArenaMessage[],
  agentStatus: {
    chair: 'idle',
    yan: 'idle',
    wen: 'idle',
    shi: 'idle',
    rui: 'idle',
    student: 'idle',
  } as Record<AgentId, AgentStatus>,
  activeEdge: null,
  progressLabel: '',
  scores: [] as JudgeScore[],
  radar: null as DimScores | null,
  verdict: '',
  error: null as string | null,
}

export const useDefense = create<DefenseState>()(
  persist(
    (set, get) => ({
      config: {
        defenseType: 'final',
        field: '计算机',
        rounds: 2,
        pressure: false,
      },
      corpus: null,
      index: null,
      ...initialRuntime,
      settings: { apiKey: '', model: 'deepseek-chat' },

      setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
      setCorpus: (corpus, index) => set({ corpus, index }),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setError: (msg) => set({ error: msg }),

      patch: (partial) => set(partial),

      addMessage: (msg) =>
        set((s) => {
          const messages = [...s.messages, msg]
          // 控制 transcript 规模：仅保留最近 200 条
          return { messages: messages.length > 200 ? messages.slice(-200) : messages }
        }),
      removeMessage: (id) =>
        set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),
      updateMessage: (id, patch) =>
        set((s) => ({
          messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      setAgentStatus: (id, status) =>
        set((s) => ({ agentStatus: { ...s.agentStatus, [id]: status } })),

      resetArena: () => {
        get().patch({ ...initialRuntime, corpus: null, index: null })
      },

      saveHistory: (summary) => {
        try {
          const list = [summary, ...loadHistory()].slice(0, 20)
          localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
        } catch {
          /* 历史写入失败不影响主流程 */
        }
      },
    }),
    {
      name: 'defense_arena_settings',
      partialize: (s) => ({ settings: s.settings, config: s.config }),
    },
  ),
)

// 开发环境调试钩子：便于 E2E 测试与问题排查（生产构建自动剔除）
if (import.meta.env.DEV) {
  ;(window as unknown as { __defense?: typeof useDefense }).__defense = useDefense
}
