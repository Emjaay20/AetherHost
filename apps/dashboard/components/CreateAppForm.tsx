'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Server, Box, Hexagon, Plus, X, Loader2, LayoutTemplate, GitBranch, Component } from 'lucide-react'
import { createApplication } from '../app/actions'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const runtimes = [
  { id: 'nodejs', name: 'Node.js', icon: Hexagon, color: 'text-green-500' },
  { id: 'python', name: 'Python', icon: Server, color: 'text-blue-500' },
  { id: 'go', name: 'Go', icon: Box, color: 'text-cyan-500' },
  { id: 'docker', name: 'Docker', icon: Component, color: 'text-blue-400' },
  { id: 'github', name: 'GitHub Repo', icon: GitBranch, color: 'text-zinc-200' },
  { id: 'wordpress', name: 'WordPress', icon: LayoutTemplate, color: 'text-blue-300' },
  { id: 'rust', name: 'Rust', icon: Box, color: 'text-orange-500' },
]

export default function CreateAppForm({ limitReached }: { limitReached: boolean }) {
  const [mounted, setMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])
  const [error, setError] = useState<string | null>(null)
  const [selectedRuntime, setSelectedRuntime] = useState('nodejs')
  const [dockerImage, setDockerImage] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set('runtime', selectedRuntime)
    
    const res = await createApplication(formData)
    setLoading(false)
    if (res.error) {
      setError(res.error)
    } else {
      setIsOpen(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        disabled={limitReached}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 active:scale-95 shadow-sm shadow-black/50 border border-primary/20",
          limitReached 
            ? "bg-muted text-muted-foreground cursor-not-allowed border-muted/50" 
            : "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-primary/25 hover:border-primary/40"
        )}
      >
        <Plus className="w-4 h-4" />
        New Application
      </button>

      {mounted && createPortal(
        <AnimatePresence>
          {isOpen && (
            <div className="fixed inset-0 z-[9999] overflow-y-auto sm:p-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsOpen(false)}
                className="fixed inset-0 z-0 bg-background/80 backdrop-blur-sm"
              />
              
              <div className="relative z-10 flex min-h-full items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="w-full max-w-lg bg-[#09090b] border border-border/50 rounded-2xl shadow-2xl"
                >
                <div className="p-6 border-b border-border/50 flex items-center justify-between bg-gradient-to-br from-muted/30 to-transparent">
                  <h2 className="text-xl font-semibold tracking-tight">Deploy Application</h2>
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="p-2 -mr-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-medium text-foreground/80">Application Name</label>
                    <input
                      id="name"
                      name="name"
                      required
                      placeholder="e.g. api-gateway-prod"
                      className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-muted-foreground/50 text-foreground shadow-inner"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-medium text-foreground/80">Runtime Environment</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {runtimes.map((rt) => (
                        <button
                          type="button"
                          key={rt.id}
                          onClick={() => setSelectedRuntime(rt.id)}
                          className={cn(
                            "flex items-center gap-3 p-4 rounded-xl border text-left transition-all duration-200",
                            selectedRuntime === rt.id
                              ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(59,130,246,0.15)] ring-1 ring-primary/20"
                              : "border-border/60 bg-muted/10 hover:bg-muted/30 hover:border-border"
                          )}
                        >
                          <rt.icon className={cn("w-5 h-5", selectedRuntime === rt.id ? rt.color : "text-muted-foreground")} />
                          <span className={cn("font-medium text-sm", selectedRuntime === rt.id ? "text-foreground" : "text-muted-foreground")}>
                            {rt.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {selectedRuntime === 'nodejs' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label htmlFor="dockerImage" className="text-sm font-medium text-foreground/80">Container image</label>
                        <input
                          id="dockerImage"
                          name="dockerImage"
                          value={dockerImage}
                          onChange={(e) => setDockerImage(e.target.value)}
                          placeholder="ghcr.io/acme/signaldesk:1"
                          className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-muted-foreground/50 text-foreground shadow-inner"
                        />
                        <p className="text-xs text-muted-foreground">Leave empty for a source container. An image deploys the API, an optional worker, and private Postgres or Redis.</p>
                      </div>
                      {dockerImage.trim() && (
                        <>
                          <div className="space-y-2">
                            <label htmlFor="workerCommand" className="text-sm font-medium text-foreground/80">Worker command</label>
                            <input
                              id="workerCommand"
                              name="workerCommand"
                              placeholder="node dist/worker.js"
                              className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-muted-foreground/50 text-foreground shadow-inner"
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <label htmlFor="port" className="text-sm font-medium text-foreground/80">Port</label>
                              <input
                                id="port"
                                name="port"
                                type="number"
                                defaultValue={3000}
                                className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-foreground shadow-inner"
                              />
                            </div>
                            <div className="space-y-2">
                              <label htmlFor="healthPath" className="text-sm font-medium text-foreground/80">Health path</label>
                              <input
                                id="healthPath"
                                name="healthPath"
                                defaultValue="/health"
                                className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-foreground shadow-inner"
                              />
                            </div>
                          </div>
                          <div className="flex gap-4 text-sm">
                            <label className="flex items-center gap-2">
                              <input type="checkbox" name="withPostgres" value="true" defaultChecked />
                              Postgres
                            </label>
                            <label className="flex items-center gap-2">
                              <input type="checkbox" name="withRedis" value="true" defaultChecked />
                              Redis
                            </label>
                          </div>
                          <div className="space-y-2">
                            <label htmlFor="envVars" className="text-sm font-medium text-foreground/80">Env</label>
                            <textarea
                              id="envVars"
                              name="envVars"
                              rows={3}
                              placeholder="LOG_LEVEL=info"
                              className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-muted-foreground/50 text-foreground shadow-inner font-mono text-sm"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {selectedRuntime === 'github' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2">
                      <label htmlFor="githubRepo" className="text-sm font-medium text-foreground/80">GitHub Repository URL</label>
                      <input
                        id="githubRepo"
                        name="githubRepo"
                        required
                        placeholder="https://github.com/user/repo"
                        className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-muted-foreground/50 text-foreground shadow-inner"
                      />
                      <div className="space-y-2 pt-2">
                        <label htmlFor="envVars" className="text-sm font-medium text-foreground/80">Environment Variables</label>
                        <textarea
                          id="envVars"
                          name="envVars"
                          rows={3}
                          placeholder="DATABASE_URL=...\nAPI_KEY=..."
                          className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-muted-foreground/50 text-foreground shadow-inner font-mono text-sm"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Your repository must contain a Dockerfile.</p>
                    </motion.div>
                  )}

                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      {error}
                    </motion.div>
                  )}

                  <div className="pt-4 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-muted text-muted-foreground transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100 shadow-lg shadow-primary/25"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Deploy Now
                    </button>
                  </div>
                </form>
                </motion.div>
              </div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
