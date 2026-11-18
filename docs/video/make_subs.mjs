/**
 * 生成演示视频字幕（subs.srt）
 * 时间轴 = 段起点 + 段内配音窗口按句字数比例分配
 */
import { readFileSync, statSync } from 'node:fs'

const audioDur = (id) => (statSync(new URL(`./audio/n${id}.wav`, import.meta.url)).size - 44) / 44100

// 段定义：id / 视频时长 / 旁白延迟(秒)
const SEGS = [
  { id: 's1', len: audioDur('s1') + 0.8, delay: 0.1 },
  { id: 's2', len: audioDur('s2') + 0.8, delay: 0.15 },
  { id: 's3', len: 85.325, delay: 2.5 },
  { id: 's4', len: audioDur('s4') + 0.8, delay: 0.15 },
  { id: 's5a', len: 72.318, delay: 0.2 },
  { id: 's5b', len: 48.31, delay: 0.2 },
  { id: 's5c', len: 45.308, delay: 0.3 },
  { id: 's6', len: audioDur('s6') + 1.0, delay: 0.1 },
]

const lines = readFileSync(new URL('./narration.txt', import.meta.url), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    const [id, text] = l.split('|')
    return { id, text }
  })

const fmt = (t) => {
  const h = String(Math.floor(t / 3600)).padStart(2, '0')
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0')
  const s = String(Math.floor(t % 60)).padStart(2, '0')
  const ms = String(Math.floor((t % 1) * 1000)).padStart(3, '0')
  return `${h}:${m}:${s},${ms}`
}

let cursor = 0
let idx = 1
const out = []
for (const seg of SEGS) {
  const entry = lines.find((l) => l.id === seg.id)
  const segStart = cursor
  cursor += seg.len
  if (!entry) continue
  // 按句号/问号/感叹号切句（保留短句合并 <10 字）
  const rawSentences = entry.text.split(/(?<=[。？！])/).map((s) => s.trim()).filter(Boolean)
  const sentences = []
  for (const s of rawSentences) {
    if (sentences.length && s.length < 10 && sentences[sentences.length - 1].length < 26) {
      sentences[sentences.length - 1] += s
    } else {
      sentences.push(s)
    }
  }
  const total = sentences.reduce((sum, s) => sum + s.length, 0)
  const audioWindow = Math.min(audioDur(seg.id), seg.len - seg.delay)
  let t = segStart + seg.delay
  for (const s of sentences) {
    const dur = (s.length / total) * audioWindow
    out.push(`${idx}\n${fmt(t)} --> ${fmt(Math.min(t + dur - 0.05, segStart + seg.len - 0.1))}\n${s}\n`)
    t += dur
    idx++
  }
}
process.stdout.write(out.join('\n'))
