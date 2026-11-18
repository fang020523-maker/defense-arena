/**
 * Prompt 演进日志浏览页（#/prompts）
 * 供演示视频「AI 协同过程复现」段落与评委在线浏览使用。
 */
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useEffect, useState } from 'react'

export function PromptLogPage() {
  const [md, setMd] = useState('加载中…')

  useEffect(() => {
    fetch('/PROMPT_LOG.md')
      .then((r) => r.text())
      .then(setMd)
      .catch(() => setMd('日志加载失败，请查看仓库根目录 PROMPT_LOG.md'))
  }, [])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-10">
        <div className="mb-6 flex items-center gap-3">
          <a
            href="/"
            className="chip hover:!border-neon-cyan/50 hover:!text-frost"
          >
            ← 返回答辩厅
          </a>
          <span className="chip !border-neon-violet/40 !text-neon-violet">AI 协同开发全记录</span>
        </div>
        <div className="prose-invert panel p-8 text-sm leading-relaxed text-frost/90 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-black [&_h1]:text-gradient [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:border-l-4 [&_h2]:border-neon-cyan/60 [&_h2]:pl-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-frost [&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-neon-cyan [&_hr]:my-5 [&_hr]:border-line [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_pre]:my-3 [&_pre]:rounded-lg [&_pre]:bg-ink [&_pre]:p-3 [&_pre]:text-xs [&_strong]:text-frost [&_table]:w-full [&_table]:text-xs [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-line [&_th]:bg-ink [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5">
          <Markdown remarkPlugins={[remarkGfm]}>{md}</Markdown>
        </div>
      </div>
    </div>
  )
}
