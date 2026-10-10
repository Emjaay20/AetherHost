'use client'

import { useState } from 'react'
import { promptApplication, iterateApplicationWithAi } from '../app/actions'
import { Sparkles, AlertCircle, Loader2, GitBranch, ArrowUpRight, CheckCircle2, RefreshCw } from 'lucide-react'

interface AiProvisioningPromptProps {
  apps?: any[]
}

const SUGGESTIONS = [
  'Add a GET /api/status route with system uptime',
  'Add CORS headers and basic security middleware',
  'Create an in-memory REST API for items with GET and POST',
  'Add structured JSON error handling middleware'
]

export default function AiProvisioningPrompt({ apps = [] }: AiProvisioningPromptProps) {
  const [mode, setMode] = useState<'create' | 'iterate'>('create')
  const [selectedAppId, setSelectedAppId] = useState<string>(apps[0]?.id || '')
  const [iteratePrompt, setIteratePrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [iterateResult, setIterateResult] = useState<{
    summary?: string
    commitMessage?: string
    githubRepo?: string
  } | null>(null)

  const selectedApp = apps.find((a) => a.id === selectedAppId) || apps[0]

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setIterateResult(null)

    const formData = new FormData(e.currentTarget)
    try {
      const res = await promptApplication(formData)
      if (res?.error) {
        setError(res.error)
      } else {
        ;(e.target as HTMLFormElement).reset()
      }
    } catch (e: any) {
      setError('An error occurred communicating with the AI service')
    } finally {
      setLoading(false)
    }
  }

  const handleIterateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAppId || !iteratePrompt.trim() || loading) return

    setLoading(true)
    setError(null)
    setIterateResult(null)

    try {
      const res = await iterateApplicationWithAi(selectedAppId, iteratePrompt.trim())
      if (res.error) {
        setError(res.error)
      } else {
        setIterateResult({
          summary: res.summary,
          commitMessage: res.commitMessage,
          githubRepo: res.githubRepo || selectedApp?.githubRepo || undefined,
        })
        setIteratePrompt('')
      }
    } catch (e: any) {
      setError('Failed to apply AI changes: ' + (e?.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-8 p-6 rounded-2xl bg-card border border-border/50 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -ml-10 -mt-10" />

      {/* Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 relative">
        <div className="flex items-center gap-3 text-foreground">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-base">AI Software & Infrastructure Architect</h3>
            <p className="text-xs text-muted-foreground">
              {mode === 'create'
                ? 'Describe what to build, and our LLM will configure runtime, code, and deployment.'
                : 'Prompt the AI to modify your existing codebase and commit directly to GitHub.'}
            </p>
          </div>
        </div>

        {apps.length > 0 && (
          <div className="flex items-center bg-muted/40 p-1 rounded-xl border border-border/50 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                setMode('create')
                setError(null)
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                mode === 'create'
                  ? 'bg-background text-foreground shadow-sm'
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                mode === 'iterate'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Update Existing Project ({apps.length})
            </button>
          </div>
        )}
      </div>

      {/* Mode 1: Create New Application */}
      {mode === 'create' && (
        <form onSubmit={handleCreateSubmit} className="relative flex flex-col gap-4">
          <div className="relative">
            <textarea
              name="prompt"
              required
              rows={3}
              placeholder="e.g. Spin up a Python backend with a SQLite database and /api/health endpoint..."
              className="w-full bg-background border border-border rounded-xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="self-end px-6 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 active:scale-95 shadow-sm bg-blue-600 text-white hover:bg-blue-700 border border-blue-800 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Architecting...
              </>
            ) : (
              'Build it'
            )}
          </button>
        </form>
      )}

      {/* Mode 2: Iterate On Existing Application */}
      {mode === 'iterate' && (
        <form onSubmit={handleIterateSubmit} className="relative flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground/80">Select Project to Modify</label>
              <select
                value={selectedAppId}
                onChange={(e) => {
                  setSelectedAppId(e.target.value)
                  setIterateResult(null)
                }}
                disabled={loading}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-foreground"
              >
                {apps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name} ({app.runtime})
                  </option>
                ))}
              </select>
            </div>

            {selectedApp && (
              <div className="p-2.5 rounded-xl bg-muted/20 border border-border/40 text-xs flex flex-col justify-center">
                <span className="text-muted-foreground block text-[11px]">Linked GitHub Repository</span>
                {selectedApp.githubRepo ? (
                  <a
                    href={selectedApp.githubRepo.replace(/\.git$/, '')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-0.5 truncate"
                  >
                    <GitBranch className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{selectedApp.githubRepo.replace('https://github.com/', '').replace(/\.git$/, '')}</span>
                    <ArrowUpRight className="w-3 h-3 shrink-0 opacity-70" />
                  </a>
                ) : (
                  <span className="text-zinc-500 italic mt-0.5">Will be auto-created on next commit</span>
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
              placeholder={`Tell the AI Architect what to add or update in ${selectedApp?.name || 'this project'}...`}
              className="w-full bg-background border border-border rounded-xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              disabled={loading}
            />
          </div>

          {/* Quick Suggestions */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] text-muted-foreground mr-1">Suggestions:</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={loading}
                onClick={() => setIteratePrompt(s)}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground border border-border/40 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Result Banner */}
          {iterateResult && (
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-300 space-y-1.5 text-xs">
              <div className="flex items-center gap-2 font-medium text-sm text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>AI Updates Applied & Pushed to GitHub!</span>
              </div>
              {iterateResult.summary && <p className="pl-6 text-green-200/90">{iterateResult.summary}</p>}
              {iterateResult.commitMessage && (
                <div className="pl-6 font-mono text-green-300/80">
                  <span className="bg-green-950/60 px-1.5 py-0.5 rounded border border-green-500/30 mr-2">git commit</span>
                  {iterateResult.commitMessage}
                </div>
              )}
              {iterateResult.githubRepo && (
                <div className="pl-6 pt-1">
                  <a
                    href={iterateResult.githubRepo.replace(/\.git$/, '') + '/commits/main'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-400 hover:text-green-300 underline font-medium inline-flex items-center gap-1"
                  >
                    View commit on GitHub <ArrowUpRight className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !iteratePrompt.trim()}
            className="self-end px-6 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 active:scale-95 shadow-sm bg-blue-600 text-white hover:bg-blue-700 border border-blue-800 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Architecting & Deploying...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Architect & Deploy to GitHub
              </>
            )}
          </button>
        </form>
      )}
    </div>
  )
}
