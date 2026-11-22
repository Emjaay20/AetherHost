'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Box,
  CheckCircle2,
  Container,
  FileCode2,
  GitBranch,
  Hexagon,
  LayoutTemplate,
  Loader2,
  Plus,
  Server,
  X,
} from 'lucide-react'
import { createApplication, inspectGithubRepository, type RepositoryInspection } from '../app/actions'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type DeploySource = 'repository' | 'image' | 'wordpress' | 'template'
type TemplateRuntime = 'nodejs' | 'python' | 'go' | 'rust'

const sources: Array<{ id: DeploySource; title: string; description: string; icon: typeof GitBranch }> = [
  { id: 'repository', title: 'Import Git repository', description: 'Connect a GitHub project and inspect its stack.', icon: GitBranch },
  { id: 'image', title: 'Deploy container image', description: 'Run an existing image with a managed public URL.', icon: Container },
  { id: 'wordpress', title: 'Launch WordPress', description: 'Create a managed WordPress website with persistent data.', icon: LayoutTemplate },
  { id: 'template', title: 'Start from a template', description: 'Generate a small, editable application to get started.', icon: FileCode2 },
]

const templates: Array<{ id: TemplateRuntime; title: string; icon: typeof Box }> = [
  { id: 'nodejs', title: 'Node.js', icon: Hexagon },
  { id: 'python', title: 'Python', icon: Server },
  { id: 'go', title: 'Go', icon: Box },
  { id: 'rust', title: 'Rust', icon: Box },
]

function runtimeFor(source: DeploySource, template: TemplateRuntime) {
  if (source === 'repository') return 'github'
  if (source === 'image') return 'docker'
  if (source === 'wordpress') return 'wordpress'
  return template
}

export default function CreateAppForm({ limitReached }: { limitReached: boolean }) {
  const [mounted, setMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<DeploySource>('repository')
  const [template, setTemplate] = useState<TemplateRuntime>('nodejs')
  const [githubRepo, setGithubRepo] = useState('')
  const [inspection, setInspection] = useState<RepositoryInspection | null>(null)
  const [inspecting, setInspecting] = useState(false)

  const runtime = useMemo(() => runtimeFor(source, template), [source, template])

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    setError(null)
    if (source !== 'repository') setInspection(null)
  }, [source])

  async function inspectRepository() {
    if (!githubRepo.trim()) {
      setError('Enter a GitHub repository URL before inspecting it.')
      return
    }
    setInspecting(true)
    setError(null)
    setInspection(null)
    const result = await inspectGithubRepository(githubRepo.trim())
    setInspecting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setInspection(result.data || null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (source === 'repository' && !inspection) {
      setError('Inspect this repository before deploying so AetherHost can validate its source layout.')
      return
    }
    setLoading(true)
    setError(null)
    const formData = new FormData(event.currentTarget)
    formData.set('runtime', runtime)
    if (source === 'repository') formData.set('githubRepo', githubRepo.trim())

    const result = await createApplication(formData)
    setLoading(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setIsOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        disabled={limitReached}
        className={cn(
          'flex items-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
          limitReached ? 'cursor-not-allowed border-border bg-muted text-muted-foreground' : 'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="sm:hidden">New</span>
        <span className="hidden sm:inline">New Application</span>
      </button>

      {mounted && createPortal(
        <AnimatePresence>
          {isOpen && (
            <div className="fixed inset-0 z-[9999] overflow-y-auto sm:p-6">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsOpen(false)} className="fixed inset-0 z-0 bg-background/80 backdrop-blur-sm" />
              <div className="relative z-10 flex min-h-full items-center justify-center p-4">
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-card shadow-xl">
                  <div className="flex items-start justify-between border-b border-border p-5">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Create application</p>
                      <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">Start with your source</h2>
                      <p className="mt-1 text-xs text-muted-foreground">Choose what you have; AetherHost will guide the deployment details.</p>
                    </div>
                    <button type="button" onClick={() => setIsOpen(false)} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Close deployment form"><X className="h-4 w-4" /></button>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5 p-5">
                    <div className="space-y-1.5">
                      <label htmlFor="name" className="text-xs font-medium text-foreground">Application name</label>
                      <input id="name" name="name" required placeholder="e.g. customer-portal" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary" />
                      <p className="text-xs text-muted-foreground">This becomes your initial AetherHost address. You can connect a custom domain later.</p>
                    </div>

                    <fieldset className="space-y-2">
                      <legend className="text-xs font-medium text-foreground">What would you like to deploy?</legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {sources.map((option) => {
                          const Icon = option.icon
                          const selected = option.id === source
                          return <button key={option.id} type="button" onClick={() => setSource(option.id)} className={cn('flex min-h-20 items-start gap-3 rounded-md border p-3 text-left transition-colors', selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/60')}>
                            <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border', selected ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground')}><Icon className="h-3.5 w-3.5" /></span>
                            <span><span className="block text-xs font-semibold text-foreground">{option.title}</span><span className="mt-1 block text-xs leading-4 text-muted-foreground">{option.description}</span></span>
                          </button>
                        })}
                      </div>
                    </fieldset>

                    {source === 'repository' && (
                      <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                        <div className="flex items-end gap-2">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <label htmlFor="githubRepo" className="text-xs font-medium text-foreground">GitHub repository</label>
                            <input id="githubRepo" name="githubRepo" type="url" required value={githubRepo} onChange={(event) => { setGithubRepo(event.target.value); setInspection(null) }} placeholder="https://github.com/owner/repository" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary" />
                          </div>
                          <button type="button" onClick={inspectRepository} disabled={inspecting} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60">
                            {inspecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}{inspecting ? 'Inspecting' : 'Inspect'}
                          </button>
                        </div>
                        {inspection ? (
                          <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-foreground"><span className="inline-flex items-center gap-1.5 font-semibold"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />{inspection.framework}</span>{inspection.packageManager && <span className="text-muted-foreground">{inspection.packageManager}</span>}<span className="text-muted-foreground">{inspection.dockerfile ? 'Dockerfile found' : 'No Dockerfile found'}</span>{inspection.monorepo && <span className="text-muted-foreground">Monorepo</span>}</div>
                            <p className="mt-2 leading-5 text-muted-foreground">{inspection.notes.join(' ')}</p>
                          </div>
                        ) : <p className="text-xs leading-5 text-muted-foreground">Inspect before deploying to identify the framework, package manager, Dockerfile, and monorepo markers. Your source remains unchanged.</p>}
                      </div>
                    )}

                    {source === 'image' && (
                      <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                        <div className="space-y-1.5"><label htmlFor="dockerImage" className="text-xs font-medium text-foreground">Container image</label><input id="dockerImage" name="dockerImage" required placeholder="ghcr.io/acme/customer-portal:1.2.0" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary" /></div>
                        <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-xs font-medium text-foreground">Port<input name="port" type="number" min="1" max="65535" defaultValue={3000} className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-primary" /></label><label className="space-y-1.5 text-xs font-medium text-foreground">Health path<input name="healthPath" defaultValue="/health" className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-primary" /></label></div>
                        <div className="grid gap-2 text-xs sm:grid-cols-3"><label className="flex items-center gap-2"><input type="checkbox" name="withPostgres" value="true" />Postgres</label><label className="flex items-center gap-2"><input type="checkbox" name="withMariaDb" value="true" />MariaDB</label><label className="flex items-center gap-2"><input type="checkbox" name="withRedis" value="true" />Redis</label></div>
                        <p className="text-xs text-muted-foreground">Data services are private to this application and their credentials are managed by AetherHost.</p>
                      </div>
                    )}

                    {source === 'template' && (
                      <fieldset className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
                        <legend className="px-1 text-xs font-medium text-foreground">Choose a starter template</legend>
                        <div className="grid gap-2 sm:grid-cols-4">{templates.map((option) => { const Icon = option.icon; return <button key={option.id} type="button" onClick={() => setTemplate(option.id)} className={cn('flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors', template === option.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted')}><Icon className="h-3.5 w-3.5" />{option.title}</button> })}</div>
                        <p className="text-xs leading-5 text-muted-foreground">AetherHost creates a small starter application with a health endpoint that you can extend or replace.</p>
                      </fieldset>
                    )}

                    {source === 'wordpress' && <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">AetherHost provisions a managed WordPress profile with persistent uploads and database storage. You will finish WordPress setup from its own installation screen after deployment.</div>}

                    {source !== 'wordpress' && (
                      <div className="space-y-3 border-t border-border pt-4">
                        <div className="space-y-1.5"><label htmlFor="envVars" className="text-xs font-medium text-foreground">Environment variables <span className="font-normal text-muted-foreground">optional</span></label><textarea id="envVars" name="envVars" rows={3} placeholder="API_URL=https://api.example.com" className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary" /><p className="text-xs text-muted-foreground">One <code>KEY=value</code> pair per line. Values are stored encrypted.</p></div>
                        <div className="space-y-1.5"><label htmlFor="customDomain" className="text-xs font-medium text-foreground">Custom domain <span className="font-normal text-muted-foreground">optional</span></label><input id="customDomain" name="customDomain" placeholder="app.example.com" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary" /></div>
                      </div>
                    )}

                    {error && <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />{error}</div>}
                    <div className="flex justify-end gap-2 border-t border-border pt-4"><button type="button" onClick={() => setIsOpen(false)} className="rounded-md border border-border px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Cancel</button><button type="submit" disabled={loading} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}{loading ? 'Starting deployment...' : 'Deploy application'}</button></div>
                  </form>
                </motion.div>
              </div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
