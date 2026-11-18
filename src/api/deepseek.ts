/**
 * DeepSeek 流式对话客户端（走本地代理 /api/chat）
 *
 * 解析 SSE：data: {...} 增量拼接；兼容 deepseek-reasoner 的
 * reasoning_content（思维链），供 UI 呈现「深度思考中」。
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ModelId = 'deepseek-chat' | 'deepseek-reasoner'

export interface StreamOptions {
  messages: ChatMessage[]
  apiKey: string
  model?: ModelId
  temperature?: number
  maxTokens?: number
  /** 结构化输出（评分 JSON 解析） */
  jsonMode?: boolean
  signal?: AbortSignal
  onDelta?: (text: string) => void
  /** 思维链增量（deepseek-reasoner） */
  onReasoning?: (text: string) => void
}

export class ChatApiError extends Error {}

/** 快速连通用：单条 ping 请求 */
export async function pingApiKey(apiKey: string): Promise<void> {
  await streamChat({
    apiKey,
    messages: [{ role: 'user', content: 'ping' }],
    maxTokens: 4,
  })
}

export async function streamChat(opts: StreamOptions): Promise<string> {
  const { messages, apiKey, model = 'deepseek-chat', temperature, maxTokens, jsonMode, signal, onDelta, onReasoning } = opts
  if (!apiKey) throw new ChatApiError('尚未配置 DeepSeek API Key，请点击右上角「设置」填写')

  let res: Response
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        model,
        messages,
        ...(temperature != null ? { temperature } : {}),
        ...(maxTokens != null ? { max_tokens: maxTokens } : {}),
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ChatApiError('无法连接本地代理服务，请确认已运行 npm run dev（或 npm start）')
  }

  if (!res.ok || !res.body) {
    let tip = `请求失败（HTTP ${res.status}）`
    try {
      const data = await res.json()
      if (data?.error?.message) tip = data.error.message
    } catch {
      /* 保留默认提示 */
    }
    throw new ChatApiError(tip)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''

  const handleEvent = (payload: string) => {
    if (payload === '[DONE]') return
    let json: {
      choices?: { delta?: { content?: string; reasoning_content?: string } }[]
      error?: { message?: string }
    }
    try {
      json = JSON.parse(payload)
    } catch {
      return
    }
    if (json.error?.message) throw new ChatApiError(json.error.message)
    const delta = json.choices?.[0]?.delta
    if (delta?.reasoning_content) onReasoning?.(delta.reasoning_content)
    if (delta?.content) {
      content += delta.content
      onDelta?.(delta.content)
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE 事件以空行分隔
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const evt of events) {
        for (const line of evt.split('\n')) {
          if (line.startsWith('data:')) handleEvent(line.slice(5).trim())
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw err instanceof ChatApiError ? err : new ChatApiError('流式传输中断，请重试')
  }

  if (!content.trim()) throw new ChatApiError('模型未返回内容，请重试或更换模型')
  return content
}

/** 从模型输出中稳健提取 JSON（容忍 ```json 包裹与前后杂质） */
export function extractJson<T>(raw: string): T {
  const text = raw.replace(/```json|```/g, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new ChatApiError('模型输出中未找到 JSON')
  try {
    return JSON.parse(text.slice(start, end + 1)) as T
  } catch {
    throw new ChatApiError('评分 JSON 解析失败，请重试')
  }
}
