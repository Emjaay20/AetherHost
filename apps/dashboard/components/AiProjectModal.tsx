'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Sparkles, X, Loader2, GitBranch, ArrowUpRight, CheckCircle2, 
  Code2, AlertCircle, RefreshCw, Monitor, Tablet, Smartphone, 
  ExternalLink, Layers, Terminal, ChevronRight, Copy, Check, Lock
} from 'lucide-react'
import { iterateApplicationWithAi } from '../app/actions'
import { safeAppName } from '../lib/app-name'
import { getAppUrl } from '../lib/domain'

interface AiProjectModalProps {
  app: {
    id: string
    name: string
    runtime: string
    status?: string
    githubRepo?: string | null
    aiFiles?: { path: string; content: string }[] | null
  }
  isOpen: boolean
  onClose: () => void
}

const SUGGESTIONS = [
  'Add a GET /api/status route with uptime and system info',
  'Add an interactive dark-mode dashboard with real-time stats',
  'Create a REST API for items with GET, POST, and DELETE',
  'Add CORS middleware and JSON error handling'
]

type ViewMode = 'split' | 'prompt' | 'preview'
type DeviceMode = 'desktop' | 'tablet' | 'mobile'

export default function AiProjectModal({ app, isOpen, onClose }: AiProjectModalProps) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    summary?: string
    commitMessage?: string
    githubRepo?: string
  } | null>(null)

  // Workspace controls
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop')
  const [activeTab, setActiveTab] = useState<'prompt' | 'code'>('prompt')
  const [selectedFileIndex, setSelectedFileIndex] = useState(0)
  const [previewPath, setPreviewPath] = useState('/')
  const [iframeKey, setIframeKey] = useState(0)
  const [copiedFile, setCopiedFile] = useState(false)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const safeName = safeAppName(app.name)
  const appBaseUrl = getAppUrl(safeName)
  const files = Array.isArray(app.aiFiles) ? app.aiFiles : []
  const activeFile = files[selectedFileIndex] || files[0]

  // Reload iframe helper
  const handleReloadPreview = () => {
    setIframeKey((k) => k + 1)
  }

  async function handleIterate(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim() || loading) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await iterateApplicationWithAi(app.id, prompt.trim())
      if (res.error) {
        setError(res.error)
      } else {
        setResult({
          summary: res.summary,
          commitMessage: res.commitMessage,
          githubRepo: res.githubRepo || app.githubRepo || undefined
        })
        setPrompt('')
        // Give the agent 3 seconds to complete container hot-reload, then reload preview
        setTimeout(() => {
          handleReloadPreview()
        }, 3000)
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to apply AI changes')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyCode = (content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedFile(true)
    setTimeout(() => setCopiedFile(false), 2000)
  }

  // Device width mapping
  const deviceWidthClass = {
    desktop: 'w-full',
    tablet: 'max-w-[768px] mx-auto',
    mobile: 'max-w-[375px] mx-auto'
  }[deviceMode]

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-background/85 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            className="w-full h-[95vh] max-w-[98vw] bg-[#09090b] border border-border/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Top Navigation Bar */}
            <header className="h-14 px-4 border-b border-border/50 bg-[#0c0d12] flex items-center justify-between shrink-0">
              {/* Left: Branding & App Details */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground">{app.name}</span>
                  <span className="px-2 py-0.5 text-[10px] font-mono uppercase rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {app.runtime}
                  </span>
                  {app.githubRepo && (
                    <a
                      href={app.githubRepo.replace(/\.git$/, '')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-muted/30 border border-border/30 transition-colors"
                    >
                      <GitBranch className="w-3 h-3" />
                      <span className="max-w-[120px] truncate">{app.githubRepo.replace('https://github.com/', '').replace(/\.git$/, '')}</span>
                      <ArrowUpRight className="w-2.5 h-2.5 opacity-60" />
                    </a>
                  )}
                </div>
              </div>

              {/* Center: View Mode Toggle */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/30 border border-border/40">
                <button
                  type="button"
                  onClick={() => setViewMode('split')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                    viewMode === 'split' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Split View</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('prompt')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                    viewMode === 'prompt' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Architect & Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                    viewMode === 'preview' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Live Preview</span>
                </button>
              </div>

              {/* Right: Device Viewports & Close */}
              <div className="flex items-center gap-2">
                {viewMode !== 'prompt' && (
                  <div className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-muted/20 border border-border/30">
                    <button
                      type="button"
                      onClick={() => setDeviceMode('desktop')}
                      className={`p-1.5 rounded-lg transition-colors ${
                        deviceMode === 'desktop' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                      title="Desktop View (100%)"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeviceMode('tablet')}
                      className={`p-1.5 rounded-lg transition-colors ${
                        deviceMode === 'tablet' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                      title="Tablet View (768px)"
                    >
                      <Tablet className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeviceMode('mobile')}
                      className={`p-1.5 rounded-lg transition-colors ${
                        deviceMode === 'mobile' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                      title="Mobile View (375px)"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* Main Content Workspace */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Workspace: AI Architect Prompt & Code */}
              {(viewMode === 'split' || viewMode === 'prompt') && (
                <div className={`flex flex-col border-r border-border/50 bg-[#09090b] overflow-hidden ${
                  viewMode === 'split' ? 'w-full lg:w-[48%] xl:w-[45%]' : 'w-full'
                }`}>
                  {/* Left Tabs */}
                  <div className="px-4 py-2 border-b border-border/40 flex items-center justify-between bg-muted/10 shrink-0">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('prompt')}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                          activeTab === 'prompt' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Sparkles className="w-3 h-3" />
                        AI Architect
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('code')}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                          activeTab === 'code' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Code2 className="w-3 h-3" />
                        Source Files ({files.length})
                      </button>
                    </div>

                    <div className="text-[11px] text-muted-foreground font-mono">
                      Groq OSS 120B
                    </div>
                  </div>

                  {/* Left Body Content */}
                  <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                    {activeTab === 'prompt' ? (
                      <>
                        {/* Iteration Prompt Form */}
                        <form onSubmit={handleIterate} className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-foreground/90 flex items-center justify-between">
                              <span>Prompt the AI Architect</span>
                              <span className="text-[11px] text-muted-foreground font-normal">
                                Commits directly to GitHub & updates live preview
                              </span>
                            </label>
                            <div className="relative rounded-2xl bg-gradient-to-b from-blue-500/20 to-purple-500/10 p-[1px] shadow-inner focus-within:from-blue-500 focus-within:to-indigo-500 transition-all">
                              <textarea
                                rows={4}
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                disabled={loading}
                                placeholder="e.g. Add a GET /api/todos route that returns tasks, and update the homepage UI with an interactive task list and live status dashboard..."
                                className="w-full bg-[#0e0f15] rounded-[15px] p-3.5 text-xs sm:text-sm resize-none focus:outline-none transition-all placeholder:text-muted-foreground/50 text-foreground"
                              />
                            </div>
                          </div>

                          {/* Quick Suggestions */}
                          <div className="space-y-2">
                            <span className="text-[11px] text-muted-foreground block">Quick Actions:</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {SUGGESTIONS.map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  disabled={loading}
                                  onClick={() => setPrompt(s)}
                                  className="text-[11px] p-2 rounded-xl bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground border border-border/40 transition-colors text-left flex items-start gap-1.5"
                                >
                                  <ChevronRight className="w-3 h-3 shrink-0 mt-0.5 text-blue-400" />
                                  <span>{s}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Action Button */}
                          <div className="pt-2 flex items-center justify-between">
                            <span className="text-[11px] text-zinc-500">
                              Instant code synthesis & container hot-reload
                            </span>
                            <button
                              type="submit"
                              disabled={loading || !prompt.trim()}
                              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-blue-500/25"
                            >
                              {loading ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  Architecting & Deploying...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3.5 h-3.5" />
                                  Generate & Deploy
                                </>
                              )}
                            </button>
                          </div>
                        </form>

                        {/* Success Notification */}
                        {result && (
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 space-y-2"
                          >
                            <div className="flex items-center gap-2 font-medium text-xs">
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              <span>Code changes committed and deployed!</span>
                            </div>
                            {result.summary && (
                              <p className="text-xs text-emerald-200/90 pl-6 leading-relaxed">
                                {result.summary}
                              </p>
                            )}
                            {result.commitMessage && (
                              <div className="pl-6 flex items-center gap-2 pt-1 font-mono text-[11px] text-emerald-300/80">
                                <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30">
                                  git commit
                                </span>
                                <span>{result.commitMessage}</span>
                              </div>
                            )}
                            {result.githubRepo && (
                              <div className="pl-6 pt-1">
                                <a
                                  href={result.githubRepo.replace(/\.git$/, '') + '/commits/main'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 underline font-medium"
                                >
                                  View on GitHub
                                  <ArrowUpRight className="w-3 h-3" />
                                </a>
                              </div>
                            )}
                          </motion.div>
                        )}

                        {/* Error Notification */}
                        {error && (
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2.5"
                          >
                            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                            <span>{error}</span>
                          </motion.div>
                        )}
                      </>
                    ) : (
                      /* Code Explorer Tab */
                      <div className="space-y-3">
                        {files.length > 0 ? (
                          <>
                            {/* File selector tabs */}
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                              {files.map((f, i) => (
                                <button
                                  key={f.path}
                                  type="button"
                                  onClick={() => setSelectedFileIndex(i)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors flex items-center gap-1.5 shrink-0 ${
                                    selectedFileIndex === i
                                      ? 'bg-muted text-foreground border border-border'
                                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                                  }`}
                                >
                                  <Code2 className="w-3 h-3 opacity-70" />
                                  <span>{f.path}</span>
                                </button>
                              ))}
                            </div>

                            {/* File content viewer */}
                            {activeFile && (
                              <div className="rounded-xl border border-border/50 bg-[#07080b] overflow-hidden">
                                <div className="px-3.5 py-2 bg-black/40 border-b border-border/30 flex items-center justify-between">
                                  <span className="font-mono text-xs text-muted-foreground">{activeFile.path}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyCode(activeFile.content)}
                                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded bg-muted/30 hover:bg-muted/60 transition-colors"
                                  >
                                    {copiedFile ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                    <span>{copiedFile ? 'Copied' : 'Copy'}</span>
                                  </button>
                                </div>
                                <pre className="p-4 text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre max-h-[500px] leading-relaxed">
                                  {activeFile.content}
                                </pre>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-center py-12 text-zinc-500 text-xs">
                            No custom source files stored yet. Use the prompt tab to generate code!
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Right Workspace: Live Interactive Preview */}
              {(viewMode === 'split' || viewMode === 'preview') && (
                <div className="flex-1 flex flex-col bg-[#0b0c10] overflow-hidden">
                  {/* Browser Mockup Chrome Bar */}
                  <div className="h-11 px-4 bg-[#101117] border-b border-border/40 flex items-center justify-between gap-3 shrink-0">
                    {/* Traffic lights & Nav actions */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 mr-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500/80"></span>
                        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></span>
                        <span className="w-2.5 h-2.5 rounded-full bg-green-500/80"></span>
                      </div>
                      <button
                        type="button"
                        onClick={handleReloadPreview}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        title="Reload preview"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Address bar */}
                    <div className="flex-1 max-w-xl flex items-center bg-[#07080b] border border-border/40 rounded-lg px-2.5 py-1 text-xs font-mono text-muted-foreground shadow-inner">
                      <Lock className="w-3 h-3 mr-1.5 text-emerald-400" />
                      <span className="text-zinc-500 select-none">{appBaseUrl.replace(/\/$/, '')}</span>
                      <input
                        type="text"
                        value={previewPath}
                        onChange={(e) => setPreviewPath(e.target.value)}
                        placeholder="/"
                        className="bg-transparent text-foreground focus:outline-none ml-0.5 w-full"
                      />
                    </div>

                    {/* External Link */}
                    <div className="flex items-center gap-2">
                      <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>Live</span>
                      </div>
                      <a
                        href={`${appBaseUrl.replace(/\/$/, '')}${previewPath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        title="Open in new window"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  {/* Iframe Viewport Container */}
                  <div className="flex-1 bg-[#050608] relative overflow-hidden flex items-center justify-center p-2 sm:p-4">
                    <div className={`h-full transition-all duration-300 rounded-xl overflow-hidden border border-border/40 shadow-2xl bg-white ${deviceWidthClass}`}>
                      <iframe
                        key={iframeKey}
                        ref={iframeRef}
                        src={`${appBaseUrl.replace(/\/$/, '')}${previewPath}`}
                        title="Live Application Preview"
                        className="w-full h-full border-0 bg-white"
                        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                      />
                    </div>

                    {/* Deploying Overlay */}
                    {loading && (
                      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6 z-20">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 mb-3 shadow-lg">
                          <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                        <h4 className="font-semibold text-sm text-foreground">AI Architect is synthesizing changes...</h4>
                        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                          Updating code, pushing commit to GitHub, and hot-reloading container. Preview will refresh automatically.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
