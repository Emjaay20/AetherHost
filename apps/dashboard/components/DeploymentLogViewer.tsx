'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getApplicationLogs, debugWithAi, redeployApplication } from '../app/actions'
import { Terminal, Sparkles, ChevronDown, ChevronUp, Loader2, Copy, Check, RefreshCw, X, RotateCcw } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface DeploymentLogEntry {
  id?: string
  logContent: string
  createdAt?: string
}

interface DeploymentLogViewerProps {
  appId: string
  status: string
  onRedeployTriggered?: () => void
}

export default function DeploymentLogViewer({ appId, status, onRedeployTriggered }: DeploymentLogViewerProps) {
  const [logs, setLogs] = useState<DeploymentLogEntry[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [debugging, setDebugging] = useState(false)
  const [redeploying, setRedeploying] = useState(false)
  const [aiResponse, setAiResponse] = useState<string | null>(null)
  const [aiCollapsed, setAiCollapsed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Load logs on expand or status change
  useEffect(() => {
    if (expanded) {
      loadLogs()
    }
  }, [expanded, appId, status])

  // Polling if expanded and still pending or redeploying
  useEffect(() => {
    if (!expanded) return
    if (status !== 'pending' && !redeploying) return

    const interval = setInterval(() => {
      loadLogs(false)
    }, 1800)

    return () => clearInterval(interval)
  }, [expanded, status, redeploying, appId])

  const loadLogs = async (showLoading = true) => {
    if (showLoading && logs.length === 0) setLoading(true)
    try {
      const data = await getApplicationLogs(appId)
      if (Array.isArray(data)) {
        // Logs come in desc order from API, reverse them for chronological view
        setLogs([...data].reverse())
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    const fullLogText = logs.map(l => l.logContent).join('\n')
    navigator.clipboard.writeText(fullLogText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDebug = async () => {
    setDebugging(true)
    setError(null)
    setAiCollapsed(false)
    try {
      const fullLog = logs.map(l => l.logContent).join('\n')
      const res = await debugWithAi(appId, fullLog)
      if (res.error) {
        setError(res.error)
      } else {
        const text = res.data?.insight || res.data?.output
        if (text) {
          setAiResponse(text)
        } else {
          setError('AI returned an empty diagnosis. Please try again.')
        }
      }
    } catch (e) {
      setError('An error occurred during AI analysis')
    } finally {
      setDebugging(false)
    }
  }

  const handleRedeploy = async () => {
    setRedeploying(true)
    setError(null)
    setExpanded(true)
    try {
      const res = await redeployApplication(appId)
      if (res.error) {
        setError(res.error)
      } else {
        setAiResponse(null)
        onRedeployTriggered?.()
        await loadLogs(false)
        setTimeout(() => loadLogs(false), 1200)
        setTimeout(() => {
          loadLogs(false)
          setRedeploying(false)
        }, 3200)
        return
      }
    } catch (e) {
      setError('Failed to trigger redeploy')
    }
    setRedeploying(false)
  }

  const combinedLogText = logs.map(l => l.logContent).join('\n')

  return (
    <div className="w-full mt-3 pt-3 border-t border-border/30">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button 
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`flex items-start gap-2 text-left text-xs font-medium transition-colors ${
            status === 'failed' 
              ? 'text-red-400 hover:text-red-300' 
              : status === 'pending' || redeploying
                ? 'text-amber-400 hover:text-amber-300'
                : 'text-zinc-400 hover:text-foreground'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>
            {status === 'failed' 
              ? (expanded ? 'Hide Error Logs & AI Debugger' : 'View Error Logs & Analyze Failure') 
              : status === 'pending' || redeploying
                ? (expanded ? 'Hide Live Logs' : 'Stream Live Build Logs...')
                : (expanded ? 'Hide Logs' : 'View Deployment & Container Logs')}
          </span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 opacity-60" /> : <ChevronDown className="w-3.5 h-3.5 opacity-60" />}
        </button>

        <div className="flex items-center gap-2">
          {status === 'failed' && !expanded && (
            <button
              type="button"
              onClick={() => {
                setExpanded(true)
                handleDebug()
              }}
              className="flex items-center gap-1 text-[11px] font-medium text-purple-300 hover:text-purple-200 px-2.5 py-1 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              <span>Analyze Failure with AI</span>
            </button>
          )}

          {expanded && (
            <>
              <button
                type="button"
                onClick={() => loadLogs(true)}
                className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                title="Refresh logs"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              </button>
              {logs.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded bg-muted/40 hover:bg-muted/80 transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                title="Close log viewer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className={`mt-2 rounded-xl border overflow-hidden shadow-2xl ${
              status === 'failed' ? 'bg-[#0d090a] border-red-950/60' : 'bg-[#08090c] border-zinc-800/60'
            }`}>
              {/* Terminal header */}
              <div className="px-3.5 py-2 bg-black/60 border-b border-white/5 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/80"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500/80"></span>
                  <span className="ml-2 text-zinc-500">deployment-stdout.log</span>
                </div>
                <div className="flex items-center gap-2">
                  {(status === 'pending' || redeploying) && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <Loader2 className="w-3 h-3 animate-spin" /> Live Streaming
                    </span>
                  )}
                  <span className="text-zinc-600 font-mono text-[10px]">{logs.length} entries</span>
                </div>
              </div>

              {/* Terminal body */}
              <div ref={scrollRef} className="p-4 max-h-56 overflow-y-auto font-mono text-xs leading-relaxed select-text">
                {loading && logs.length === 0 ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs py-3">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Fetching container logs...
                  </div>
                ) : logs.length > 0 ? (
                  <pre className={`whitespace-pre-wrap ${
                    status === 'failed' ? 'text-red-300/90' : 'text-emerald-400/90'
                  }`}>
                    {combinedLogText}
                  </pre>
                ) : status === 'failed' ? (
                  <div className="text-red-300/80 italic py-2">
                    Container exited or failed provisioning before writing stdout logs. Click &ldquo;Analyze Failure with AI&rdquo; below to diagnose configuration, or click &ldquo;Redeploy&rdquo; to rebuild and restart.
                  </div>
                ) : (
                  <div className="text-zinc-500 italic py-2">
                    No deployment logs recorded yet. Application is healthy.
                  </div>
                )}
              </div>

              {/* Failure AI Debugger & Redeploy Bar */}
              {status === 'failed' && (
                <div className="p-3 border-t border-red-950/80 bg-red-950/20 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-red-300">
                      Application failed to start or pass readiness checks.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleRedeploy}
                        disabled={redeploying}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {redeploying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        {redeploying ? 'Redeploying...' : 'Redeploy Now'}
                      </button>
                      <button 
                        type="button"
                        onClick={handleDebug}
                        disabled={debugging}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {debugging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        {debugging ? 'Analyzing...' : aiResponse ? 'Re-Analyze with AI' : 'Analyze Failure with AI'}
                      </button>
                    </div>
                  </div>

                  {aiResponse && (
                    <div className="rounded-xl bg-purple-950/30 border border-purple-500/30 overflow-hidden">
                      <div className="px-3.5 py-2 bg-purple-950/50 border-b border-purple-500/20 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setAiCollapsed(!aiCollapsed)}
                          className="flex items-center gap-2 text-purple-300 font-medium text-xs hover:text-purple-200 transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>AI Root-Cause Diagnosis & Fix</span>
                          {aiCollapsed ? <ChevronDown className="w-3.5 h-3.5 opacity-70" /> : <ChevronUp className="w-3.5 h-3.5 opacity-70" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAiResponse(null)}
                          className="p-1 rounded hover:bg-purple-500/20 text-purple-300/70 hover:text-purple-200 transition-colors"
                          title="Close diagnosis"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {!aiCollapsed && (
                        <div className="p-3.5 max-h-60 overflow-y-auto prose prose-sm prose-invert max-w-none text-xs leading-relaxed">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiResponse}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  )}

                  {error && (
                    <p className="mt-1 text-xs text-red-400">{error}</p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
