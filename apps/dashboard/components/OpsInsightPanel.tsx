'use client'

import { useState, useMemo } from 'react'
import { generateOpsInsight } from '../app/actions'
import {
  Activity,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  X,
  Copy,
  Check,
  Box,
  Layers,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface OpsInsightPanelProps {
  apps?: {
    id: string
    name: string
    runtime: string
    status: string
  }[]
}

interface InsightSection {
  title: string
  content: string
}

interface OpsInsightResult {
  insight?: string
  applicationId?: string | null
  applicationName?: string | null
  model?: string
  costUsd?: number
}

export default function OpsInsightPanel({ apps = [] }: OpsInsightPanelProps) {
  const [selectedScope, setSelectedScope] = useState<string>('all')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<OpsInsightResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [panelExpanded, setPanelExpanded] = useState(false)
  const [openSections, setOpenSections] = useState<Record<number, boolean>>({ 0: true })
  const [copied, setCopied] = useState(false)

  const attentionApps = useMemo(
    () => apps.filter((a) => a.status === 'failed' || a.status === 'pending'),
    [apps]
  )

  const handleGenerate = async (overrideScope?: string) => {
    const scopeToUse = overrideScope ?? selectedScope
    if (overrideScope) {
      setSelectedScope(overrideScope)
    }

    setLoading(true)
    setError(null)
    setPanelExpanded(true)

    try {
      const res = await generateOpsInsight(scopeToUse)
      if (res.error) {
        setError(res.error)
      } else {
        setResult(res.data)
        setDrawerOpen(true)
        setOpenSections({ 0: true, 1: false, 2: false })
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const getCleanMarkdown = (text: string) => {
    if (!text) return ''
    return text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/^[•·]\s*$/gm, '')
      .replace(/^[•·]\s*(?=\*)/gm, '')
      .replace(/^[•·]\s*(?=-)/gm, '')
      .trim()
  }

  // Split markdown into collapsible sections by ## or ### headings
  const sections: InsightSection[] = useMemo(() => {
    if (!result?.insight) return []
    const cleaned = getCleanMarkdown(result.insight)
    const lines = cleaned.split('\n')
    const parsed: InsightSection[] = []
    let currentTitle = 'Executive Summary'
    let currentLines: string[] = []

    for (const line of lines) {
      const headingMatch = line.match(/^#{1,3}\s+(.+)$/)
      if (headingMatch) {
        if (currentLines.join('\n').trim().length > 0) {
          parsed.push({
            title: currentTitle.replace(/\*\*/g, '').trim(),
            content: currentLines.join('\n').trim(),
          })
        }
        currentTitle = headingMatch[1]
        currentLines = []
      } else {
        currentLines.push(line)
      }
    }

    if (currentLines.join('\n').trim().length > 0) {
      parsed.push({
        title: currentTitle.replace(/\*\*/g, '').trim(),
        content: currentLines.join('\n').trim(),
      })
    }

    return parsed.length > 0
      ? parsed
      : [{ title: 'Operational Insight', content: cleaned }]
  }, [result])

  const toggleSection = (idx: number) => {
    setOpenSections((prev) => ({ ...prev, [idx]: !prev[idx] }))
  }

  const allExpanded = sections.length > 0 && sections.every((_, idx) => !!openSections[idx])

  const toggleAllSections = () => {
    const next: Record<number, boolean> = {}
    sections.forEach((_, idx) => {
      next[idx] = !allExpanded
    })
    setOpenSections(next)
  }

  const handleCopy = () => {
    if (!result?.insight) return
    navigator.clipboard.writeText(getCleanMarkdown(result.insight))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-8 rounded-lg bg-card border border-border overflow-hidden">
      {/* Header & Controls */}
      <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setPanelExpanded(!panelExpanded)}
          className="flex items-center gap-3 text-foreground text-left"
        >
          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground border border-border shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-foreground">Operational Diagnostics</h3>
              <span className="px-1.5 py-0.5 rounded-md border border-border text-muted-foreground text-xs font-mono">
                Diagnostics
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automated log analysis and health diagnostics across workspace projects.
            </p>
          </div>
        </button>

        {/* Project Selector + Generate Button */}
        <div className="flex w-full flex-wrap items-center gap-2.5 lg:w-auto">
          <div className="relative w-full min-w-0 sm:w-auto sm:min-w-[220px] sm:flex-1">
            <select
              value={selectedScope}
              onChange={(e) => setSelectedScope(e.target.value)}
              disabled={loading}
              aria-label="Select project for AI insight"
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:border-primary"
            >
              <option value="all">
                All Projects — Workspace Overview ({apps.length})
              </option>
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name} ({app.runtime.toUpperCase()}) — {app.status.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => handleGenerate()}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-md font-medium text-xs bg-muted hover:bg-muted/80 text-foreground border border-border disabled:opacity-50 flex items-center gap-2 shrink-0 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Analyzing...</span>
              </>
            ) : (
              <span>Run Diagnostic</span>
            )}
          </button>
        </div>
      </div>

      {/* Quick Diagnose Pills for Failed / Pending Projects */}
      {attentionApps.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 bg-muted/20">
          <span className="text-xs text-muted-foreground font-medium">
            Needs Attention:
          </span>
          {attentionApps.map((app) => (
            <button
              key={app.id}
              type="button"
              disabled={loading}
              onClick={() => handleGenerate(app.id)}
              className={`text-xs font-medium px-2.5 py-1 rounded-md border transition-colors flex items-center gap-1.5 disabled:opacity-50 ${
                app.status === 'failed'
                  ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30'
                  : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  app.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'
                }`}
              />
              <span>Diagnose {app.name}</span>
              <span className="opacity-70 font-mono text-xs">({app.runtime})</span>
            </button>
          ))}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mb-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <p className="text-xs font-medium">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="p-1 rounded hover:bg-red-500/20 text-red-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Collapsible Insight Drawer */}
      {result && (
        <div className="border-t border-border bg-card">
          {/* Drawer Toolbar */}
          <div className="px-4 py-2 bg-muted/40 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(!drawerOpen)}
              className="flex items-center gap-2 text-xs font-medium text-foreground hover:text-foreground/80 transition-colors"
            >
              {drawerOpen ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="flex items-center gap-1.5">
                {result.applicationId ? (
                  <Box className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span>
                  Diagnostic Report:{' '}
                  <strong className="text-foreground">
                    {result.applicationName || 'Workspace Overview'}
                  </strong>
                </span>
              </span>
              <span className="text-xs text-muted-foreground font-normal ml-1">
                ({sections.length} {sections.length === 1 ? 'section' : 'sections'})
              </span>
            </button>

            <div className="flex items-center gap-2 text-xs">
              <span className="hidden sm:inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded-md border border-border text-muted-foreground font-mono">
                {result.model}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded-md border border-border text-muted-foreground font-mono">
                ${result.costUsd?.toFixed(5)}
              </span>

              {drawerOpen && sections.length > 1 && (
                <button
                  type="button"
                  onClick={toggleAllSections}
                  className="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border transition-colors"
                >
                  {allExpanded ? 'Collapse All' : 'Expand All'}
                </button>
              )}

              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border transition-colors"
                title="Copy report"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                type="button"
                onClick={() => setDrawerOpen(!drawerOpen)}
                className="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border transition-colors flex items-center gap-1"
                title={drawerOpen ? 'Minimize report' : 'Expand report'}
              >
                {drawerOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                <span>{drawerOpen ? 'Hide' : 'Show'}</span>
              </button>

              <button
                type="button"
                onClick={() => setResult(null)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Close report"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Drawer Body with Collapsible Accordion Sections */}
          {drawerOpen && (
            <div className="p-4 max-h-[380px] overflow-y-auto divide-y divide-border space-y-2">
              {sections.map((sec, idx) => {
                const isOpen = !!openSections[idx]
                return (
                  <div
                    key={idx}
                    className="rounded-md border border-border bg-card overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSection(idx)}
                      className="w-full px-3.5 py-2 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-muted border border-border text-muted-foreground text-xs font-mono flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {sec.title}
                        </span>
                      </div>
                      {isOpen ? (
                        <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-3.5 pt-2 border-t border-border bg-muted/10">
                        <article
                          className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed
                            prose-headings:text-foreground prose-headings:font-semibold prose-headings:text-xs
                            prose-p:my-1.5 prose-li:my-0.5
                            prose-a:text-primary hover:prose-a:underline
                            prose-strong:text-foreground prose-strong:font-semibold
                            prose-table:border-collapse prose-th:bg-muted/50 prose-th:p-2 prose-td:p-2
                            prose-td:border-t prose-td:border-border prose-th:border-b prose-th:border-border
                            prose-code:text-foreground prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                            prose-ul:list-disc prose-ul:pl-4
                            prose-ol:list-decimal prose-ol:pl-4"
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {sec.content}
                          </ReactMarkdown>
                        </article>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
