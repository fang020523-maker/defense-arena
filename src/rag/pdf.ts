/**
 * PDF 文本抽取（pdf.js）
 *
 * 只做文本层抽取，不涉及坐标渲染——刻意避开扫描版/OCR 场景，
 * 无文本层的 PDF 会给出友好错误提示。
 */
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface PdfPageText {
  page: number
  text: string
}

/** 用户可读的抽取错误 */
export class PdfExtractError extends Error {}

/**
 * 抽取 PDF 全部页面的文本
 * @param onProgress (已完成页数, 总页数)
 */
export async function extractPdfText(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<PdfPageText[]> {
  if (!/\.pdf$/i.test(file.name)) {
    throw new PdfExtractError('仅支持 PDF 文件（.pdf）')
  }

  let doc: pdfjs.PDFDocumentProxy
  let loadingTask: pdfjs.PDFDocumentLoadingTask
  try {
    loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() })
    doc = await loadingTask.promise
  } catch (err) {
    const name = (err as { name?: string })?.name ?? ''
    if (name.includes('Password')) {
      throw new PdfExtractError('该 PDF 已加密，请先解除密码保护后重试')
    }
    throw new PdfExtractError('PDF 解析失败，请确认文件未损坏')
  }

  const pages: PdfPageText[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    // hasEOL 保留换行结构，便于后续按段落分块
    let text = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      text += item.str
      if (item.hasEOL) text += '\n'
    }
    pages.push({ page: i, text: text.replace(/[ \t]+\n/g, '\n').trim() })
    onProgress?.(i, doc.numPages)
    page.cleanup()
  }
  await loadingTask.destroy()

  const totalChars = pages.reduce((s, p) => s + p.text.length, 0)
  if (totalChars < 200) {
    throw new PdfExtractError(
      '未能从该 PDF 抽取到足够文本：疑似扫描版（图片型）PDF，暂不支持，请换用文字版论文',
    )
  }
  return pages
}

/** 从前几页启发式推断论文标题 */
export function guessThesisTitle(pages: PdfPageText[]): string {
  const head = pages
    .filter((p) => p.page <= 2)
    .flatMap((p) => p.text.split('\n'))
    .map((l) => l.trim())
  const candidate = head.find(
    (l) => l.length >= 6 && l.length <= 60 && !/^\d+$/.test(l) && !/(学[士位]论文|university|university press)/i.test(l),
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
