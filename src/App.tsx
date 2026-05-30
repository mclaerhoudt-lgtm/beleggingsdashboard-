import React, { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Toaster } from 'react-hot-toast'
import { useKoersen } from './hooks/useKoersen'
import { usePortfolio } from './hooks/usePortfolio'
import { Overzicht } from './components/tabs/Overzicht'
import { Logboek } from './components/tabs/Logboek'
import { Posities } from './components/tabs/Posities'
import { Toekomst } from './components/tabs/Toekomst'
import { Markt } from './components/tabs/Markt'
import { Import } from './components/tabs/Import'

const TABS = [
  { id: 'overzicht', label: 'Overzicht' },
  { id: 'logboek', label: 'Logboek' },
  { id: 'posities', label: 'Posities' },
  { id: 'toekomst', label: 'Toekomst' },
  { id: 'markt', label: 'Markt' },
  { id: 'import', label: 'Import' },
] as const

type TabId = typeof TABS[number]['id']

function getInitialTab(): TabId {
  const params = new URLSearchParams(window.location.search)
  const tab = params.get('tab') as TabId | null
  return TABS.find(t => t.id === tab) ? tab! : 'overzicht'
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab)
  const [toekomstRendement, setToekomstRendement] = useState<number | null>(null)
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
  const portfolio = usePortfolio(koersen)

  const tabContent: Record<TabId, React.ReactNode> = {
    overzicht: (
      <Overzicht
        portfolioValue={portfolio.portfolioValue}
        totaalIngelegd={portfolio.totaalIngelegd}
        rendement={portfolio.rendement}
        rendementPct={portfolio.rendementPct}
        settings={portfolio.settings}
        onSettingsChange={portfolio.setSettings}
        transactions={portfolio.transactions}
        accountEvents={portfolio.accountEvents}
        manualEntries={portfolio.manualEntries}
        positions={portfolio.positions}
        loading={koersenLoading}
      />
    ),
    logboek: (
      <Logboek
        transactions={portfolio.transactions}
        accountEvents={portfolio.accountEvents}
        manualEntries={portfolio.manualEntries}
        onNavigateToToekomst={(r) => { setToekomstRendement(r); setActiveTab('toekomst') }}
      />
    ),
    posities: (
      <Posities
        positions={portfolio.positions}
        koersen={koersen}
        loading={koersenLoading}
      />
    ),
    toekomst: <Toekomst initialRendement={toekomstRendement} portfolioValue={portfolio.portfolioValue} />,
    markt: (
      <Markt
        transactions={portfolio.transactions}
        koersen={koersen}
      />
    ),
    import: (
      <Import
        transactions={portfolio.transactions}
        accountEvents={portfolio.accountEvents}
        manualEntries={portfolio.manualEntries}
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

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <h1 className="text-base font-bold text-gray-900 dark:text-white whitespace-nowrap">
            Beleggingsdashboard
          </h1>

          {/* Tab navigation – scrollable on mobile */}
          <nav className="flex-1 overflow-x-auto scrollbar-hide">
            <div className="flex gap-1 min-w-max">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap min-h-[36px] ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          {/* Dark mode toggle */}
          <button
            onClick={() => setDark(d => !d)}
            className="shrink-0 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Schakel donkere modus"
          >
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
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
    </div>
  )
}
