import React, { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Toaster } from 'react-hot-toast'
import {
  LayoutDashboard, CalendarDays, Briefcase, TrendingUp, LineChart, Download, Moon, Sun,
} from 'lucide-react'
import { useKoersen } from './hooks/useKoersen'
import { useHistorischeKoersen } from './hooks/useHistorischeKoersen'
import { usePortfolio } from './hooks/usePortfolio'
import { Overzicht } from './components/tabs/Overzicht'
import { Logboek } from './components/tabs/Logboek'
import { Posities } from './components/tabs/Posities'
import { Toekomst } from './components/tabs/Toekomst'
import { Markt } from './components/tabs/Markt'
import { Import } from './components/tabs/Import'

const TABS = [
  { id: 'overzicht', label: 'Overzicht', icon: LayoutDashboard },
  { id: 'logboek',   label: 'Logboek',   icon: CalendarDays },
  { id: 'posities',  label: 'Posities',  icon: Briefcase },
  { id: 'toekomst',  label: 'Toekomst',  icon: TrendingUp },
  { id: 'markt',     label: 'Markt',     icon: LineChart },
  { id: 'import',    label: 'Import',    icon: Download },
] as const

type TabId = typeof TABS[number]['id']

function getInitialTab(): TabId {
  const params = new URLSearchParams(window.location.search)
  const tab = params.get('tab') as TabId | null
  return TABS.find(t => t.id === tab) ? tab! : 'overzicht'
}

function DarkToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="shrink-0 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
      aria-label="Schakel donkere modus"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab)
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('bdash_dark')
    if (stored !== null) return stored === 'true'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('bdash_dark', String(dark))
  }, [dark])

  const { koersen, loading: koersenLoading } = useKoersen()
  const { koersHistorie, koersHistorieDagelijks } = useHistorischeKoersen()
  const portfolio = usePortfolio(koersen)

  const tabContent: Record<TabId, React.ReactNode> = {
    overzicht: (
      <Overzicht
        portfolioValue={portfolio.portfolioValue}
        totaalIngelegd={portfolio.totaalIngelegd}
        rendement={portfolio.rendement}
        rendementPct={portfolio.rendementPct}
        eersteJaar={portfolio.eersteJaar}
        laatsteDatum={portfolio.laatsteDatum}
        settings={portfolio.settings}
        onSettingsChange={portfolio.setSettings}
        transactions={portfolio.transactions}
        accountEvents={portfolio.accountEvents}
        manualEntries={portfolio.manualEntries}
        positions={portfolio.positions}
        koersHistorie={koersHistorie}
        koersHistorieDagelijks={koersHistorieDagelijks}
        koersen={koersen}
        loading={koersenLoading}
      />
    ),
    logboek: (
      <Logboek
        transactions={portfolio.transactions}
        accountEvents={portfolio.accountEvents}
        manualEntries={portfolio.manualEntries}
        koersHistorie={koersHistorie}
        koersen={koersen}
      />
    ),
    posities: (
      <Posities
        positions={portfolio.positions}
        koersen={koersen}
        loading={koersenLoading}
      />
    ),
    toekomst: <Toekomst portfolioValue={portfolio.portfolioValue} />,
    markt: (
      <Markt
        transactions={portfolio.transactions}
        koersen={koersen}
        koersHistorie={koersHistorie}
      />
    ),
    import: (
      <Import
        transactions={portfolio.transactions}
        accountEvents={portfolio.accountEvents}
        manualEntries={portfolio.manualEntries}
        laatsteDatum={portfolio.laatsteDatum}
        onTransactions={portfolio.setTransactions}
        onAccountEvents={portfolio.setAccountEvents}
        onManualEntries={portfolio.setManualEntries}
        onReset={portfolio.resetAll}
      />
    ),
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
      <Toaster position="top-right" toastOptions={{ className: '!rounded-xl !text-sm' }} />

      {/* ── Desktop header (md+): title + tabs + dark toggle ── */}
      <header className="hidden md:block sticky top-0 z-30 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <h1 className="text-base font-bold text-gray-900 dark:text-white whitespace-nowrap">
            Beleggingsdashboard
          </h1>

          <nav className="flex-1 overflow-x-auto scrollbar-hide">
            <div className="flex gap-1 min-w-max">
              {TABS.map(tab => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap min-h-[36px] ${
                      isActive
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </nav>

          <DarkToggle dark={dark} onToggle={() => setDark(d => !d)} />
        </div>
      </header>

      {/* ── Mobile header: dark toggle only ── */}
      <header className="md:hidden sticky top-0 z-30 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-100 dark:border-gray-800">
        <div className="h-12 flex items-center justify-between px-4">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
            {(() => {
              const active = TABS.find(t => t.id === activeTab)
              if (!active) return null
              const Icon = active.icon
              return <><Icon size={16} className="text-blue-600 dark:text-blue-400" /> {active.label}</>
            })()}
          </span>
          <DarkToggle dark={dark} onToggle={() => setDark(d => !d)} />
        </div>
      </header>

      {/* ── Main content ── */}
      {/* pb-20 on mobile keeps content above the fixed bottom nav */}
      <main className="max-w-7xl mx-auto px-4 py-6 pb-24 md:pb-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {tabContent[activeTab]}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Mobile bottom tab bar ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 shadow-[0_-2px_12px_-4px_rgba(0,0,0,0.08)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors"
            >
              <span
                className={`flex items-center justify-center w-9 h-7 rounded-full transition-colors ${
                  isActive ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                }`}
              >
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.5 : 1.75}
                  className={isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}
                />
              </span>
              <span
                className={`text-[10px] font-medium leading-none ${
                  isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
