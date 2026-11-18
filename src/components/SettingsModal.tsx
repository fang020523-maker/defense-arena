/**
 * 设置：API Key / 模型选择 / 连接测试
 */
import { Check, ExternalLink, KeyRound, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { pingApiKey, type ModelId } from '../api/deepseek'
import { useDefense } from '../store/useDefense'
import { Modal, Segmented } from './ui'

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useDefense((s) => s.settings)
  const setSettings = useDefense((s) => s.setSettings)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<boolean | null>(null)

  const test = async () => {
    if (!settings.apiKey.trim()) return
    setTesting(true)
    setResult(null)
    try {
      await pingApiKey(settings.apiKey.trim())
      setResult(true)
    } catch {
      setResult(false)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="设置" subtitle="配置仅保存在本地浏览器（localStorage）">
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-mist">
            <KeyRound size={12} className="text-neon-amber" /> DeepSeek API Key
            {result === true && <span className="chip !border-neon-emerald/50 !py-0 !text-neon-emerald">✓ 有效</span>}
            {result === false && <span className="chip !border-neon-rose/50 !py-0 !text-neon-rose">✗ 无效</span>}
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              className="input-base font-mono text-xs"
              placeholder="sk-…"
              value={settings.apiKey}
              onChange={(e) => {
                setSettings({ apiKey: e.target.value.trim() })
                setResult(null)
              }}
            />
            <button className="btn-ghost shrink-0 !px-3 text-xs" onClick={() => void test()} disabled={testing}>
              {testing ? <Loader2 size={13} className="animate-spin" /> : result === true ? <Check size={13} /> : '测试连接'}
            </button>
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-[10px] text-mist/60">
            前往
            <a
              href="https://platform.deepseek.com/api_keys"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-neon-cyan/80 hover:text-neon-cyan"
            >
              platform.deepseek.com <ExternalLink size={9} />
            </a>
            创建 Key。新版账户一般自带免费额度。
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-mist">推理模型</label>
          <Segmented<ModelId>
            value={settings.model}
            onChange={(v) => setSettings({ model: v })}
            options={[
              { value: 'deepseek-chat', label: 'deepseek-chat', hint: '快速·推荐' },
              { value: 'deepseek-reasoner', label: 'deepseek-reasoner', hint: '深度思考' },
            ]}
          />
          <p className="mt-1.5 text-[10px] leading-relaxed text-mist/60">
            reasoner 模式下评委会在心里先「深度思考」再提问，问题更犀利，但整场答辩耗时更长（UI 可看到思考状态）。
          </p>
        </div>

        <div className="rounded-lg border border-line bg-ink/40 p-3 text-[11px] leading-relaxed text-mist/70">
          <p className="mb-1 font-semibold text-frost">🔒 隐私说明</p>
          论文 PDF 全程在你本机浏览器解析，不会上传任何服务器；调用 DeepSeek 时仅发送检索出的相关片段用于生成质询/回答。
        </div>
      </div>
    </Modal>
  )
}
