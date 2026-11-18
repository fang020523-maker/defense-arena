/**
 * 本地 Mock LLM（OpenAI 兼容 SSE）——用于零成本端到端验证与离线演示
 *
 * 启动：npm run mock:llm（默认端口 9909）
 * 配合：DEEPSEEK_BASE_URL=http://localhost:9909 npm run dev
 *
 * 依据请求中的 Prompt 特征识别调用类型并回放结构化内容：
 *   ping / 开场陈述 / 评委质询（按人设区分）/ 答辩作答 / 评分JSON / 主席终评
 */
import { createServer } from 'node:http'

const PORT = Number(process.env.MOCK_PORT || 9909)

/** 从请求体识别调用类型与角色 */
function classify({ messages, model }) {
  const system = messages.find((m) => m.role === 'system')?.content ?? ''
  const user = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''

  if (user.trim() === 'ping') return { type: 'ping' }
  if (system.includes('评分任务')) return { type: 'score' }
  if (system.includes('答辩终评报告')) return { type: 'verdict' }
  if (system.includes('提问纪律')) {
    const judge =
      ['严正声', '温文澜', '石力行', '芮敏'].find((n) => system.includes(n)) ?? '评委'
    return { type: 'question', judge, followUp: user.includes('压力追问') }
  }
  if (system.includes('答辩纪律')) return { type: 'answer' }
  if (user.includes('开场陈述')) return { type: 'opening' }
  return { type: 'answer' }
}

const QUESTION_BANK = {
  严正声: {
    focus: '方法严谨',
    text: '你的实验仅在一个 3×4 路网上验证，样本规模是否足以支撑结论的泛化性？请说明基线对照的设定依据与统计显著性检验情况。',
  },
  温文澜: {
    focus: '表达理解',
    text: '请用三句话向非本领域的老师解释：图注意力网络在你的方法里到底解决了什么问题？相比普通消息传递好在哪里？',
  },
  石力行: {
    focus: '落地价值',
    text: '这套方法部署到一个真实城市路口，需要哪些检测设备与算力？改造投入与延误降低 18.6% 的收益相比，账算得过来吗？',
  },
  芮敏: {
    focus: '前沿对标',
    text: '近一年已有不少基于 PRESSLight/CoLight 系列的区域信号控制工作，你的方法与之相比本质区别是什么？创新点是增量改进还是实质突破？',
  },
}

function buildContent(kind, req) {
  switch (kind.type) {
    case 'ping':
      return 'pong'
    case 'opening':
      return '各位老师好。我汇报的论文是《基于多智能体强化学习的城市交通信号协同控制方法研究》。\n研究背景：城市高峰拥堵加剧，传统配时难以适应动态交通流。\n研究内容：将交叉口信号机建模为智能体，设计复合状态空间与多目标奖励函数。\n方法路线：图注意力网络编码路网拓扑，CTDE 框架下联合训练。\n核心结果：SUMO 仿真中平均延误降低 18.6%，排队长度降低 22.3%。\n创新点：GAT 通信机制与单调混合网络的结合。请各位老师批评指正。'
    case 'question': {
      const bank = QUESTION_BANK[kind.judge]
      const prefix = kind.followUp ? `你刚才的回答中提到"统计显著性暂未详细展开"，我需要追问：` : ''
      return `关注点：${bank.focus}\n\n${prefix}（${kind.judge}·模拟质询）${bank.text}`
    }
    case 'answer':
      return '谢谢老师的提问。结论先行：这一点在论文第 3.2 节有相应设计。首先，状态空间融合了排队长度与拓扑特征；其次，训练采用集中式 Critic 保证稳定性；最后，消融实验显示移除该设计后性能下降约 7 个百分点，说明其必要性。'
    case 'score': {
      const base = { 严正声: 78, 温文澜: 85, 石力行: 74, 芮敏: 71 }
      const score =
        base[[...Object.keys(base)].find((k) => JSON.stringify(req).includes(k)) ?? '温文澜'] ?? 80
      return JSON.stringify({
        scores: {
          topic: score + 6,
          innovation: score - 4,
          method: score + 2,
          delivery: score + 4,
          effort: score,
        },
        comment: '整体完成度较好，答辩表达清晰，但方法泛化性论证不足。',
        sharpest: '样本规模是否足以支撑结论的泛化性？',
        weakest: '实验场景单一，缺少真实路网验证。',
      })
    }
    case 'verdict':
      return `## 总体评价\n这是一篇完成度较高的模拟答辩：陈述结构清晰，答辩人对方法细节掌握扎实，但对外部效度（泛化性）的论证偏弱。\n\n## 委员会评分\n四位评委打分区间 71-85：行业专家与青年学者明显更严格，分歧集中在创新成色。\n\n## 最尖锐的三个问题\n1. 单路网验证的样本规模问题——直击外部效度。\n2. 部署成本与收益的账——工程落地的试金石。\n3. 与 CoLight 系列的本质区别——创新定量的标尺。\n\n## 薄弱环节诊断\n- 选题：贴合智慧城市需求，不薄弱。\n- 方法：泛化性论证与统计检验缺失。\n- 表达：整体流畅，个别术语未作通俗解释。\n\n## 改进建议清单\n1. 补充至少两个异构路网的迁移实验。\n2. 为主要指标增加显著性检验与置信区间。\n3. 增加部署成本分析章节，回应落地质疑。\n4. 相关工作综述补充近一年顶会文献。\n5. 准备 30 秒电梯演讲版本的开场。\n\n## 答辩技巧提示\n1. 被追问不确定的问题时，先承认边界再给思路。\n2. 数字结论放慢语速，给评委记录时间。\n3. 保持与各位评委的眼神接触，避免只看主席。`
    default:
      return '（模拟回复）'
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

createServer(async (req, res) => {
  if (req.method === 'POST' && req.url?.includes('/chat/completions')) {
    let body = ''
    for await (const chunk of req) body += chunk
    let parsed = {}
    try {
      parsed = JSON.parse(body)
    } catch {
      /* ignore */
    }
    const kind = classify(parsed)
    const content = buildContent(kind, parsed)
    const isReasoner = String(parsed.model ?? '').includes('reasoner')

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
    })
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

    // reasoner 先流出思维链（验证前端 thinking 可视化链路）
    if (isReasoner) {
      for (const piece of '先分析提问意图与论文相关性，再组织作答结构……'.match(/.{1,6}/g) ?? []) {
        send({ choices: [{ delta: { reasoning_content: piece } }] })
        await sleep(5)
      }
    }
    for (const piece of content.match(/[\s\S]{1,18}/g) ?? []) {
      send({ choices: [{ delta: { content: piece } }] })
      await sleep(6)
    }
    res.write('data: [DONE]\n\n')
    res.end()
    console.log(`[mock] ${kind.type}${kind.judge ? `·${kind.judge}` : ''} → ${content.length} chars`)
    return
  }
  res.writeHead(404).end('not found')
}).listen(PORT, () => console.log(`🤖 Mock LLM (OpenAI 兼容 SSE) 已启动: http://localhost:${PORT}`))
