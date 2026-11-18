/**
 * 画布智能体节点：头像 + 状态徽标 + 发言预览
 */
import { motion } from 'framer-motion'
import type { Node, NodeProps } from '@xyflow/react'
import { Check, Volume2 } from 'lucide-react'
import { Handle, Position } from '@xyflow/react'
import type { AgentProfile, AgentStatus } from '../types'
import { ACCENT } from './ui'

export interface AgentNodeData extends Record<string, unknown> {
  agent: AgentProfile
  status: AgentStatus
  /** speaking 时的发言预览 */
  preview: string
}

export type AgentFlowNode = Node<AgentNodeData, 'agent'>

const STATUS_META: Record<AgentStatus, { label: string; cls: string }> = {
  idle: { label: '待命', cls: 'bg-line/60 text-mist' },
  thinking: { label: '思考中', cls: 'bg-neon-violet/20 text-neon-violet animate-pulse' },
  speaking: { label: '发言中', cls: 'bg-neon-emerald/20 text-neon-emerald' },
  done: { label: '完成', cls: 'bg-neon-cyan/15 text-neon-cyan' },
}

export function AgentNode({ data }: NodeProps<AgentFlowNode>) {
  const { agent, status, preview } = data
  const accent = ACCENT[agent.accent]
  const isActive = status === 'thinking' || status === 'speaking'
  const st = STATUS_META[status]

  return (
    <div className="relative w-40">
      {/* 发言方向指示（隐藏句柄） */}
      <Handle type="source" position={Position.Top} className="!invisible" />
      <Handle type="target" position={Position.Bottom} className="!invisible" />
      <Handle type="source" position={Position.Bottom} id="b" className="!invisible" />
      <Handle type="target" position={Position.Top} id="b" className="!invisible" />
      <Handle type="source" position={Position.Left} id="l" className="!invisible" />
      <Handle type="target" position={Position.Right} id="r" className="!invisible" />
      <Handle type="source" position={Position.Right} id="r2" className="!invisible" />
      <Handle type="target" position={Position.Left} id="l2" className="!invisible" />

      <motion.div
        layout
        className={`panel relative px-3 py-3 transition-shadow duration-300 ${isActive ? 'shadow-[0_0_28px_rgba(34,211,238,0.18)]' : ''}`}
        animate={isActive ? { scale: 1.04 } : { scale: 1 }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xl ${accent.ring} ${
              isActive ? 'animate-pulse-ring' : ''
            }`}
            style={{ boxShadow: isActive ? `0 0 18px ${accent.hex}55` : undefined }}
          >
            {agent.emoji}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`truncate text-sm font-bold ${accent.text}`}>{agent.name}</span>
              {status === 'done' && <Check size={13} className="shrink-0 text-neon-cyan" />}
              {status === 'speaking' && <Volume2 size={13} className="shrink-0 animate-pulse text-neon-emerald" />}
            </div>
            <div className="truncate text-[11px] text-mist">{agent.title}</div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
          {preview && (
            <span className="ml-2 truncate text-[10px] text-mist/60">{preview.slice(0, 16)}…</span>
          )}
        </div>

        {status === 'speaking' && preview && (
          <div className="mt-2 max-h-16 overflow-hidden rounded-md bg-ink/70 px-2 py-1.5 text-[11px] leading-relaxed text-mist">
            {preview.slice(0, 60)}
            <span className="animate-blink">▍</span>
          </div>
        )}
      </motion.div>
    </div>
  )
}
