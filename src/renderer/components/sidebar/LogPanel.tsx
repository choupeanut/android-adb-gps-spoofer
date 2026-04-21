import { useEffect, useRef, useState } from 'react'
import { useLogStore } from '../../stores/log.store'

const levelStyle: Record<string, string> = {
  info:  'text-blue-300',
  ok:    'text-green-400',
  warn:  'text-yellow-400',
  error: 'text-red-400'
}

const levelIcon: Record<string, string> = {
  info:  '[i]',
  ok:    '[✓]',
  warn:  '[!]',
  error: '[✗]'
}

function fmtTime(ts: number): string {
  return new Date(ts).toISOString().slice(11, 23)
}

export function LogPanel(): JSX.Element {
  const entries = useLogStore((s) => s.entries)
  const clear = useLogStore((s) => s.clear)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const [logDir, setLogDir] = useState<string>('')

  // Load existing logs on mount
  useEffect(() => {
    window.api.getLogs().then((logs: any[]) => {
      useLogStore.getState().setEntries(logs)
    })
    if ((window.api as any).getLogDir) {
      ;(window.api as any).getLogDir().then((dir: string) => setLogDir(dir)).catch(() => {})
    }
  }, [])

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [entries, autoScroll])

  const handleCopy = (): void => {
    const text = entries
      .map((e) => `${fmtTime(e.ts)} ${levelIcon[e.level]} ${e.msg}`)
      .join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const filtered = filter === 'all'
    ? entries
    : entries.filter((e) => e.level === filter)

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border flex-shrink-0">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="text-xs bg-input border border-border rounded px-1.5 py-0.5 text-foreground"
        >
          <option value="all">All</option>
          <option value="ok">✓ OK</option>
          <option value="warn">! Warn</option>
          <option value="error">✗ Error</option>
          <option value="info">i Info</option>
        </select>

        <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded"
          />
          Auto
        </label>

        <button
          onClick={handleCopy}
          className="text-xs px-2 py-0.5 bg-secondary text-secondary-foreground rounded hover:opacity-80"
        >
          {copied ? 'Copied!' : 'Copy all'}
        </button>

        <button
          onClick={clear}
          className="text-xs px-2 py-0.5 bg-secondary text-muted-foreground rounded hover:opacity-80"
        >
          Clear
        </button>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto font-mono text-[10px] px-2 py-1 space-y-px">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground p-2">No log entries yet. Connect a device and try Teleport.</p>
        ) : (
          filtered.map((entry, i) => (
            <div key={i} className="flex gap-1.5 leading-4 hover:bg-white/5 px-1 rounded">
              <span className="text-muted-foreground flex-shrink-0 select-none">
                {fmtTime(entry.ts)}
              </span>
              <span className={`flex-shrink-0 select-none ${levelStyle[entry.level]}`}>
                {levelIcon[entry.level]}
              </span>
              <span className="text-foreground/90 break-all">{entry.msg}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Status bar */}
      <div className="px-3 py-1 border-t border-border text-[10px] text-muted-foreground flex-shrink-0 space-y-0.5">
        <div>
          {entries.length} entries
          {filtered.length !== entries.length && ` (${filtered.length} shown)`}
        </div>
        {logDir && (
          <div className="truncate" title={logDir}>
            Log files: <span className="text-foreground/70 select-all">{logDir}</span>
          </div>
        )}
      </div>
    </div>
  )
}
