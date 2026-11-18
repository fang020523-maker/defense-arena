/**
 * PDF 文本抽取（pdf.js · 浏览器入口）
 *
 * 只做文本层抽取，不涉及坐标渲染——刻意避开扫描版/OCR 场景，
 * 无文本层的 PDF 会给出友好错误提示。
 * 纯逻辑（标题/摘要/校验）拆分至 pdfCore.ts，供 Node 测试复用。
 */
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { assertEnoughText, PdfExtractError, type PdfPageText } from './pdfCore'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export { PdfExtractError, extractAbstract, guessThesisTitle, type PdfPageText } from './pdfCore'

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
  assertEnoughText(pages)
  return pages
}
