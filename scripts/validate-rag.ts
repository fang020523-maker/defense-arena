/**
 * RAG 管线离线验证脚本（Node + tsx）
 *
 * 直接 import src/rag 真实源码（pdfCore/chunker/bm25），
 * 在 Node 中用 pdfjs-dist legacy 构建复现 pdf.ts 的抽取循环，
 * 对 public/test/ 下的语料逐个验证：抽取 → 标题 → 摘要 → 分块 → BM25 检索。
 *
 * 用法：npx tsx scripts/validate-rag.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { assertEnoughText, extractAbstract, guessThesisTitle, PdfExtractError } from '../src/rag/pdfCore'
import type { PdfPageText } from '../src/rag/pdfCore'
import { buildChunks } from '../src/rag/chunker'
import { retrieve } from '../src/rag/bm25'

const ROOT = join(import.meta.dirname, '..')

/** 复现 src/rag/pdf.ts 的浏览器抽取循环（pdf.js API 相同） */
async function extractPages(file: string): Promise<PdfPageText[]> {
  const data = new Uint8Array(readFileSync(file))
  const loadingTask = pdfjs.getDocument({ data })
  const doc = await loadingTask.promise
  const pages: PdfPageText[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let text = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      text += item.str
      if ((item as { hasEOL?: boolean }).hasEOL) text += '\n'
    }
    pages.push({ page: i, text: text.replace(/[ \t]+\n/g, '\n').trim() })
    page.cleanup()
  }
  await loadingTask.destroy()
  assertEnoughText(pages)
  return pages
}

interface Expectation {
  file: string
  /** 文件缺失时的处理：skip（下载中）| fail */
  onMissing?: 'skip' | 'fail'
  title?: RegExp
  abstract?: RegExp
  minPages?: number
  minChunks?: number
  /** BM25 检索质量：query → 命中块应包含的关键词 */
  retrieval?: { query: string; shouldContain: RegExp }[]
  /** 期望抛出 PdfExtractError 且消息匹配 */
  expectError?: RegExp
}

const CASES: Expectation[] = [
  {
    file: 'public/test/thesis-cn.pdf',
    title: /多智能体强化学习|交通信号/,
    abstract: /18\.6%|排队长度/,
    minPages: 5,
    minChunks: 10,
    retrieval: [
      { query: '奖励函数 设计 延误 排队', shouldContain: /奖励函数|w1|延误/ },
      { query: '图注意力网络 邻居 聚合', shouldContain: /图注意力|GAT|邻居/ },
      { query: '实验结果 平均延误 降低', shouldContain: /18\.6|27\.4|早高峰/ },
    ],
  },
  {
    file: 'public/test/paper-en-bert.pdf',
    title: /BERT|Pre-?training|Language/i,
    abstract: /BERT|language model/i,
    minPages: 10,
    retrieval: [
      { query: 'masked language model pre-training', shouldContain: /mask|MLM/i },
      { query: 'ablation study results', shouldContain: /ablation|Table/i },
    ],
  },
  {
    file: 'public/test/paper-en-gpt3.pdf',
    onMissing: 'skip',
    title: /Language Models|GPT/i,
    minPages: 40,
    minChunks: 80,
    retrieval: [{ query: 'few-shot learning in-context', shouldContain: /few-shot|in-context/i }],
  },
  {
    file: 'public/sample-paper.pdf',
    title: /Attention/i,
    minPages: 10,
    retrieval: [{ query: 'multi-head attention scaled dot-product', shouldContain: /attention/i }],
  },
  {
    file: 'public/test/no-text.pdf',
    expectError: /扫描版/,
  },
]

let failed = 0
const ok = (name: string, cond: boolean, detail = '') => {
  const mark = cond ? '✓' : '✗'
  if (!cond) failed++
  console.log(`  ${mark} ${name}${detail ? `  ${detail}` : ''}`)
}

for (const c of CASES) {
  const path = join(ROOT, c.file)
  console.log(`\n━━ ${c.file}`)
  if (!existsSync(path)) {
    if (c.onMissing === 'skip') {
      console.log('  - 跳过（文件未就绪）')
      continue
    }
    ok('文件存在', false)
    continue
  }

  if (c.expectError) {
    try {
      await extractPages(path)
      ok('应抛出 PdfExtractError', false, '未抛出')
    } catch (err) {
      const msg = err instanceof PdfExtractError ? err.message : String(err)
      ok('PdfExtractError 消息匹配', c.expectError.test(msg), `「${msg.slice(0, 40)}…」`)
    }
    continue
  }

  let pages: PdfPageText[]
  try {
    pages = await extractPages(path)
  } catch (err) {
    ok('抽取成功', false, String(err).slice(0, 80))
    continue
  }
  const totalChars = pages.reduce((s, p) => s + p.text.length, 0)
  const chunks = buildChunks(pages)
  const index = new (await import('../src/rag/bm25')).BM25Index(chunks)
  const title = guessThesisTitle(pages)
  const abstract = extractAbstract(pages)

  console.log(`  页数 ${pages.length} · 字符 ${totalChars} · 分块 ${chunks.length}`)
  ok('页数达标', !c.minPages || pages.length >= c.minPages)
  ok('分块数达标', !c.minChunks || chunks.length >= c.minChunks)
  ok('标题识别', !c.title || c.title.test(title), `「${title.slice(0, 50)}」`)
  ok('摘要定位', !c.abstract || c.abstract.test(abstract), `「${abstract.slice(0, 40)}…」`)

  for (const r of c.retrieval ?? []) {
    const hits = retrieve(index, r.query, 3)
    const joined = hits.map((h) => h.text).join(' ')
    ok(`检索「${r.query.slice(0, 18)}」命中关键词`, hits.length > 0 && r.shouldContain.test(joined))
  }
}

console.log(`\n${failed === 0 ? '🎉 全部通过' : `❌ ${failed} 项未通过`}`)
process.exitCode = failed === 0 ? 0 : 1
