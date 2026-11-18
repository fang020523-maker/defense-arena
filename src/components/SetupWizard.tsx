/**
 * 备战向导：上传论文 → 答辩配置 → API Key → 开始答辩
 */
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  FileText,
  Flame,
  KeyRound,
  Loader2,
  Play,
  UploadCloud,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { pingApiKey } from '../api/deepseek'
import { runArena } from '../agents/engine'
import { BM25Index } from '../rag/bm25'
import { buildChunks } from '../rag/chunker'
import { useDefense } from '../store/useDefense'
import type { Corpus, DefenseType } from '../types'
import { Segmented, Toggle } from './ui'

const FIELDS = ['计算机', '软件工程', '电子信息', '机械工程', '材料科学', '生物医学', '经济管理', '人文社科', '物理学', '化学']

export function SetupWizard() {
  const config = useDefense((s) => s.config)
  const setConfig = useDefense((s) => s.setConfig)
  const corpus = useDefense((s) => s.corpus)
  const setCorpus = useDefense((s) => s.setCorpus)
  const settings = useDefense((s) => s.settings)
  const setSettings = useDefense((s) => s.setSettings)
  const error = useDefense((s) => s.error)
  const setError = useDefense((s) => s.setError)

  const [parsing, setParsing] = useState<{ done: number; total: number } | null>(null)
  const [customField, setCustomField] = useState(false)
  const [keyTesting, setKeyTesting] = useState(false)
  const [keyOk, setKeyOk] = useState<boolean | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = async (file: File) => {
    setError(null)
    useDefense.setState({ corpus: null, index: null })
    setParsing({ done: 0, total: 1 })
    // pdf.js 体积大（~1.4MB），按需加载：仅在用户真正上传时拉取
    type PdfModule = typeof import('../rag/pdf')
    let PdfError: PdfModule['PdfExtractError'] | null = null
    try {
      const { extractPdfText, guessThesisTitle, extractAbstract, PdfExtractError } = await import('../rag/pdf')
      PdfError = PdfExtractError
      const pages = await extractPdfText(file, (done, total) => setParsing({ done, total }))
      const chunks = buildChunks(pages)
      const corpus: Corpus = {
        fileName: file.name,
        totalPages: pages.length,
        totalChars: pages.reduce((s, p) => s + p.text.length, 0),
        chunks,
        title: guessThesisTitle(pages),
        abstractExcerpt: extractAbstract(pages),
      }
      setCorpus(corpus, new BM25Index(chunks))
    } catch (err) {
      setError(
        PdfError && err instanceof PdfError ? err.message : '论文解析失败，请更换文件重试',
      )
    } finally {
      setParsing(null)
    }
  }

  const testKey = async () => {
    if (!settings.apiKey.trim()) return
    setKeyTesting(true)
    setKeyOk(null)
    try {
      await pingApiKey(settings.apiKey.trim())
      setKeyOk(true)
    } catch {
      setKeyOk(false)
    } finally {
      setKeyTesting(false)
    }
  }

  const ready = corpus !== null && settings.apiKey.trim() !== ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto flex h-full max-w-5xl flex-col overflow-y-auto px-6 py-8"
    >
      {/* 标题区 */}
      <div className="text-center">
        <h1 className="text-4xl font-black tracking-widest">
          <span className="text-gradient">赛博答辩厅</span>
        </h1>
        <p className="mt-2 text-sm text-mist">
          上传你的论文 PDF，五位 AI 评委将对你展开一场全真模拟答辩 · 多智能体编排 × 论文检索锚定
        </p>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {/* ---------- 左：论文上传 ---------- */}
        <div className="panel flex flex-col p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-frost">
            <FileText size={15} className="text-neon-cyan" /> 第一步 · 上传论文
          </h2>

          <div
            className={`mt-4 flex flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all ${
              dragOver ? 'border-neon-cyan bg-neon-cyan/5' : 'border-line hover:border-neon-cyan/50'
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files?.[0]
              if (f) void handleFile(f)
            }}
          >
            {parsing ? (
              <>
                <Loader2 size={34} className="animate-spin text-neon-cyan" />
                <p className="mt-3 text-sm text-frost">正在解析论文…</p>
                <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-neon-cyan to-neon-violet transition-all duration-300"
                    style={{ width: `${(parsing.done / parsing.total) * 100}%` }}
                  />
                </div>
                <p className="mt-2 font-mono text-xs text-mist">
                  {parsing.done}/{parsing.total} 页
                </p>
              </>
            ) : corpus ? (
              <>
                <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="text-3xl">📄</motion.div>
                <p className="mt-2 line-clamp-1 max-w-full px-2 text-sm font-semibold text-frost">{corpus.fileName}</p>
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  <span className="chip">{corpus.totalPages} 页</span>
                  <span className="chip">{(corpus.totalChars / 1000).toFixed(1)} 千字</span>
                  <span className="chip">{corpus.chunks.length} 检索块</span>
                  <span className="chip !border-neon-emerald/40 !text-neon-emerald">✓ 索引就绪</span>
                </div>
                <button
                  className="btn-ghost mt-4 !px-3 !py-1 text-xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    inputRef.current?.click()
                  }}
                >
                  更换文件
                </button>
              </>
            ) : (
              <>
                <UploadCloud size={34} className="text-mist" />
                <p className="mt-3 text-sm text-frost">拖入论文 PDF，或点击选择文件</p>
                <p className="mt-1 text-xs text-mist/60">支持文字版 PDF · 全程本地解析，论文不上传任何服务器</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
                e.target.value = ''
              }}
            />
          </div>

          {corpus && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
              <label className="text-xs text-mist">论文标题（自动识别，可修改）</label>
              <input
                className="input-base mt-1"
                value={corpus.title}
                onChange={(e) => {
                  const v = e.target.value
                  useDefense.setState((s) => (s.corpus ? { corpus: { ...s.corpus, title: v } } : s))
                }}
              />
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-mist/70 hover:text-frost">查看识别到的摘要</summary>
                <p className="mt-1.5 rounded-md bg-ink/60 p-2.5 text-xs leading-relaxed text-mist">
                  {corpus.abstractExcerpt}
                </p>
              </details>
            </motion.div>
          )}
        </div>

        {/* ---------- 右：答辩配置 ---------- */}
        <div className="panel flex flex-col p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-frost">
            <Flame size={15} className="text-neon-violet" /> 第二步 · 答辩配置
          </h2>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs text-mist">答辩类型</label>
              <Segmented<DefenseType>
                value={config.defenseType}
                onChange={(v) => setConfig({ defenseType: v })}
                options={[
                  { value: 'proposal', label: '开题' },
                  { value: 'midterm', label: '中期' },
                  { value: 'final', label: '毕业' },
                ]}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-mist">学科领域</label>
              {customField ? (
                <input
                  className="input-base"
                  value={config.field}
                  placeholder="输入学科领域，如 人工智能"
                  onChange={(e) => setConfig({ field: e.target.value })}
                />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {FIELDS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setConfig({ field: f })}
                      className={`rounded-full border px-3 py-1 text-xs transition-all ${
                        config.field === f
                          ? 'border-neon-cyan/60 bg-neon-cyan/10 text-frost'
                          : 'border-line text-mist hover:border-neon-cyan/40 hover:text-frost'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCustomField(true)}
                    className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-mist hover:text-frost"
                  >
                    + 自定义
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-mist">质询轮数（4 位评委 × N 轮）</label>
              <Segmented<number>
                value={config.rounds}
                onChange={(v) => setConfig({ rounds: v })}
                options={[
                  { value: 1, label: '1 轮', hint: '极速' },
                  { value: 2, label: '2 轮', hint: '标准' },
                  { value: 3, label: '3 轮', hint: '深度' },
                ]}
              />
            </div>

            <Toggle
              checked={config.pressure}
              onChange={(v) => setConfig({ pressure: v })}
              label="⚡ 压力模式"
              hint="评委更尖锐，末轮触发连环追问——模拟高压答辩现场"
            />

            <div>
              <label className="mb-1.5 block text-xs text-mist">
                自定义开场陈述 <span className="text-mist/50">（留空由 AI 答辩人代写）</span>
              </label>
              <textarea
                className="input-base min-h-[64px] resize-y"
                placeholder="可粘贴你自己的开场陈述稿，答辩将以此开场"
                value={config.customOpening ?? ''}
                onChange={(e) => setConfig({ customOpening: e.target.value })}
              />
            </div>
          </div>

          {/* API Key */}
          <div className="mt-5 rounded-lg border border-line bg-ink/40 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-frost">
              <KeyRound size={13} className="text-neon-amber" /> DeepSeek API Key
              {keyOk === true && <span className="chip !border-neon-emerald/50 !py-0 !text-neon-emerald">✓ 连接成功</span>}
              {keyOk === false && <span className="chip !border-neon-rose/50 !py-0 !text-neon-rose">连接失败</span>}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="password"
                className="input-base font-mono text-xs"
                placeholder="sk-…（仅保存在你的浏览器本地）"
                value={settings.apiKey}
                onChange={(e) => {
                  setSettings({ apiKey: e.target.value.trim() })
                  setKeyOk(null)
                }}
              />
              <button className="btn-ghost shrink-0 !px-3 text-xs" onClick={() => void testKey()} disabled={keyTesting}>
                {keyTesting ? <Loader2 size={13} className="animate-spin" /> : '测试'}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-mist/60">
              获取：<span className="text-neon-cyan/80">platform.deepseek.com</span> → API Keys。Key 只存在本机 localStorage，仅用于直连你自己的 DeepSeek 账户。
            </p>
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 flex items-center gap-2 rounded-lg border border-neon-rose/40 bg-neon-rose/10 px-4 py-2.5 text-sm text-neon-rose"
        >
          <AlertTriangle size={15} className="shrink-0" />
          {error}
        </motion.div>
      )}

      {/* 开始按钮 */}
      <div className="mt-6 flex justify-center pb-4">
        <motion.button
          whileHover={ready ? { scale: 1.03 } : undefined}
          whileTap={ready ? { scale: 0.97 } : undefined}
          className="btn-primary !px-10 !py-3 !text-base"
          disabled={!ready}
          onClick={() => void runArena()}
        >
          <Play size={17} />
          {ready ? '开始答辩' : corpus ? '请先填写 API Key' : '请先上传论文'}
        </motion.button>
      </div>
    </motion.div>
  )
}
