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
  { id: 'nodejs', name: 'Node.js', icon: Hexagon },
  { id: 'python', name: 'Python', icon: Server },
  { id: 'go', name: 'Go', icon: Box },
  { id: 'docker', name: 'Docker', icon: Component },
  { id: 'github', name: 'GitHub Repo', icon: GitBranch },
  { id: 'wordpress', name: 'WordPress', icon: LayoutTemplate },
  { id: 'rust', name: 'Rust', icon: Box },
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
          "flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-xs rounded-md font-medium transition-colors border",
          limitReached 
            ? "bg-muted text-muted-foreground cursor-not-allowed border-border" 
            : "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
        )}
      >
        <Plus className="w-3.5 h-3.5" />
        <span className="sm:hidden">New</span>
        <span className="hidden sm:inline">New Application</span>
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
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="w-full max-w-lg bg-card border border-border rounded-lg shadow-xl"
                >
                <div className="p-5 border-b border-border flex items-center justify-between">
                  <h2 className="text-base font-semibold tracking-tight text-foreground">Deploy Application</h2>
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="name" className="text-xs font-medium text-foreground">Application Name</label>
                    <input
                      id="name"
                      name="name"
                      required
                      placeholder="e.g. api-gateway-prod"
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">Runtime Environment</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {runtimes.map((rt) => (
                        <button
                          type="button"
                          key={rt.id}
                          onClick={() => setSelectedRuntime(rt.id)}
                          className={cn(
                            "flex items-center gap-2.5 p-2.5 rounded-md border text-left transition-colors",
                            selectedRuntime === rt.id
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border bg-card hover:bg-muted text-muted-foreground"
                          )}
                        >
                          <rt.icon className="w-4 h-4 text-foreground" />
                          <span className="font-medium text-xs">
                            {rt.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {selectedRuntime === 'nodejs' && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label htmlFor="dockerImage" className="text-xs font-medium text-foreground">Container image</label>
                        <input
                          id="dockerImage"
                          name="dockerImage"
                          value={dockerImage}
                          onChange={(e) => setDockerImage(e.target.value)}
                          placeholder="ghcr.io/acme/signaldesk:1"
                          className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
                        />
                        <p className="text-xs text-muted-foreground">Leave empty for a source container. An image deploys the API, an optional worker, and private Postgres or Redis.</p>
                      </div>
                      {dockerImage.trim() && (
                        <>
                          <div className="space-y-1.5">
                            <label htmlFor="workerCommand" className="text-xs font-medium text-foreground">Worker command</label>
                            <input
                              id="workerCommand"
                              name="workerCommand"
                              placeholder="node dist/worker.js"
                              className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                              <label htmlFor="port" className="text-xs font-medium text-foreground">Port</label>
                              <input
                                id="port"
                                name="port"
                                type="number"
                                defaultValue={3000}
                                className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:border-primary text-foreground"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label htmlFor="healthPath" className="text-xs font-medium text-foreground">Health path</label>
                              <input
                                id="healthPath"
                                name="healthPath"
                                defaultValue="/health"
                                className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:border-primary text-foreground"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                            <label className="flex items-center gap-2">
                              <input type="checkbox" name="withPostgres" value="true" defaultChecked />
                              Postgres
                            </label>
                            <label className="flex items-center gap-2">
                              <input type="checkbox" name="withMariaDb" value="true" />
                              MariaDB
                            </label>
                            <label className="flex items-center gap-2">
                              <input type="checkbox" name="withRedis" value="true" defaultChecked />
                              Redis
                            </label>
                          </div>
                          <p className="text-xs text-muted-foreground">Data services are private, credentialed automatically, and never publish host ports.</p>
                          <div className="space-y-1.5">
                            <label htmlFor="envVars" className="text-xs font-medium text-foreground">Env</label>
                            <textarea
                              id="envVars"
                              name="envVars"
                              rows={3}
                              placeholder="LOG_LEVEL=info"
                              className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground font-mono"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {selectedRuntime === 'github' && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label htmlFor="githubRepo" className="text-xs font-medium text-foreground">GitHub Repository URL</label>
                        <input
                          id="githubRepo"
                          name="githubRepo"
                          required
                          placeholder="https://github.com/user/repo"
                          className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
                        />
                      </div>
                      <div className="space-y-1.5 pt-1">
                        <label htmlFor="envVars" className="text-xs font-medium text-foreground">Environment Variables</label>
                        <textarea
                          id="envVars"
                          name="envVars"
                          rows={3}
                          placeholder="DATABASE_URL=...\nAPI_KEY=..."
                          className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground font-mono"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Your repository must contain a Dockerfile.</p>
                    </div>
                  )}

                  {error && (
                    <div className="p-2.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      {error}
                    </div>
                  )}

                  <div className="pt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="px-3.5 py-1.5 rounded-md text-xs font-medium hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
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
