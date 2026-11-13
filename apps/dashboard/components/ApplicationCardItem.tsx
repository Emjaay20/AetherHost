'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Sparkles,
  Terminal,
  GitBranch,
  ArrowUpRight,
  RotateCcw,
  KeyRound,
  Globe,
  Container,
  ChevronDown,
  ExternalLink,
  MoreHorizontal,
  Trash2,
} from 'lucide-react'
import { safeAppName } from '../lib/app-name'
import { getAppUrl, getLegacyAppUrl, isLegacyApplication } from '../lib/domain'
import { redeployApplication } from '../app/actions'
import DeploymentLogViewer from './DeploymentLogViewer'
import AiProjectModal from './AiProjectModal'
import EnvVarsModal from './EnvVarsModal'
import CustomDomainModal from './CustomDomainModal'
import UpdateImageModal from './UpdateImageModal'

export interface ApplicationItem {
  id: string
  name: string
  runtime: string
  status: string
  createdAt?: string | Date | null
  githubRepo?: string | null
  customDomain?: string | null
  dockerImage?: string | null
  aiFiles?: { path: string; content: string }[] | null
  envVars?: Record<string, string> | null
}

interface ApplicationCardItemProps {
  app: ApplicationItem
  deleteAction: (id: string) => Promise<unknown>
}

export default function ApplicationCardItem({ app, deleteAction }: ApplicationCardItemProps) {
  const router = useRouter()
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [envModalOpen, setEnvModalOpen] = useState(false)
  const [domainModalOpen, setDomainModalOpen] = useState(false)
  const [imageModalOpen, setImageModalOpen] = useState(false)
  const [currentDomain, setCurrentDomain] = useState(app.customDomain || null)
  const [currentDockerImage, setCurrentDockerImage] = useState(app.dockerImage || null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRedeploying, setIsRedeploying] = useState(false)
  const [localStatus, setLocalStatus] = useState(app.status)
  const [visitDropdownOpen, setVisitDropdownOpen] = useState(false)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [showLogs, setShowLogs] = useState(false)

  const visitMenuRef = useRef<HTMLDivElement>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (visitMenuRef.current && !visitMenuRef.current.contains(event.target as Node)) {
        setVisitDropdownOpen(false)
      }
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setActionMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setCurrentDomain(app.customDomain || null)
  }, [app.customDomain])

  useEffect(() => {
    setCurrentDockerImage(app.dockerImage || null)
  }, [app.dockerImage])

  useEffect(() => {
    setLocalStatus(app.status)
    if (app.status !== 'pending') {
      setIsRedeploying(false)
    }
  }, [app.status])

  useEffect(() => {
    if (localStatus !== 'pending') return
    // Pause background polling while any configuration modal is open
    if (envModalOpen || domainModalOpen || aiModalOpen || imageModalOpen) return
    const interval = setInterval(() => {
      router.refresh()
    }, 3000)
    return () => clearInterval(interval)
  }, [localStatus, router, envModalOpen, domainModalOpen, aiModalOpen, imageModalOpen])

  async function handleDelete() {
    if (!confirm(`Are you sure you want to delete ${app.name}?`)) return
    setIsDeleting(true)
    try {
      await deleteAction(app.id)
      router.refresh()
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleRedeploy() {
    if (isRedeploying) return
    setIsRedeploying(true)
    setLocalStatus('pending')
    try {
      const res = await redeployApplication(app.id)
      if (res?.error) {
        setLocalStatus(app.status)
        setIsRedeploying(false)
      } else {
        router.refresh()
      }
    } catch {
      setLocalStatus(app.status)
      setIsRedeploying(false)
    }
  }

  const safeName = safeAppName(app.name)
  const isLegacy = isLegacyApplication(app.createdAt)

  return (
    <div className={`px-3 py-2 transition-colors ${localStatus === 'failed' ? 'bg-red-500/[0.03]' : ''}`}>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_6.5rem_auto] lg:items-center">
        <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(11rem,1fr)_minmax(0,1.6fr)] lg:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
              <Box className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h4 className="truncate text-sm font-semibold">{app.name}</h4>
                <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {app.runtime}
                </span>
              </div>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 overflow-hidden font-mono text-xs text-muted-foreground">
            <span className="shrink-0 text-muted-foreground/70">{app.id.slice(0, 8)}</span>
            {app.githubRepo && (
              <a
                href={app.githubRepo.replace(/\.git$/, '')}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-1 truncate hover:text-foreground"
                title={app.githubRepo}
              >
                <GitBranch className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{app.githubRepo.replace('https://github.com/', '').replace(/\.git$/, '')}</span>
              </a>
            )}
            {currentDomain && (
              <a href={`https://${currentDomain}`} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate hover:text-foreground" title={currentDomain}>
                {currentDomain}
              </a>
            )}
            {currentDockerImage && <span className="min-w-0 truncate" title={currentDockerImage}>{currentDockerImage}</span>}
          </div>
        </div>

        {/* Right: Status & Actions */}
        <div className="flex items-center gap-3 lg:contents">
          {/* Status Badge */}
          <div className="flex w-[6.5rem] shrink-0 items-center gap-2 whitespace-nowrap">
            <div className="relative flex h-2 w-2">
              {localStatus === 'running' ? (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              ) : localStatus === 'failed' ? (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              ) : (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </>
              )}
            </div>
            <span
              className={`text-xs font-medium capitalize ${
                localStatus === 'running'
                  ? 'text-emerald-500'
                  : localStatus === 'failed'
                    ? 'text-red-400'
                    : 'text-amber-500'
              }`}
            >
              {isRedeploying ? 'redeploying' : localStatus}
            </span>
          </div>

          {/* Action Buttons: 2 visible (Visit, Logs) + overflow menu */}
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            {/* Action 1: Visit Button */}
            {isLegacy ? (
              <div className="relative inline-flex rounded-md" ref={visitMenuRef}>
                <a
                  href={getAppUrl(safeName)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-foreground hover:bg-muted transition-colors px-2.5 py-1.5 rounded-l-md border border-r-0 border-border inline-flex items-center gap-1"
                  title="Visit primary URL (.app)"
                >
                  <span>Visit</span>
                  <ArrowUpRight className="w-3 h-3 opacity-60" />
                </a>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setVisitDropdownOpen(!visitDropdownOpen)
                  }}
                  className="px-1.5 py-1.5 rounded-r-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Choose domain to visit"
                >
                  <ChevronDown className={`w-3 h-3 transition-transform ${visitDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {visitDropdownOpen && (
                  <div
                    className="absolute right-0 top-full mt-1.5 w-52 rounded-md bg-card border border-border shadow-xl py-1 z-50 text-left"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <a
                      href={getAppUrl(safeName)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                      onClick={() => setVisitDropdownOpen(false)}
                    >
                      <span className="font-medium">Open .app (Primary)</span>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                    </a>
                    <a
                      href={getLegacyAppUrl(safeName)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                      onClick={() => setVisitDropdownOpen(false)}
                    >
                      <span>Open .com.ng (Legacy)</span>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <a 
                href={getAppUrl(safeName)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-foreground hover:bg-muted transition-colors px-2.5 py-1.5 rounded-md border border-border inline-flex items-center gap-1"
              >
                <span>Visit</span>
                <ArrowUpRight className="w-3 h-3 opacity-60" />
              </a>
            )}

            {/* Action 2: Logs Toggle Button */}
            <button
              type="button"
              onClick={() => setShowLogs(!showLogs)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors px-2.5 py-1.5 rounded-md border border-border inline-flex items-center gap-1.5"
              title="Toggle Deployment Logs"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Logs</span>
            </button>

            {/* Overflow "⋯" Menu */}
            <div className="relative inline-block" ref={actionMenuRef}>
              <button
                type="button"
                onClick={() => setActionMenuOpen(!actionMenuOpen)}
                className="p-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="More actions"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {actionMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1.5 w-48 rounded-md bg-card border border-border shadow-xl py-1 z-50 text-left text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActionMenuOpen(false)
                      handleRedeploy()
                    }}
                    disabled={isRedeploying}
                    className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-muted text-foreground transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isRedeploying ? 'animate-spin' : ''}`} />
                    <span>{isRedeploying ? 'Redeploying...' : 'Redeploy'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActionMenuOpen(false)
                      setEnvModalOpen(true)
                    }}
                    className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-muted text-foreground transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Environment Variables</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActionMenuOpen(false)
                      setImageModalOpen(true)
                    }}
                    className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-muted text-foreground transition-colors"
                  >
                    <Container className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Container Image</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActionMenuOpen(false)
                      setDomainModalOpen(true)
                    }}
                    className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-muted text-foreground transition-colors"
                  >
                    <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Custom Domain</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActionMenuOpen(false)
                      setAiModalOpen(true)
                    }}
                    className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-muted text-foreground transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>AI Architect</span>
                  </button>

                  {(app.runtime === 'docker' || app.aiFiles) && !app.dockerImage && (
                    <a
                      href={getAppUrl(`${safeName}-ide`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-muted text-foreground transition-colors"
                    >
                      <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Web IDE</span>
                    </a>
                  )}

                  <div className="my-1 border-t border-border" />

                  <button
                    type="button"
                    onClick={() => {
                      setActionMenuOpen(false)
                      handleDelete()
                    }}
                    disabled={isDeleting}
                    className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-destructive/10 text-red-500 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isDeleting ? 'Deleting...' : 'Delete Application'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Deployment Logs */}
      <DeploymentLogViewer
        appId={app.id}
        status={localStatus}
        isOpen={showLogs}
        onToggle={() => setShowLogs(!showLogs)}
        onRedeployTriggered={() => {
          setLocalStatus('pending')
          router.refresh()
          setTimeout(() => {
            setLocalStatus('running')
            router.refresh()
          }, 2800)
        }}
      />

      {/* AI Project Architect Modal */}
      <AiProjectModal
        app={{ ...app, status: localStatus }}
        isOpen={aiModalOpen}
        onClose={() => {
          setAiModalOpen(false)
          router.refresh()
        }}
      />

      {/* Environment Variables Modal */}
      <EnvVarsModal
        appId={app.id}
        appName={app.name}
        initialEnvVars={app.envVars}
        isOpen={envModalOpen}
        onClose={() => {
          setEnvModalOpen(false)
          router.refresh()
        }}
        onRedeployStarted={() => {
          setLocalStatus('pending')
          router.refresh()
          setTimeout(() => {
            setLocalStatus('running')
            router.refresh()
          }, 3000)
        }}
      />

      {/* Custom Domain Modal */}
      <CustomDomainModal
        appId={app.id}
        appName={app.name}
        initialCustomDomain={currentDomain}
        isOpen={domainModalOpen}
        onClose={() => setDomainModalOpen(false)}
        onDomainUpdated={(newDomain) => {
          setCurrentDomain(newDomain)
          setLocalStatus('pending')
          router.refresh()
        }}
      />

      {/* Update Container Image Modal */}
      <UpdateImageModal
        appId={app.id}
        appName={app.name}
        initialDockerImage={currentDockerImage}
        isOpen={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
        onImageUpdated={(newImage, redeployed) => {
          setCurrentDockerImage(newImage)
          if (redeployed) {
            setLocalStatus('pending')
            router.refresh()
            setTimeout(() => {
              setLocalStatus('running')
              router.refresh()
            }, 3000)
          } else {
            router.refresh()
          }
        }}
      />
    </div>
  )
}
