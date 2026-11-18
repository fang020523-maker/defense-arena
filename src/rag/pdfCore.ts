/**
 * PDF 解析纯逻辑（不依赖浏览器 Worker，可在 Node 测试环境复用）
 */
export interface PdfPageText {
  page: number
  text: string
}

export class PdfExtractError extends Error {}

/** 从前几页启发式推断论文标题 */
export function guessThesisTitle(pages: PdfPageText[]): string {
  const head = pages
    .filter((p) => p.page <= 2)
    .flatMap((p) => p.text.split('\n'))
    .map((l) => l.trim())
  // 排除：纯数字、版权/出版信息、以小写英文开头（多为正文接行）的行
  const junk =
    /(学[士位]论文|university|scholarly works|distributed under|copyright|arxiv|preprint|proceedings|licensed|doi)/i
  const candidate = head.find(
    (l) =>
      l.length >= 6 &&
      l.length <= 60 &&
      !/^\d+$/.test(l) &&
      !junk.test(l) &&
      !/^[a-z]/.test(l),
  )
  return candidate ?? head.find((l) => l.length >= 4) ?? '未命名论文'
}

/** 定位摘要段落（中文「摘要」或英文 Abstract 之后 300 字） */
export function extractAbstract(pages: PdfPageText[]): string {
  const head = pages
    .filter((p) => p.page <= 3)
    .map((p) => p.text)
    .join('\n')
  const match = head.match(/摘\s*要[:：\n]([\s\S]{30,400}?)(?:关键词|Abstract|ABSTRACT|$)/)
    ?? head.match(/Abstract[:：\n]\s*([\s\S]{30,400}?)(?:Key\s*words|关键词|$)/i)
  const raw = (match?.[1] ?? head.slice(0, 320)).replace(/\s+/g, ' ').trim()
  return raw.length > 320 ? `${raw.slice(0, 320)}…` : raw
}

/** 校验抽取总量（过少视为扫描版） */
export function assertEnoughText(pages: PdfPageText[]): void {
  const totalChars = pages.reduce((s, p) => s + p.text.length, 0)
  if (totalChars < 200) {
    throw new PdfExtractError(
      '未能从该 PDF 抽取到足够文本：疑似扫描版（图片型）PDF，暂不支持，请换用文字版论文',
    )
  }
}
