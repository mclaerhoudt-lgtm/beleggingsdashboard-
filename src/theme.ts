// Centrale kleurdefinities voor plekken waar Tailwind-classes niet werken
// (recharts SVG-props, inline styles). Moet in sync blijven met de
// --color-blue-* overrides in src/index.css — dat is waar dezelfde
// DEGIRO-achtige accentkleur voor alle gewone bg-blue-*/text-blue-*
// Tailwind-classes vandaan komt.
export const COLORS = {
  primary: '#1a73e8',
  primaryDark: '#1557b0',
  secondary: '#1d9e75',
  warn: '#d85a30',
  grid: '#e8eaed',
  axisMuted: '#9aa0a6',
  ink: '#202124',
  positive: '#16a34a',
  positiveLight: '#86efac',
  negative: '#dc2626',
  negativeLight: '#fca5a5',
} as const

// Categorische reeks voor grafieken met meerdere series/fases (allocatie, inlegfases).
export const CATEGORICAL_COLORS = [
  COLORS.primary, COLORS.secondary, '#7c3aed', COLORS.warn, '#0891b2', '#db2777',
] as const
