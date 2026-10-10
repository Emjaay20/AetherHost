'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getApplicationLogs, debugWithAi } from '../app/actions'
import { Terminal, Sparkles, ChevronDown, ChevronUp, Loader2, Copy, Check, RefreshCw } from 'lucide-react'
import Markdown from 'react-markdown'

interface DeploymentLogViewerProps {
  appId: string
  status: string
}

export default function DeploymentLogViewer({ appId, status }: DeploymentLogViewerProps) {
  const [logs, setLogs] = useState<any[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [debugging, setDebugging] = useState(false)
  const [aiResponse, setAiResponse] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Load logs on expand or status change
  useEffect(() => {
    if (expanded) {
      loadLogs()
    }
  }, [expanded, appId])

  // Polling if expanded and still pending
  useEffect(() => {
    if (!expanded) return
    if (status !== 'pending') return

    const interval = setInterval(() => {
      loadLogs(false)
    }, 2500)

    return () => clearInterval(interval)
  }, [expanded, status, appId])

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
    if (logs.length === 0) return
    setDebugging(true)
    setError(null)
    try {
      const latestLog = logs[logs.length - 1]?.logContent || logs.map(l => l.logContent).join('\n')
      const res = await debugWithAi(appId, latestLog)
      if (res.error) {
        setError(res.error)
      } else {
        setAiResponse(res.data?.output)
      }
    } catch (e) {
      setError('An error occurred during AI analysis')
    } finally {
      setDebugging(false)
    }
  }

  const combinedLogText = logs.map(l => l.logContent).join('\n')

  return (
    <div className="w-full mt-3 pt-3 border-t border-border/30">
      <div className="flex items-center justify-between">
        <button 
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`flex items-center gap-2 text-xs font-medium transition-colors ${
            status === 'failed' 
              ? 'text-red-400 hover:text-red-300' 
              : status === 'pending'
                ? 'text-amber-400 hover:text-amber-300'
                : 'text-zinc-400 hover:text-foreground'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>
            {status === 'failed' 
              ? (expanded ? 'Hide Error Logs' : 'View Error Logs (Deployment Failed)') 
              : status === 'pending'
                ? (expanded ? 'Hide Live Logs' : 'Stream Live Build Logs...')
                : (expanded ? 'Hide Logs' : 'View Deployment & Container Logs')}
          </span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 opacity-60" /> : <ChevronDown className="w-3.5 h-3.5 opacity-60" />}
        </button>

        {expanded && (
          <div className="flex items-center gap-2">
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
          </div>
        )}
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
                  {status === 'pending' && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <Loader2 className="w-3 h-3 animate-spin" /> Live Streaming
                    </span>
                  )}
                  <span className="text-zinc-600 font-mono text-[10px]">{logs.length} entries</span>
                </div>
              </div>

              {/* Terminal body */}
              <div ref={scrollRef} className="p-4 max-h-64 overflow-y-auto font-mono text-xs leading-relaxed select-text">
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
                ) : (
                  <div className="text-zinc-500 italic py-2">
                    No deployment logs recorded yet. Application is healthy.
                  </div>
                )}
              </div>

              {/* Failure AI Debugger */}
              {status === 'failed' && (
                <div className="p-3 border-t border-red-950/80 bg-red-950/20">
                  {!aiResponse ? (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-red-300">Application failed to start or pass readiness checks.</p>
                      <button 
                        type="button"
                        onClick={handleDebug}
                        disabled={debugging || logs.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {debugging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Analyze Failure with AI
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-purple-950/30 border border-purple-500/30 prose prose-sm prose-invert max-w-none text-xs">
                      <div className="flex items-center gap-2 mb-2 text-purple-300 font-medium pb-2 border-b border-purple-500/20">
                        <Sparkles className="w-3.5 h-3.5" />
                        AI Root-Cause Diagnosis & Fix
                      </div>
                      <Markdown>{aiResponse}</Markdown>
                    </div>
                  )}

                  {error && (
                    <p className="mt-2 text-xs text-red-400">{error}</p>
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
