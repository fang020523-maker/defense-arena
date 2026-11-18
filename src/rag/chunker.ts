/**
 * 文本分块：按段落聚合到目标长度，保留页码来源
 * 中文论文没有天然词边界，采用「段落聚合 + 定长回退」策略。
 */
import type { TextChunk } from '../types'

const TARGET_SIZE = 600 // 目标块长（字符）
const OVERLAP = 80 // 相邻块重叠，避免语义被硬切断
const MIN_SIZE = 100 // 过短尾巴块并入前一块

export function buildChunks(
  pages: { page: number; text: string }[],
  targetSize = TARGET_SIZE,
  overlap = OVERLAP,
): TextChunk[] {
  const chunks: TextChunk[] = []
  let buf = ''
  let bufPage = 1

  const flush = () => {
    const text = buf.trim()
    if (text.length >= MIN_SIZE || (text.length > 0 && chunks.length === 0)) {
      chunks.push({ id: chunks.length, page: bufPage, text })
    } else if (text.length > 0 && chunks.length > 0) {
      // 过短尾巴：并入前一块
      const prev = chunks[chunks.length - 1]
      prev.text += `\n${text}`
    }
    buf = ''
  }

  for (const { page, text } of pages) {
    const paragraphs = text.split(/\n+/).map((s) => s.trim()).filter(Boolean)
    for (const para of paragraphs) {
      if (!buf) bufPage = page
      // 超长段落（无换行的整页文本）：按窗口硬切
      if (para.length > targetSize * 1.8) {
        for (let i = 0; i < para.length; i += targetSize - overlap) {
          flush()
          bufPage = page
          buf = para.slice(i, i + targetSize)
        }
        flush()
        continue
      }
      if (buf.length + para.length > targetSize) {
        flush()
        bufPage = page
        // 与上一块保留少量重叠，维护跨块语义连续
        buf = chunks.length > 0 ? `${chunks[chunks.length - 1].text.slice(-overlap)}\n` : ''
      }
      buf += `${para}\n`
    }
  }
  flush()
  return chunks.map((c, i) => ({ ...c, id: i }))
}
