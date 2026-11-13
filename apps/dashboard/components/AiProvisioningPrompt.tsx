'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Code,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
  GitBranch,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { promptApplication, iterateApplicationWithAi } from '../app/actions'

interface AiAppItem {
  id: string
  name: string
  runtime: string
  githubRepo?: string | null
}

interface AiProvisioningPromptProps {
  apps?: AiAppItem[]
}

const SUGGESTIONS = [
  'Add PostgreSQL with Drizzle ORM and a users table',
  'Add Stripe checkout webhook endpoint at /api/webhook',
  'Add JWT auth middleware and /auth/login route',
  'Add Redis caching layer for GET endpoints',
]

export default function AiProvisioningPrompt({ apps = [] }: AiProvisioningPromptProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(true)
  const [mode, setMode] = useState<'create' | 'iterate'>('create')
  const [selectedAppId, setSelectedAppId] = useState<string>(apps[0]?.id || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [iteratePrompt, setIteratePrompt] = useState('')
  const [iterateResult, setIterateResult] = useState<{
    summary?: string
    commitMessage?: string
    githubRepo?: string
  } | null>(null)

  const selectedApp = apps.find((a) => a.id === selectedAppId) || apps[0]

  async function handleCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const prompt = (new FormData(form).get('prompt') as string)?.trim()
    if (!prompt) return

    setLoading(true)
    setError(null)
    setIterateResult(null)

    const formData = new FormData(form)
    try {
      const res = await promptApplication(formData)
      if (res?.error) {
        setError(res.error)
      } else {
        form.reset()
        router.refresh()
      }
    } catch (e: unknown) {
      setError('Failed to build application: ' + (e instanceof Error ? e.message : 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleIterateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedAppId || !iteratePrompt.trim()) return

    setLoading(true)
    setError(null)
    setIterateResult(null)
    try {
      const res = await iterateApplicationWithAi(selectedAppId, iteratePrompt.trim())
      if (res?.error) {
        setError(res.error)
      } else {
        setIterateResult({
          summary: res.summary,
          commitMessage: res.commitMessage,
          githubRepo: res.githubRepo || selectedApp?.githubRepo || undefined,
        })
        setIteratePrompt('')
        router.refresh()
      }
    } catch (e: unknown) {
      setError('Failed to apply AI changes: ' + (e instanceof Error ? e.message : 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-8 rounded-lg bg-card border border-border overflow-hidden">
      {/* Header & Mode Switcher */}
      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-3 text-foreground text-left"
        >
          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground border border-border">
            <Code className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">AI Infrastructure Architect</h3>
              <span className="px-1.5 py-0.5 rounded-md border border-border text-muted-foreground text-xs font-mono">
                Code Assistant
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === 'create'
                ? 'Configure runtime, scaffold repository, and trigger container build.'
                : 'Modify an existing project codebase and commit changes.'}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          {!collapsed && apps.length > 0 && (
            <div className="flex items-center bg-muted/40 p-0.5 rounded-md border border-border">
              <button
                type="button"
                onClick={() => {
                  setMode('create')
                  setError(null)
                }}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  mode === 'create'
                    ? 'bg-background text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                New App
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('iterate')
                  setError(null)
                  if (!selectedAppId && apps.length > 0) setSelectedAppId(apps[0].id)
                }}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  mode === 'iterate'
                    ? 'bg-background text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Update Project ({apps.length})
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={collapsed ? 'Expand architect panel' : 'Collapse architect panel'}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 pt-0 border-t border-border">
          {/* Mode 1: Create New Application */}
          {mode === 'create' && (
            <form onSubmit={handleCreateSubmit} className="pt-4 flex flex-col gap-3">
              <div className="relative">
                <textarea
                  name="prompt"
                  required
                  rows={3}
                  placeholder="e.g. Spin up a Python backend with a SQLite database and /api/health endpoint..."
                  className="w-full bg-background border border-border rounded-md p-3 text-xs resize-none focus:outline-none focus:border-primary placeholder:text-muted-foreground/50"
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 flex items-start gap-2.5 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="font-medium">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="self-end px-4 py-2 rounded-md font-medium text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Architecting...</span>
                  </>
                ) : (
                  <span>Build Application</span>
                )}
              </button>
            </form>
          )}

          {/* Mode 2: Iterate On Existing Application */}
          {mode === 'iterate' && (
            <form onSubmit={handleIterateSubmit} className="pt-4 flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Select Project</label>
                  <select
                    value={selectedAppId}
                    onChange={(e) => {
                      setSelectedAppId(e.target.value)
                      setIterateResult(null)
                    }}
                    disabled={loading}
                    className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-foreground"
                  >
                    {apps.map((app) => (
                      <option key={app.id} value={app.id}>
                        {app.name} ({app.runtime})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedApp && (
                  <div className="p-2 rounded-md bg-muted/20 border border-border text-xs flex flex-col justify-center">
                    <span className="text-muted-foreground block text-xs">Linked GitHub Repository</span>
                    {selectedApp.githubRepo ? (
                      <a
                        href={selectedApp.githubRepo.replace(/\.git$/, '')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 mt-0.5 truncate"
                      >
                        <GitBranch className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{selectedApp.githubRepo.replace('https://github.com/', '').replace(/\.git$/, '')}</span>
                        <ArrowUpRight className="w-3 h-3 shrink-0 opacity-70" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground italic mt-0.5">Will be auto-created on next commit</span>
                    )}
                  </div>
                )}
              </div>

              <div className="relative">
                <textarea
                  value={iteratePrompt}
                  onChange={(e) => setIteratePrompt(e.target.value)}
                  required
                  rows={3}
                  placeholder={`Describe what to add or update in ${selectedApp?.name || 'this project'}...`}
                  className="w-full bg-background border border-border rounded-md p-3 text-xs resize-none focus:outline-none focus:border-primary placeholder:text-muted-foreground/50"
                  disabled={loading}
                />
              </div>

              {/* Quick Suggestions */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-muted-foreground mr-1">Suggestions:</span>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={loading}
                    onClick={() => setIteratePrompt(s)}
                    className="text-xs px-2.5 py-1 rounded-md bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Result Banner */}
              {iterateResult && (
                <div className="p-3.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 font-medium text-xs text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Updates Applied & Pushed to GitHub</span>
                  </div>
                  {iterateResult.summary && <p className="pl-6 text-emerald-300">{iterateResult.summary}</p>}
                  {iterateResult.commitMessage && (
                    <div className="pl-6 font-mono text-emerald-300/80">
                      <span className="bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30 mr-2">git commit</span>
                      {iterateResult.commitMessage}
                    </div>
                  )}
                  {iterateResult.githubRepo && (
                    <div className="pl-6 pt-1">
                      <a
                        href={iterateResult.githubRepo.replace(/\.git$/, '') + '/commits/main'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:text-emerald-300 underline font-medium inline-flex items-center gap-1"
                      >
                        View commit on GitHub <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 flex items-start gap-2.5 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="font-medium">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !iteratePrompt.trim()}
                className="self-end px-4 py-2 rounded-md font-medium text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Architecting & Deploying...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Deploy to GitHub</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
