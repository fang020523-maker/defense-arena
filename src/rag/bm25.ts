/**
 * 轻量 BM25 检索（纯前端，零外部依赖）
 *
 * 分词策略：英文/数字按词，中文按二元词组（bigram），
 * 对单文档规模（一篇论文数十块）的检索场景足够精准。
 */
import type { TextChunk } from '../types'

const K1 = 1.5
const B = 0.75

/** 常见英文停用词（论文场景精简版） */
const EN_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'with', 'is', 'are',
  'was', 'were', 'be', 'been', 'by', 'as', 'at', 'from', 'that', 'this', 'these',
  'those', 'it', 'its', 'we', 'our', 'can', 'will', 'which', 'than', 'then', 'into',
  'also', 'such', 'has', 'have', 'had', 'not', 'but', 'they', 'their', 'there',
])

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase()
  const tokens: string[] = []
  // 英文与数字词
  for (const w of lower.match(/[a-z0-9][a-z0-9-]{1,}/g) ?? []) {
    if (!EN_STOPWORDS.has(w)) tokens.push(w)
  }
  // 中文二元词组
  for (const seg of lower.match(/[\u4e00-\u9fa5]+/g) ?? []) {
    for (let i = 0; i < seg.length - 1; i++) {
      tokens.push(seg.slice(i, i + 2))
    }
    if (seg.length === 1) tokens.push(seg)
  }
  return tokens
}

export interface SearchHit {
  chunk: TextChunk
  score: number
}

export class BM25Index {
  private docTokens: string[][]
  private docFreq = new Map<string, number>() // 词 -> 出现文档数
  private avgLen: number
  private chunks: TextChunk[]

  constructor(chunks: TextChunk[]) {
    this.chunks = chunks
    this.docTokens = chunks.map((c) => tokenize(c.text))
    this.avgLen =
      this.docTokens.reduce((s, t) => s + t.length, 0) / Math.max(this.docTokens.length, 1)
    this.docTokens.forEach((tokens) => {
      for (const t of new Set(tokens)) {
        this.docFreq.set(t, (this.docFreq.get(t) ?? 0) + 1)
      }
    })
  }

  search(query: string, topK = 4): SearchHit[] {
    const qTokens = tokenize(query)
    if (qTokens.length === 0) return []
    const n = this.chunks.length
    const hits = this.chunks.map((chunk, i) => {
      const tokens = this.docTokens[i]
      const tf = new Map<string, number>()
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)

      let score = 0
      for (const qt of qTokens) {
        const f = tf.get(qt)
        if (!f) continue
        const df = this.docFreq.get(qt) ?? 0
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5))
        const norm = f * (K1 + 1) / (f + K1 * (1 - B + B * (tokens.length / this.avgLen)))
        score += idf * norm
      }
      return { chunk, score }
    })
    return hits
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }
}

/** 便捷检索：返回去重后的文本块 */
export function retrieve(index: BM25Index, query: string, topK = 4): TextChunk[] {
  return index.search(query, topK).map((h) => h.chunk)
}
