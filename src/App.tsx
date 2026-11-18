/**
 * 应用壳：头部（阶段步进 + 设置）+ 阶段路由（向导 / 答辩现场）
 */
import { AnimatePresence, motion } from 'framer-motion'
import { FileText, RotateCcw, Settings, Square, StopCircle } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { runScoringOnly, stopArena } from './agents/engine'
import { MessageFeed } from './components/MessageFeed'
import { SettingsModal } from './components/SettingsModal'
import { SetupWizard } from './components/SetupWizard'
import { useDefense } from './store/useDefense'
import type { Phase } from './types'

// 重型组件按需加载：React Flow（画布）与 react-markdown+ECharts（报告）
const ArenaCanvas = lazy(() =>
  import('./components/ArenaCanvas').then((m) => ({ default: m.ArenaCanvas })),
)
const ReportModal = lazy(() =>
  import('./components/ReportModal').then((m) => ({ default: m.ReportModal })),
)

const STEPS: { key: Phase | 'setup'; label: string }[] = [
  { key: 'setup', label: '备战' },
  { key: 'opening', label: '开场' },
  { key: 'questioning', label: '质询' },
  { key: 'scoring', label: '评分' },
  { key: 'verdict', label: '终评' },
]

function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  const phase = useDefense((s) => s.phase)
  const running = useDefense((s) => s.running)
  const corpus = useDefense((s) => s.corpus)
  const resetArena = useDefense((s) => s.resetArena)
  const messages = useDefense((s) => s.messages)

  const activeIdx = Math.max(STEPS.findIndex((s) => s.key === phase), 0)
  const canScore = phase !== 'setup' && phase !== 'done' && messages.some((m) => m.kind === 'question')

  return (
    <header className="flex items-center gap-4 border-b border-line/60 bg-ink/40 px-5 py-3 backdrop-blur-md">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-neon-cyan/20 to-neon-violet/20 text-lg shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35)]">
          ⚔️
        </div>
        <div>
          <h1 className="text-sm font-black tracking-wider">
            <span className="text-gradient">赛博答辩厅</span>
            <span className="ml-2 text-[10px] font-normal text-mist/60">Defense Arena</span>
          </h1>
          {corpus && <p className="max-w-[280px] truncate text-[10px] text-mist/60">{corpus.title}</p>}
        </div>
      </div>

      {/* 阶段步进 */}
      <nav className="mx-auto hidden items-center gap-1 md:flex">
        {STEPS.map((step, i) => (
          <div key={step.key} className="flex items-center gap-1">
            <span
              className={`rounded-full px-3 py-1 text-xs transition-all duration-300 ${
                i === activeIdx
                  ? 'bg-gradient-to-r from-neon-cyan/20 to-neon-violet/20 font-semibold text-frost shadow-[inset_0_0_0_1px_rgba(34,211,238,0.45)]'
                  : i < activeIdx
                    ? 'text-neon-cyan/70'
                    : 'text-mist/50'
              }`}
            >
              {i < activeIdx && '✓ '}
              {step.label}
            </span>
            {i < STEPS.length - 1 && <span className="text-mist/30">·</span>}
          </div>
        ))}
      </nav>

      {/* 操作 */}
      <div className="ml-auto flex items-center gap-2">
        {running ? (
          <button className="btn-danger !px-3 !py-1.5 text-xs" onClick={stopArena}>
            <Square size={12} /> 中止
          </button>
        ) : (
          canScore && (
            <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => void runScoringOnly()}>
              <StopCircle size={12} /> 直接评分
            </button>
          )
        )}
        {phase !== 'setup' && !running && (
          <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={resetArena}>
            <RotateCcw size={12} /> 重新开始
          </button>
        )}
        <button className="btn-ghost !px-2.5 !py-1.5" onClick={onOpenSettings} title="设置">
          <Settings size={14} />
        </button>
      </div>
    </header>
  )
}

export default function App() {
  const phase = useDefense((s) => s.phase)
  const progressLabel = useDefense((s) => s.progressLabel)
  const error = useDefense((s) => s.error)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  /** 报告弹窗首开后保持挂载，保留退出动画 */
  const [reportLoaded, setReportLoaded] = useState(false)

  // 终评完成后自动弹出报告
  useEffect(() => {
    if (phase === 'done') {
      setReportLoaded(true)
      setReportOpen(true)
    }
  }, [phase])

  const openReport = () => {
    setReportLoaded(true)
    setReportOpen(true)
  }

  const inArena = phase !== 'setup'

  return (
    <div className="flex h-full flex-col">
      <Header onOpenSettings={() => setSettingsOpen(true)} />

      {error && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="border-b border-neon-rose/30 bg-neon-rose/10 px-5 py-2 text-center text-xs text-neon-rose"
        >
          {error}
        </motion.div>
      )}

      <main className="min-h-0 flex-1">
        <AnimatePresence mode="wait">
          {inArena ? (
            <motion.div
              key="arena"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col lg:flex-row"
            >
              <div className="relative h-[42%] min-h-0 shrink-0 lg:h-auto lg:min-w-0 lg:flex-1 lg:shrink">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-xs text-mist">沙盘加载中…</div>
                  }
                >
                  <ArenaCanvas />
                </Suspense>
                {/* 进度条幅 */}
                {progressLabel && (
                  <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2">
                    <span className="chip border-neon-cyan/40 bg-ink/80 text-frost backdrop-blur-md">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon-cyan" />
                      {progressLabel}
                    </span>
                  </div>
                )}
                {phase === 'done' && (
                  <button
                    className="btn-primary absolute bottom-8 left-1/2 -translate-x-1/2 !px-6"
                    onClick={openReport}
                  >
                    <FileText size={15} /> 查看答辩终评报告
                  </button>
                )}
              </div>
              <div className="min-h-0 flex-1 border-t border-line/60 lg:w-[380px] lg:shrink-0 lg:border-t-0 lg:border-l">
                <MessageFeed />
              </div>
            </motion.div>
          ) : (
            <motion.div key="setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <SetupWizard />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {reportLoaded && (
        <Suspense fallback={null}>
          <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}
