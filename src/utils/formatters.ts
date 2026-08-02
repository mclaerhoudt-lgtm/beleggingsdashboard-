export function formatEuro(n: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function formatPct(n: number, decimals = 2): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(decimals)}%`
}

export function formatNumber(n: number, decimals = 2): string {
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

export function parseDegiroAmount(str: string | undefined | null): number {
  if (!str || str.trim() === '' || str.trim() === '-') return 0
  const cleaned = str.trim().replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

export function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('nl-NL')
}

// "5 aug 2026" — gebruikt voor bv. "data bijgewerkt t/m"
export function formatDatumKort(date: Date): string {
  return `${date.getDate()} ${MAANDEN[date.getMonth()].toLowerCase()} ${date.getFullYear()}`
}

export function monthKey(isoStr: string): string {
  const d = new Date(isoStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const MAANDEN = [
  'Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec',
]
