/**
 * 共享 UI 基元：配色映射、开关、分段选择、弹窗壳
 */
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { AccentColor } from '../types'

/** 霓虹配色 → Tailwind 类名映射 */
export const ACCENT: Record<AccentColor, { text: string; ring: string; border: string; hex: string }> = {
  cyan: { text: 'text-neon-cyan', ring: 'from-neon-cyan/80 to-neon-cyan/20', border: 'border-neon-cyan/50', hex: '#22d3ee' },
  violet: { text: 'text-neon-violet', ring: 'from-neon-violet/80 to-neon-violet/20', border: 'border-neon-violet/50', hex: '#a78bfa' },
  amber: { text: 'text-neon-amber', ring: 'from-neon-amber/80 to-neon-amber/20', border: 'border-neon-amber/50', hex: '#fbbf24' },
  rose: { text: 'text-neon-rose', ring: 'from-neon-rose/80 to-neon-rose/20', border: 'border-neon-rose/50', hex: '#fb7185' },
  emerald: { text: 'text-neon-emerald', ring: 'from-neon-emerald/80 to-neon-emerald/20', border: 'border-neon-emerald/50', hex: '#34d399' },
}

/* ---------------- 开关 ---------------- */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-lg border border-line bg-ink/50 px-3 py-2.5 text-left transition-colors hover:border-neon-cyan/40"
    >
      <span>
        <span className="block text-sm text-frost">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-mist/70">{hint}</span>}
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? 'bg-gradient-to-r from-neon-cyan to-neon-violet' : 'bg-line'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  )
}

/* ---------------- 分段选择 ---------------- */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string; hint?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-line bg-ink/50 p-1">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-md px-2 py-1.5 text-sm transition-all duration-150 ${
            value === opt.value
              ? 'bg-gradient-to-r from-neon-cyan/20 to-neon-violet/20 font-semibold text-frost shadow-[inset_0_0_0_1px_rgba(34,211,238,0.4)]'
              : 'text-mist hover:text-frost'
          }`}
        >
          {opt.label}
          {opt.hint && <span className="ml-1 text-xs text-mist/60">{opt.hint}</span>}
        </button>
      ))}
    </div>
  )
}

/* ---------------- 弹窗壳 ---------------- */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  wide?: boolean
}) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-abyss/80 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className={`panel relative flex max-h-[88vh] w-full flex-col overflow-hidden ${wide ? 'max-w-5xl' : 'max-w-lg'}`}
            initial={{ scale: 0.94, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 8, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            <div className="flex items-start justify-between border-b border-line/70 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-frost">{title}</h2>
                {subtitle && <p className="mt-0.5 text-xs text-mist">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-mist transition-colors hover:bg-panel-2 hover:text-frost"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
