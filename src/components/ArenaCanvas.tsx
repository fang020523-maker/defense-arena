/**
 * 答辩沙盘画布（React Flow）
 *
 * 布局：主席居上 · 答辩人居中 · 四位评委环绕
 * 消息流驱动边的高亮与流动动画（质询=琥珀 → 答辩=青色）。
 */
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import type { Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo } from 'react'
import { AGENTS, JUDGES } from '../agents/roles'
import { useDefense } from '../store/useDefense'
import type { AgentId } from '../types'
import { ACCENT } from './ui'
import { AgentNode, type AgentFlowNode } from './AgentNode'

/** 画布布局坐标 */
const POSITIONS: Record<AgentId, { x: number; y: number }> = {
  chair: { x: 0, y: -250 },
  student: { x: 0, y: 0 },
  yan: { x: -360, y: -60 },
  rui: { x: 360, y: -60 },
  wen: { x: -210, y: 190 },
  shi: { x: 210, y: 190 },
}

const nodeTypes = { agent: AgentNode }

export function ArenaCanvas() {
  const agentStatus = useDefense((s) => s.agentStatus)
  const activeEdge = useDefense((s) => s.activeEdge)
  const messages = useDefense((s) => s.messages)
  const phase = useDefense((s) => s.phase)

  const initialNodes = useMemo<AgentFlowNode[]>(
    () =>
      AGENTS.map((agent) => ({
        id: agent.id,
        type: 'agent' as const,
        position: POSITIONS[agent.id],
        data: { agent, status: 'idle' as const, preview: '' },
        draggable: true,
      })),
    [],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)

  /** 静态边：主席↔答辩人 + 每位评委的质询/答辩方向边 */
  const initialEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = [
      {
        id: 'chair-student',
        source: 'chair',
        target: 'student',
        style: { stroke: ACCENT.violet.hex, strokeWidth: 1.5, opacity: 0.3 },
      },
    ]
    for (const j of JUDGES) {
      const hex = ACCENT[j.accent].hex
      edges.push({
        id: `q-${j.id}`,
        source: j.id,
        target: 'student',
        label: '质询',
        labelStyle: { fill: '#8da2c7', fontSize: 10 },
        labelBgStyle: { fill: '#0b1120' },
        style: { stroke: hex, strokeWidth: 1.5, opacity: 0.25 },
      })
      edges.push({
        id: `a-${j.id}`,
        source: 'student',
        target: j.id,
        label: '答辩',
        labelStyle: { fill: '#8da2c7', fontSize: 10 },
        labelBgStyle: { fill: '#0b1120' },
        style: { stroke: ACCENT.cyan.hex, strokeWidth: 1.5, opacity: 0.2 },
      })
    }
    return edges
  }, [])

  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  /** 状态与发言预览同步到节点 */
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const agentId = n.id as AgentId
        const last = [...messages].reverse().find((m) => m.agentId === agentId)
        const preview = n.data.status === 'speaking' && last ? last.content : ''
        if (n.data.status === agentStatus[agentId] && n.data.preview === preview) return n
        return { ...n, data: { ...n.data, status: agentStatus[agentId], preview } }
      }),
    )
  }, [agentStatus, messages, setNodes])

  /** 活动边高亮 + 流动动画 */
  useEffect(() => {
    setEdges((eds) =>
      eds.map((e) => {
        let active = false
        if (activeEdge?.kind === 'question' && e.id === `q-${activeEdge.from}`) active = true
        if (activeEdge?.kind === 'answer' && e.id === `a-${activeEdge.to}`) active = true
        const base = e.style ?? {}
        const baseOpacity = typeof base.opacity === 'number' ? base.opacity : 0.25
        return {
          ...e,
          animated: active,
          style: active
            ? { ...base, opacity: 1, strokeWidth: 2.6, filter: `drop-shadow(0 0 6px ${base.stroke})` }
            : { ...base, opacity: baseOpacity * 0.55, strokeWidth: 1.5, filter: 'none' },
        }
      }),
    )
  }, [activeEdge, setEdges])

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.4}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        edgesFocusable={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="#1f2c4d" />
      </ReactFlow>

      {/* 阶段水印 */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 select-none">
        <span className="chip backdrop-blur-md">
          {phase === 'opening' && '① 开场陈述'}
          {phase === 'questioning' && '② 委员会质询'}
          {phase === 'scoring' && '③ 合议评分'}
          {phase === 'verdict' && '④ 主席终评'}
          {phase === 'done' && '✓ 答辩结束'}
        </span>
      </div>
    </div>
  )
}
