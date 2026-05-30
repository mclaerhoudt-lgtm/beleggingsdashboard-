import type { ReactNode } from 'react'

interface Props {
  label: string
  value: string
  sub?: string
  positive?: boolean
  loading?: boolean
  color?: string        // explicit hex colour overrides positive/negative colouring
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
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-1">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
      {loading ? (
        <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      ) : (
        <p
          className={`text-2xl font-bold tabular-nums ${valueColor ?? ''}`}
          style={color ? { color } : undefined}
        >
          {value}
        </p>
      )}
      {sub && <p className="text-sm text-gray-400 dark:text-gray-500">{sub}</p>}
      {children}
    </div>
  )
}
