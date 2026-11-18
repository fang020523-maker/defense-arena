/**
 * 答辩终评报告：雷达 + 各评委意见 + 主席报告（Markdown）
 * 支持导出 .md / 一键复制
 */
import { Check, Copy, Download, Star } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { lazy, Suspense, useState } from 'react'
import { getAgent } from '../agents/roles'
import { useDefense } from '../store/useDefense'
import { SCORE_DIMS } from '../types'
import { Modal, ACCENT } from './ui'

// ECharts 体积大，报告弹窗打开时才加载
const RadarPanel = lazy(() => import('./RadarPanel').then((m) => ({ default: m.RadarPanel })))

function buildExportMarkdown(): string {
  const { corpus, config, scores, radar, verdict } = useDefense.getState()
  if (!corpus) return ''
  const dims = SCORE_DIMS.map(({ key, label }) => `| ${label} | ${radar ? radar[key] : '-'} |`).join('\n')
  const judges = scores
    .map((s) => {
      const a = getAgent(s.judgeId)
      const d = SCORE_DIMS.map(({ key, label }) => `${label} ${s.scores[key]}`).join(' / ')
      return `### ${a.name}（${a.title}）\n\n- 评分：${d}\n- 总评：${s.comment}\n- 最尖锐问题：${s.sharpest}\n- 薄弱环节：${s.weakest}\n`
    })
    .join('\n')
  const total = radar ? Math.round(SCORE_DIMS.reduce((s, { key }) => s + radar[key], 0) / SCORE_DIMS.length) : '-'
  return `# 答辩终评报告\n\n- **论文**：${corpus.title}\n- **类型**：${config.defenseType === 'proposal' ? '开题答辩' : config.defenseType === 'midterm' ? '中期答辩' : '毕业答辩'}\n- **综合得分**：${total} / 100\n\n## 委员会五维评分\n\n| 维度 | 平均分 |\n| --- | --- |\n${dims}\n\n## 各评委意见\n\n${judges}\n## 主席终评\n\n${verdict}\n\n---\n*本报告由 赛博答辩厅 Defense Arena 生成 · ${new Date().toLocaleString('zh-CN')}*\n`
}

export function ReportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const corpus = useDefense((s) => s.corpus)
  const scores = useDefense((s) => s.scores)
  const radar = useDefense((s) => s.radar)
  const verdict = useDefense((s) => s.verdict)
  const [copied, setCopied] = useState(false)

  const total = radar ? Math.round(SCORE_DIMS.reduce((s, { key }) => s + radar[key], 0) / SCORE_DIMS.length) : 0

  const copy = async () => {
    await navigator.clipboard.writeText(buildExportMarkdown())
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const download = () => {
    const blob = new Blob([buildExportMarkdown()], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `答辩终评报告-${corpus?.title.slice(0, 30) ?? '未命名'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="答辩终评报告"
      subtitle={corpus?.title}
    >
      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        {/* 左：雷达 + 评委意见 */}
        <div>
          <div className="panel p-3">
            <Suspense fallback={<div className="flex h-[280px] items-center justify-center text-xs text-mist">雷达图加载中…</div>}>
              <RadarPanel height={280} />
            </Suspense>
            <div className="-mt-1 mb-1 text-center">
              <span className="text-3xl font-black text-gradient">{total}</span>
              <span className="ml-1 text-sm text-mist">/ 100 综合得分</span>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {scores.map((s) => {
              const agent = getAgent(s.judgeId)
              const accent = ACCENT[agent.accent]
              return (
                <div key={s.judgeId} className="panel p-3">
                  <div className="flex items-center gap-2">
                    <span>{agent.emoji}</span>
                    <span className={`text-sm font-bold ${accent.text}`}>{agent.name}</span>
                    <Star size={11} className="ml-auto text-neon-amber" />
                    <span className="font-mono text-sm font-bold text-neon-amber">
                      {Math.round(SCORE_DIMS.reduce((t, { key }) => t + s.scores[key], 0) / 5)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-mist">{s.comment}</p>
                  <p className="mt-1.5 rounded-md bg-neon-rose/8 px-2 py-1.5 text-[11px] leading-relaxed text-neon-rose/90">
                    💢 最尖锐：{s.sharpest}
                  </p>
                  <p className="mt-1 text-[11px] text-mist/70">⚠️ 薄弱环节：{s.weakest}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* 右：主席终评 Markdown */}
        <div className="min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-frost">
              ⚖️ 主席终评 · {getAgent('chair').name}
            </h3>
            <div className="flex gap-2">
              <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => void copy()}>
                {copied ? <Check size={13} className="text-neon-emerald" /> : <Copy size={13} />}
                {copied ? '已复制' : '复制全文'}
              </button>
              <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={download}>
                <Download size={13} /> 导出 .md
              </button>
            </div>
          </div>
          <div className="prose-invert mt-3 panel max-h-[58vh] overflow-y-auto p-5 text-sm leading-relaxed text-frost/90 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-neon-cyan [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_strong]:text-frost [&_ul]:list-disc [&_ul]:pl-5">
            <Markdown remarkPlugins={[remarkGfm]}>{verdict || '报告生成中…'}</Markdown>
          </div>
        </div>
      </div>
    </Modal>
  )
}
