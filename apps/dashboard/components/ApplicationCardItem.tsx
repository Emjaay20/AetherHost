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
  Loader2,
  KeyRound,
  Globe,
  Container,
  ChevronDown,
  Copy,
  Check,
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
  const [legacyDropdownOpen, setLegacyDropdownOpen] = useState(false)
  const [copiedLegacy, setCopiedLegacy] = useState(false)
  const [visitDropdownOpen, setVisitDropdownOpen] = useState(false)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [showLogs, setShowLogs] = useState(false)

  const legacyMenuRef = useRef<HTMLDivElement>(null)
  const visitMenuRef = useRef<HTMLDivElement>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (legacyMenuRef.current && !legacyMenuRef.current.contains(event.target as Node)) {
        setLegacyDropdownOpen(false)
      }
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
    <div className="p-4 rounded-lg border border-border bg-card transition-colors flex flex-col justify-between">
      <div className="flex flex-wrap items-center justify-between gap-4 w-full">
        {/* Left: Icon & Details */}
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center border border-border">
            <Box className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold text-sm">{app.name}</h4>
              <span className="px-2 py-0.5 text-xs font-mono uppercase tracking-wider rounded-md border border-border text-muted-foreground">
                {app.runtime}
              </span>
            </div>

            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <p className="max-w-full truncate font-mono text-xs text-muted-foreground">{app.id}</p>

              {/* Primary .app URL */}
              <a
                href={getAppUrl(safeName)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                title="Primary Domain (aetherhost.app)"
              >
                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="max-w-[150px] truncate sm:max-w-[210px]">{`${safeName}.aetherhost.app`}</span>
                <ArrowUpRight className="w-3 h-3 opacity-60" />
              </a>

              {/* Legacy .com.ng Dropdown (Only for legacy pre-migration apps) */}
              {isLegacy && (
                <div className="relative inline-block" ref={legacyMenuRef}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setLegacyDropdownOpen(!legacyDropdownOpen)
                    }}
                    className="inline-flex items-center gap-1 text-xs font-mono text-amber-500 hover:text-amber-400 transition-colors px-1.5 py-0.5 rounded-md border border-border hover:bg-muted"
                    title="Dual-Domain active: Click to view legacy aetherhost.com.ng domain"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <span>.com.ng</span>
                    <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${legacyDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {legacyDropdownOpen && (
                    <div
                      className="absolute left-0 mt-1.5 w-76 rounded-lg bg-card border border-border shadow-xl p-3 z-50 text-left"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                          <span className="text-xs font-semibold text-foreground">Legacy Domain Active</span>
                        </div>
                        <span className="text-xs uppercase font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                          Dual-Route
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground mb-2 leading-snug">
                        This application is dual-bound. Both URLs are live with SSL until the <code className="text-foreground">.com.ng</code> domain expires:
                      </p>

                      <div className="space-y-1.5 mb-3">
                        {/* Legacy URL item */}
                        <div className="p-2 rounded-md bg-muted/30 border border-border flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs text-muted-foreground font-mono">Legacy (.com.ng)</span>
                            <span className="block font-mono text-xs text-amber-500 truncate select-all">
                              {`${safeName}.aetherhost.com.ng`}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(getLegacyAppUrl(safeName))
                                setCopiedLegacy(true)
                                setTimeout(() => setCopiedLegacy(false), 2000)
                              }}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              title="Copy legacy URL"
                            >
                              {copiedLegacy ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <a
                              href={getLegacyAppUrl(safeName)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              title="Open in new tab"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>

                        {/* Primary URL item */}
                        <div className="p-2 rounded-md bg-muted/30 border border-border flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs text-muted-foreground font-mono">Primary (.app)</span>
                            <span className="block font-mono text-xs text-foreground truncate select-all">
                              {`${safeName}.aetherhost.app`}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <a
                              href={getAppUrl(safeName)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              title="Open primary URL"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <a
                          href={getLegacyAppUrl(safeName)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-center py-1 px-2 rounded-md bg-muted hover:bg-muted/80 text-foreground text-xs font-medium border border-border transition-colors"
                        >
                          Visit .com.ng
                        </a>
                        <a
                          href={getAppUrl(safeName)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-center py-1 px-2 rounded-md bg-muted hover:bg-muted/80 text-foreground text-xs font-medium border border-border transition-colors"
                        >
                          Visit .app
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {app.githubRepo && (
                <a
                  href={app.githubRepo.replace(/\.git$/, '')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                >
                  <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="max-w-[160px] truncate sm:max-w-[240px]">{app.githubRepo.replace('https://github.com/', '').replace(/\.git$/, '')}</span>
                  <ArrowUpRight className="w-3 h-3 opacity-60" />
                </a>
              )}
              {currentDomain && (
                <a
                  href={`https://${currentDomain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                  title="Connected Custom Domain"
                >
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="max-w-[160px] truncate sm:max-w-[240px]">{currentDomain}</span>
                  <ArrowUpRight className="w-3 h-3 opacity-60" />
                </a>
              )}
              {currentDockerImage && (
                <span
                  className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground"
                  title={`Container Image: ${currentDockerImage}`}
                >
                  <Container className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="max-w-[140px] truncate sm:max-w-[200px]">{currentDockerImage}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Status & Actions */}
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:gap-4">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-2">
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
                      <span className="text-amber-500">Open .com.ng (Legacy)</span>
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
