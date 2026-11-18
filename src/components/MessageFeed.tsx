/**
 * 右侧消息流：实时答辩记录（流式打字 + 引用片段标签）
 */
import { AnimatePresence, motion } from 'framer-motion'
import { FileText, Gavel, GraduationCap, Megaphone, Sparkles, Star } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { getAgent } from '../agents/roles'
import { useDefense } from '../store/useDefense'
import type { ArenaMessage, MessageKind } from '../types'
import { ACCENT } from './ui'

const KIND_ICON: Record<MessageKind, typeof Gavel> = {
  system: Megaphone,
  opening: GraduationCap,
  question: Gavel,
  answer: Sparkles,
  score: Star,
  verdict: FileText,
}

const KIND_LABEL: Record<MessageKind, string> = {
  system: '主持',
  opening: '开场陈述',
  question: '质询',
  answer: '答辩',
  score: '评分',
  verdict: '终评',
}

function MessageCard({ msg }: { msg: ArenaMessage }) {
  const agent = getAgent(msg.agentId)
  const accent = ACCENT[agent.accent]
  const Icon = KIND_ICON[msg.kind]

  if (msg.kind === 'system') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 py-2 text-xs text-mist/80"
      >
        <span className="h-px flex-1 bg-line/60" />
        <Megaphone size={12} />
        <span className="max-w-[75%] text-center">{msg.content}</span>
        <span className="h-px flex-1 bg-line/60" />
      </motion.div>
    )
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 28, stiffness: 380 }}
      className={`panel px-3.5 py-3 ${msg.kind === 'question' ? 'border-l-2' : ''} ${
        msg.kind === 'question' ? accent.border : ''
      }`}
    >
      {/* 头部 */}
      <div className="flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-md bg-ink/70 text-xs ${accent.text}`}>
          <Icon size={13} />
        </span>
        <span className={`text-sm font-semibold ${accent.text}`}>{agent.name}</span>
        <span className="text-[10px] text-mist/70">{KIND_LABEL[msg.kind]}</span>
        {msg.round != null && <span className="chip !py-0 text-[10px]">第{msg.round}轮</span>}
        {msg.followUp && <span className="chip !border-neon-rose/40 !py-0 text-[10px] !text-neon-rose">追问</span>}
        {msg.focus && <span className="chip !border-neon-amber/40 !py-0 text-[10px] !text-neon-amber">{msg.focus}</span>}
        <span className="ml-auto font-mono text-[10px] text-mist/50">
          {new Date(msg.ts).toLocaleTimeString('zh-CN', { hour12: false, minute: '2-digit', second: '2-digit' })}
        </span>
      </div>

      {/* 内容 */}
      <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-frost/95">
        {msg.content}
        {msg.streaming && <span className="animate-blink text-neon-cyan">▍</span>}
        {msg.streaming && !msg.content && <span className="text-mist">思考中…</span>}
      </p>

      {/* 引用片段 */}
      {msg.citations && msg.citations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {msg.citations.map((id) => (
            <span key={id} className="chip !py-0 font-mono text-[10px] !text-mist/80">
              <FileText size={9} /> 片段{id}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  )
}

export function MessageFeed() {
  const messages = useDefense((s) => s.messages)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastLen = useRef(0)

  // 新消息或流式更新时自动滚底（用户手动上滚时不打扰）
  useEffect(() => {
    const feed = bottomRef.current?.parentElement
    if (!feed) return
    const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 160
    const total = messages.reduce((s, m) => s + m.content.length, 0)
    if (nearBottom || total < lastLen.current + 400) {
      lastLen.current = total
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages])

  return (
    <div className="flex h-full flex-col border-l border-line/60 bg-ink/30">
      <div className="flex items-center gap-2 border-b border-line/60 px-4 py-3">
        <span className="text-sm font-semibold text-frost">答辩实录</span>
        <span className="chip !py-0 font-mono text-[10px]">{messages.length} 条</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <MessageCard key={m.id} msg={m} />
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
