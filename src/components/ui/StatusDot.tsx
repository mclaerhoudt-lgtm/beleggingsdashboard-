import type { KoersData } from '../../types'
import { koersAge } from '../../hooks/useKoersen'

interface Props {
  koersData?: KoersData
}

export function StatusDot({ koersData }: Props) {
  const age = koersAge(koersData)
  const color = age === 'fresh'
    ? 'bg-green-500'
    : age === 'recent'
    ? 'bg-yellow-400'
    : 'bg-gray-400'
  const title = age === 'fresh' ? '< 5 min' : age === 'recent' ? '< 1 uur' : 'Ouder dan 1 uur'

  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${color} shrink-0`}
      title={title}
    />
  )
}
