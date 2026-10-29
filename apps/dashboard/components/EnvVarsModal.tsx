'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Plus, Trash2, Eye, EyeOff, KeyRound, RotateCcw, Save, Loader2, FileCode, List, Undo2 } from 'lucide-react'
import { updateApplicationEnvVars, getApplicationEnvVars } from '../app/actions'

interface EnvVarsModalProps {
  appId: string
  appName: string
  initialEnvVars?: Record<string, string> | null
  isOpen: boolean
  onClose: () => void
  onRedeployStarted?: () => void
}

interface EnvRow {
  id: string
  key: string
  value: string
  showSecret: boolean
}

export default function EnvVarsModal({
  appId,
  appName,
  initialEnvVars,
  isOpen,
  onClose,
  onRedeployStarted,
}: EnvVarsModalProps) {
  const [mode, setMode] = useState<'pairs' | 'raw'>('pairs')
  const [rows, setRows] = useState<EnvRow[]>([])
  const [rawText, setRawText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [hasDraft, setHasDraft] = useState(false)

  // Track initialization per modal open session so external parent refreshes do NOT wipe user keystrokes
  const isInitializedRef = useRef(false)
  const initialDataLoadedRef = useRef(false)
  const initialEnvVarsRef = useRef(initialEnvVars)
  initialEnvVarsRef.current = initialEnvVars

  const draftKey = `aether_env_draft_${appId}`

  function objectToRaw(obj: Record<string, string>): string {
    return Object.entries(obj)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
  }

  function rowsToRaw(currentRows: EnvRow[]): string {
    return currentRows
      .map((r) => {
        const k = r.key.trim()
        if (k) {
          return `${k}=${r.value}`
        }
        if (r.value) {
          return `=${r.value}`
        }
        return ''
      })
      .filter((line, idx, arr) => line !== '' || idx === arr.length - 1)
      .join('\n')
  }

  function rawToRows(text: string): EnvRow[] {
    const lines = text.split('\n')
    const parsedRows: EnvRow[] = []

    lines.forEach((rawLine, idx) => {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) return
      const eqIdx = line.indexOf('=')
      if (eqIdx !== -1) {
        const k = line.slice(0, eqIdx).trim()
        let v = line.slice(eqIdx + 1).trim()
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1)
        }
        parsedRows.push({
          id: `row-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          key: k,
          value: v,
          showSecret: false,
        })
      } else if (line.length > 0) {
        // Line without =
        parsedRows.push({
          id: `row-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          key: line,
          value: '',
          showSecret: false,
        })
      }
    })

    return parsedRows
  }

  const initFromObject = useCallback((envObj: Record<string, string>) => {
    const parsedRows: EnvRow[] = Object.entries(envObj).map(([k, v], idx) => ({
      id: `${k}-${idx}-${Date.now()}`,
      key: k,
      value: v,
      showSecret: false,
    }))
    setRows(parsedRows)
    setRawText(objectToRaw(envObj))
  }, [])

  // Initialize once per open session
  useEffect(() => {
    if (!isOpen) {
      isInitializedRef.current = false
      initialDataLoadedRef.current = false
      setError(null)
      setSuccessMsg(null)
      return
    }

    if (isInitializedRef.current) return
    isInitializedRef.current = true

    // Check if there is an unsaved draft in sessionStorage from previous edits/page switch
    let draftLoaded = false
    if (typeof window !== 'undefined') {
      try {
        const savedDraftJson = sessionStorage.getItem(draftKey)
        if (savedDraftJson) {
          const draft = JSON.parse(savedDraftJson)
          if (draft && (Array.isArray(draft.rows) || typeof draft.rawText === 'string')) {
            if (Array.isArray(draft.rows) && draft.rows.length > 0) {
              setRows(draft.rows)
              setRawText(draft.rawText || rowsToRaw(draft.rows))
            } else if (draft.rawText) {
              setRawText(draft.rawText)
              setRows(rawToRows(draft.rawText))
            }
            if (draft.mode === 'raw' || draft.mode === 'pairs') {
              setMode(draft.mode)
            }
            setHasDraft(true)
            draftLoaded = true
            initialDataLoadedRef.current = true
          }
        }
      } catch {
        // Ignore JSON error
      }
    }

    if (draftLoaded) return

    // Normal initialization from props or API
    const initVars = initialEnvVarsRef.current
    if (initVars && Object.keys(initVars).length > 0) {
      initFromObject(initVars)
      initialDataLoadedRef.current = true
    } else {
      setIsLoading(true)
      getApplicationEnvVars(appId)
        .then((res) => {
          if (res?.envVars) {
            initFromObject(res.envVars)
          }
        })
        .finally(() => {
          setIsLoading(false)
          initialDataLoadedRef.current = true
        })
    }
  }, [isOpen, appId, initFromObject, draftKey])

  // Persist edits to sessionStorage draft whenever rows or rawText changes (only after initial load)
  useEffect(() => {
    if (!isOpen || !initialDataLoadedRef.current) return

    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({
            mode,
            rows,
            rawText,
            timestamp: Date.now(),
          })
        )
      } catch {
        // Ignore quota errors
      }
    }
  }, [isOpen, rows, rawText, mode, draftKey])

  function handleDiscardDraft() {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(draftKey)
    }
    setHasDraft(false)
    const initVars = initialEnvVarsRef.current || {}
    initFromObject(initVars)
    setSuccessMsg('Reverted to saved values.')
    setTimeout(() => setSuccessMsg(null), 2000)
  }

  function handleSwitchMode(targetMode: 'pairs' | 'raw') {
    if (targetMode === 'raw') {
      // Sync rows to raw text preserving all rows entered
      setRawText(rowsToRaw(rows))
    } else {
      // Sync raw text to rows preserving all parsed keys
      setRows(rawToRows(rawText))
    }
    setMode(targetMode)
  }

  function handleAddRow() {
    setRows((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        key: '',
        value: '',
        showSecret: true,
      },
    ])
  }

  function handleUpdateRow(id: string, field: 'key' | 'value', val: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        if (field === 'key') {
          // Keep uppercase env var standard, replace space with underscore
          return { ...r, key: val.replace(/\s+/g, '_') }
        }
        return { ...r, [field]: val }
      })
    )
  }

  function handleToggleShow(id: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, showSecret: !r.showSecret } : r))
    )
  }

  function handleDeleteRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  async function handleSave(redeploy: boolean) {
    setError(null)
    setSuccessMsg(null)
    setIsSaving(true)

    // Build env object
    const envObj: Record<string, string> = {}
    if (mode === 'raw') {
      const parsed = rawToRows(rawText)
      for (const r of parsed) {
        if (r.key.trim()) {
          envObj[r.key.trim()] = r.value
        }
      }
    } else {
      for (const r of rows) {
        const k = r.key.trim()
        if (k) {
          envObj[k] = r.value
        }
      }
    }

    try {
      const res = await updateApplicationEnvVars(appId, envObj, redeploy)
      if (res.error) {
        setError(res.error)
        setIsSaving(false)
        return
      }

      // Clear draft on successful save
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(draftKey)
      }
      setHasDraft(false)

      setSuccessMsg(
        redeploy
          ? 'Environment variables updated! Redeployment triggered.'
          : 'Environment variables saved successfully.'
      )

      if (redeploy && onRedeployStarted) {
        onRedeployStarted()
      }

      setTimeout(() => {
        onClose()
      }, 1000)
    } catch {
      setError('An error occurred while saving environment variables.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-foreground flex items-center gap-2">
                Environment Variables
                {hasDraft && (
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-medium">
                    Draft Restored
                  </span>
                )}
              </h3>
              <p className="text-xs text-muted-foreground">
                Configure runtime secrets & variables for <span className="text-foreground font-mono font-medium">{appName}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasDraft && (
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="text-xs text-amber-400/80 hover:text-amber-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-amber-500/10 transition-colors"
                title="Discard unsaved draft and revert to saved settings"
              >
                <Undo2 className="w-3.5 h-3.5" /> Revert
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-muted-foreground hover:bg-slate-800 hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-800/60 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => handleSwitchMode('pairs')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                mode === 'pairs'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Key-Value
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('raw')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                mode === 'raw'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              Raw .env
            </button>
          </div>

          {mode === 'pairs' && (
            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded-md hover:bg-primary/10"
            >
              <Plus className="w-3.5 h-3.5" /> Add Variable
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-xs">Loading environment variables...</p>
            </div>
          ) : mode === 'pairs' ? (
            <div className="space-y-2.5">
              {rows.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl bg-slate-950/20 p-6">
                  <p className="text-sm text-muted-foreground">No environment variables defined yet.</p>
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add First Variable
                  </button>
                </div>
              ) : (
                rows.map((row) => (
                  <div key={row.id} className="flex items-center gap-2 group">
                    <input
                      type="text"
                      value={row.key}
                      onChange={(e) => handleUpdateRow(row.id, 'key', e.target.value)}
                      placeholder="VARIABLE_NAME"
                      className="w-1/3 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/40"
                    />
                    <div className="relative flex-1">
                      <input
                        type={row.showSecret ? 'text' : 'password'}
                        value={row.value}
                        onChange={(e) => handleUpdateRow(row.id, 'value', e.target.value)}
                        placeholder="value..."
                        className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-3 pr-9 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/40"
                      />
                      <button
                        type="button"
                        onClick={() => handleToggleShow(row.id)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        title={row.showSecret ? 'Hide value' : 'Show value'}
                      >
                        {row.showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(row.id)}
                      className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete variable"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="DATABASE_URL=postgres://...\nAPI_KEY=sk_live_...\nPORT=3000"
                rows={10}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary resize-none placeholder:text-muted-foreground/40"
              />
              <p className="text-[11px] text-muted-foreground">
                Paste or edit multi-line key=value pairs. Lines starting with # are treated as comments.
              </p>
            </div>
          )}

          {/* Feedback messages */}
          {error && (
            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs">
              {successMsg}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            Variables are securely saved to the container&apos;s <span className="font-mono text-slate-300">.env</span> file.
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg border border-slate-800 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className="px-3.5 py-2 text-xs font-medium text-foreground rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Save Only
            </button>

            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors flex items-center gap-1.5 shadow-md shadow-primary/20 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              Save & Redeploy
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
