import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { parseTransactionsCsv, parseAccountCsv } from '../../utils/csvParser'
import { formatEuro } from '../../utils/formatters'
import type { Transaction, AccountEvent, ManualEntry } from '../../types'

interface Props {
  transactions: Transaction[]
  accountEvents: AccountEvent[]
  manualEntries: ManualEntry[]
  onTransactions: (t: Transaction[]) => void
  onAccountEvents: (e: AccountEvent[]) => void
  onManualEntries: (m: ManualEntry[]) => void
  onReset: () => void
}

interface Summary {
  transacties: number
  dividenden: number
  stortingen: number
  opnames: number
  skipped: number
}

export function Import({
  transactions, accountEvents, manualEntries,
  onTransactions, onAccountEvents, onManualEntries, onReset,
}: Props) {
  const txRef = useRef<HTMLInputElement>(null)
  const accRef = useRef<HTMLInputElement>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [manual, setManual] = useState<Omit<ManualEntry, 'id'>>({
    datum: new Date().toISOString().slice(0, 10),
    portefeuillewaarde: 0,
    totaalIngelegd: 0,
    periode: '',
    notitie: '',
  })

  async function readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target?.result as string)
      reader.onerror = reject
      reader.readAsText(file, 'utf-8')
    })
  }

  async function importTransactions() {
    const file = txRef.current?.files?.[0]
    if (!file) return toast.error('Selecteer een Transactions.csv bestand')
    const text = await readFile(file)
    const { transactions: updated, added, skipped } = parseTransactionsCsv(text, transactions)
    onTransactions(updated)
    toast.success(`${added} transacties geïmporteerd${skipped ? `, ${skipped} overgeslagen` : ''}`)
    setSummary(s => ({ ...s ?? { dividenden: 0, stortingen: 0, opnames: 0 }, transacties: (s?.transacties ?? 0) + added, skipped: (s?.skipped ?? 0) + skipped }))
    if (txRef.current) txRef.current.value = ''
  }

  async function importAccount() {
    const file = accRef.current?.files?.[0]
    if (!file) return toast.error('Selecteer een Account.csv bestand')
    const text = await readFile(file)
    const { events: updated, stortingen, opnames, dividenden, skipped } = parseAccountCsv(text, accountEvents)
    onAccountEvents(updated)
    toast.success(`${stortingen} stortingen, ${opnames} opnames, ${dividenden} dividenden geïmporteerd`)
    setSummary(s => ({
      ...s ?? { transacties: 0 },
      stortingen: (s?.stortingen ?? 0) + stortingen,
      opnames: (s?.opnames ?? 0) + opnames,
      dividenden: (s?.dividenden ?? 0) + dividenden,
      skipped: (s?.skipped ?? 0) + skipped,
    }))
    if (accRef.current) accRef.current.value = ''
  }

  async function importBoth() {
    const txFile = txRef.current?.files?.[0]
    const accFile = accRef.current?.files?.[0]
    if (!txFile && !accFile) return toast.error('Selecteer minimaal één bestand')
    const sum: Summary = { transacties: 0, dividenden: 0, stortingen: 0, opnames: 0, skipped: 0 }

    if (txFile) {
      const text = await readFile(txFile)
      const r = parseTransactionsCsv(text, transactions)
      onTransactions(r.transactions)
      sum.transacties += r.added
      sum.skipped += r.skipped
    }
    if (accFile) {
      const text = await readFile(accFile)
      const r = parseAccountCsv(text, accountEvents)
      onAccountEvents(r.events)
      sum.stortingen += r.stortingen
      sum.opnames += r.opnames
      sum.dividenden += r.dividenden
      sum.skipped += r.skipped
    }

    toast.success('Import geslaagd!')
    setSummary(sum)
    if (txRef.current) txRef.current.value = ''
    if (accRef.current) accRef.current.value = ''
  }

  function addManualEntry() {
    const entry: ManualEntry = { ...manual, id: `manual-${Date.now()}`, datum: new Date(manual.datum).toISOString() }
    onManualEntries([...manualEntries, entry])
    toast.success('Entry toegevoegd')
    setShowManual(false)
  }

  function handleReset() {
    if (!confirmReset) { setConfirmReset(true); return }
    onReset()
    setSummary(null)
    setConfirmReset(false)
    toast.success('Alle data verwijderd')
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* CSV Import */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
        <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200">DEGIRO CSV importeren</h2>

        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-600 dark:text-gray-300 font-medium">Transactions.csv</label>
            <input ref={txRef} type="file" accept=".csv"
              className="mt-1 block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100 cursor-pointer" />
          </div>
          <div>
            <label className="text-sm text-gray-600 dark:text-gray-300 font-medium">Account.csv</label>
            <input ref={accRef} type="file" accept=".csv"
              className="mt-1 block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100 cursor-pointer" />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button onClick={importTransactions}
            className="min-h-[44px] px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-medium transition-colors">
            Transactions.csv
          </button>
          <button onClick={importAccount}
            className="min-h-[44px] px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-medium transition-colors">
            Account.csv
          </button>
          <button onClick={importBoth}
            className="min-h-[44px] px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">
            Beide importeren
          </button>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-5">
          <h3 className="font-semibold text-green-700 dark:text-green-300 mb-3">Import samenvatting</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><p className="text-xs text-green-500">Transacties</p><p className="text-xl font-bold text-green-700 dark:text-green-300">{summary.transacties}</p></div>
            <div><p className="text-xs text-green-500">Dividenden</p><p className="text-xl font-bold text-green-700 dark:text-green-300">{summary.dividenden}</p></div>
            <div><p className="text-xs text-green-500">Stortingen</p><p className="text-xl font-bold text-green-700 dark:text-green-300">{summary.stortingen}</p></div>
            <div><p className="text-xs text-green-500">Opnames</p><p className="text-xl font-bold text-green-700 dark:text-green-300">{summary.opnames}</p></div>
            <div><p className="text-xs text-green-500">Overgeslagen</p><p className="text-xl font-bold text-green-700 dark:text-green-300">{summary.skipped}</p></div>
          </div>
        </div>
      )}

      {/* Current data stats */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
        <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-3">Huidige data</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
            <p className="text-2xl font-bold text-gray-800 dark:text-white">{transactions.length}</p>
            <p className="text-xs text-gray-500">Transacties</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
            <p className="text-2xl font-bold text-gray-800 dark:text-white">{accountEvents.filter(e => e.type === 'dividend').length}</p>
            <p className="text-xs text-gray-500">Dividenden</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
            <p className="text-2xl font-bold text-gray-800 dark:text-white">{accountEvents.filter(e => e.type === 'storting').length}</p>
            <p className="text-xs text-gray-500">Stortingen</p>
          </div>
        </div>
      </div>

      {/* Manual entry */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200">Handmatig invoeren</h2>
          <button onClick={() => setShowManual(!showManual)}
            className="text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline">
            {showManual ? 'Verberg' : 'Toevoegen'}
          </button>
        </div>

        {showManual && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Datum</label>
                <input type="date" value={manual.datum}
                  onChange={e => setManual(m => ({ ...m, datum: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Periode</label>
                <input type="text" placeholder="bijv. Mei 2025" value={manual.periode}
                  onChange={e => setManual(m => ({ ...m, periode: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Portefeuillewaarde (€)</label>
                <input type="number" step="0.01" value={manual.portefeuillewaarde || ''}
                  onChange={e => setManual(m => ({ ...m, portefeuillewaarde: parseFloat(e.target.value) || 0 }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Totaal ingelegd (€)</label>
                <input type="number" step="0.01" value={manual.totaalIngelegd || ''}
                  onChange={e => setManual(m => ({ ...m, totaalIngelegd: parseFloat(e.target.value) || 0 }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Notitie</label>
              <textarea value={manual.notitie}
                onChange={e => setManual(m => ({ ...m, notitie: e.target.value }))}
                rows={2}
                className="mt-1 w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 resize-none" />
            </div>
            <button onClick={addManualEntry}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors min-h-[44px]">
              Toevoegen
            </button>
          </div>
        )}

        {manualEntries.length > 0 && (
          <div className="mt-2 space-y-2">
            {manualEntries.slice(-5).reverse().map(e => (
              <div key={e.id} className="flex justify-between items-center text-sm py-2 border-t border-gray-50 dark:border-gray-700">
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-200">{e.periode || new Date(e.datum).toLocaleDateString('nl-NL')}</p>
                  {e.notitie && <p className="text-xs text-gray-400">{e.notitie}</p>}
                </div>
                <p className="font-medium text-gray-800 dark:text-gray-200 tabular-nums">{formatEuro(e.portefeuillewaarde)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reset */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-red-100 dark:border-red-900/30">
        <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-3">Gevaarzone</h2>
        {confirmReset ? (
          <div className="space-y-3">
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">Weet je zeker dat je alle data wilt verwijderen?</p>
            <div className="flex gap-3">
              <button onClick={handleReset}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium min-h-[44px]">
                Ja, verwijder alles
              </button>
              <button onClick={() => setConfirmReset(false)}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-medium min-h-[44px]">
                Annuleren
              </button>
            </div>
          </div>
        ) : (
          <button onClick={handleReset}
            className="min-h-[44px] px-5 py-2.5 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-sm font-medium transition-colors">
            Reset alle data
          </button>
        )}
      </div>
    </div>
  )
}
