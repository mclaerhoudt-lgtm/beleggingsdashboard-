import type { ReactNode } from 'react'

interface Props {
  label: string
  value: string
  sub?: string
  positive?: boolean
  loading?: boolean
  color?: string
  children?: ReactNode
}

export function MetricCard({ label, value, sub, positive, loading, color, children }: Props) {
  const valueColor = color
    ? undefined
    : positive === true
    ? 'text-green-600 dark:text-green-400'
    : positive === false
    ? 'text-red-500 dark:text-red-400'
    : 'text-gray-900 dark:text-white'

  return (
    // min-w-0 allows the card to shrink below its content size in a grid
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-1 min-w-0 overflow-hidden">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">{label}</p>
      {loading ? (
        <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      ) : (
        <p
          className={`font-bold tabular-nums leading-tight ${valueColor ?? ''}`}
          style={{
            // clamp scales from 0.85rem (narrow mobile) to 1.5rem (wide screens)
            fontSize: 'clamp(0.85rem, 4vw, 1.5rem)',
            color: color,
          }}
        >
          {value}
        </p>
      )}
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{sub}</p>}
      {children}
    </div>
  )
}
