/**
 * 赛博答辩厅 · Defense Arena — 本地代理服务
 *
 * 职责：
 *  1. POST /api/chat  — 将前端请求代理到 DeepSeek，原样转发 SSE 流式响应
 *  2. GET  /api/health— 健康检查
 *  3. 生产模式       — 托管前端构建产物（../dist），单进程即可完整运行
 *
 * 设计说明：
 *  - API Key 优先级：请求头 x-api-key > 环境变量 DEEPSEEK_API_KEY
 *    （推荐用户在前端填自己的 Key，评委复现零配置）
 *  - 仅透传白名单字段，杜绝请求体注入
 */
import express from 'express'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 3001)
const UPSTREAM = 'https://api.deepseek.com/chat/completions'
/** 允许调用的模型白名单 */
const MODELS = new Set(['deepseek-chat', 'deepseek-reasoner'])
/** 单次请求超时（毫秒）：答辩长回答 + reasoner 思维链，放宽到 3 分钟 */
const TIMEOUT_MS = 3 * 60 * 1000

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '4mb' }))

/** 将上游错误码翻译为对用户友好的中文提示 */
function friendlyUpstreamError(status, message) {
  switch (status) {
    case 401:
      return { status, tip: 'API Key 无效或已过期，请在前端「设置」中检查后重试' }
    case 402:
      return { status, tip: 'API Key 余额不足，请前往 platform.deepseek.com 充值' }
    case 422:
      return { status, tip: '请求参数不合法：' + message }
    case 429:
      return { status, tip: '请求过于频繁（触发限流），请稍等几秒再试' }
    default:
      return { status, tip: `DeepSeek 服务返回 ${status}：${message || '未知错误'}` }
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'defense-arena', time: new Date().toISOString() })
})

app.post('/api/chat', async (req, res) => {
  const apiKey = String(req.get('x-api-key') || process.env.DEEPSEEK_API_KEY || '').trim()
  if (!apiKey) {
    return res.status(401).json({
      error: { message: '缺少 API Key：请先在前端右上角「设置」中填入 DeepSeek API Key' },
    })
  }

  const { model, messages, temperature, max_tokens, top_p, response_format } = req.body || {}
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: { message: '参数错误：messages 不能为空' } })
  }

  // 仅透传白名单字段，并做类型收敛
  const payload = {
    model: MODELS.has(model) ? model : 'deepseek-chat',
    messages,
    stream: true,
    ...(typeof temperature === 'number' ? { temperature: Math.min(Math.max(temperature, 0), 2) } : {}),
    ...(typeof max_tokens === 'number' ? { max_tokens: Math.min(Math.max(max_tokens, 1), 8192) } : {}),
    ...(typeof top_p === 'number' ? { top_p } : {}),
    // JSON 输出模式（评分结构化解析用）
    ...(response_format && response_format.type === 'json_object'
      ? { response_format: { type: 'json_object' } }
      : {}),
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  // 客户端断开（如用户点击「中止」）时，同步中断上游请求
  res.on('close', () => clearTimeout(timer) || controller.abort())

  let upstream
  try {
    upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const aborted = err?.name === 'AbortError'
    return res.status(aborted ? 504 : 502).json({
      error: {
        message: aborted
          ? '请求超时或已被客户端中止'
          : '无法连接 DeepSeek 服务，请检查本机网络（是否需要代理）后重试',
      },
    })
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer)
    let detail = ''
    try {
      const data = await upstream.json()
      detail = data?.error?.message || ''
    } catch {
      /* 忽略解析失败 */
    }
    const { status, tip } = friendlyUpstreamError(upstream.status, detail)
    return res.status(status).json({ error: { message: tip, upstream: detail } })
  }

  // 上游正常：以 SSE 逐块转发
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(': connected\n\n')

  try {
    const reader = upstream.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
  } catch (err) {
    if (err?.name !== 'AbortError') res.write(`data: ${JSON.stringify({ error: { message: '流式传输中断，请重试' } })}\n\n`)
  } finally {
    clearTimeout(timer)
    res.end()
  }
})

// ---------- 生产模式：托管前端构建产物（SPA 回退） ----------
const distDir = join(__dirname, '..', 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(join(distDir, 'index.html'))
    } else {
      next()
    }
  })
}

// 统一错误兜底
app.use((err, _req, res, _next) => {
  console.error('[server] 未捕获异常:', err)
  res.status(500).json({ error: { message: '服务器内部错误，请查看服务端日志' } })
})

app.listen(PORT, () => {
  console.log('')
  console.log('  ⚔️  赛博答辩厅 Defense Arena 代理服务已启动')
  console.log(`     API  地址: http://localhost:${PORT}/api`)
  console.log(`     前端访问: http://localhost:5173 (npm run dev)`)
  if (existsSync(distDir)) console.log(`     托管构建: ${distDir} (npm run build 后单进程可运行)`)
  if (!process.env.DEEPSEEK_API_KEY) console.log('     提示: 未设置 DEEPSEEK_API_KEY，请在网页「设置」中填入自己的 Key')
  console.log('')
})

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n[server] 收到退出信号，服务已停止')
  process.exit(0)
})
