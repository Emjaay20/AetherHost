'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Box, Sparkles, Terminal, GitBranch, ArrowUpRight, RotateCcw, Loader2, KeyRound, Globe, Container } from 'lucide-react'
import { safeAppName } from '../lib/app-name'
import { getAppUrl } from '../lib/domain'
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

  return (
    <div className="group p-4 rounded-xl border border-border/50 bg-card hover:border-border transition-all shadow-sm hover:shadow-md flex flex-col justify-between">
      <div className="flex flex-wrap items-center justify-between gap-4 w-full">
        {/* Left: Icon & Details */}
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center border border-border/50 group-hover:scale-105 transition-transform">
            <Box className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <div>
          <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold text-sm">{app.name}</h4>
              <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {app.runtime}
              </span>
            </div>

            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <p className="max-w-full truncate font-mono text-xs text-muted-foreground">{app.id}</p>
              {app.githubRepo && (
                <a
                  href={app.githubRepo.replace(/\.git$/, '')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-white transition-colors"
                >
                  <GitBranch className="w-3 h-3 text-zinc-500" />
                  <span className="max-w-[160px] truncate sm:max-w-[240px]">{app.githubRepo.replace('https://github.com/', '').replace(/\.git$/, '')}</span>
                  <ArrowUpRight className="w-2.5 h-2.5 opacity-60" />
                </a>
              )}
              {currentDomain && (
                <a
                  href={`https://${currentDomain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20"
                  title="Connected Custom Domain"
                >
                  <Globe className="w-3 h-3 text-emerald-400" />
                  <span className="max-w-[160px] truncate sm:max-w-[240px]">{currentDomain}</span>
                  <ArrowUpRight className="w-2.5 h-2.5 opacity-60" />
                </a>
              )}
              {currentDockerImage && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20"
                  title={`Container Image: ${currentDockerImage}`}
                >
                  <Container className="w-3 h-3 text-cyan-400" />
                  <span className="max-w-[140px] truncate sm:max-w-[200px]">{currentDockerImage}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Status & Actions */}
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:gap-6">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <div className="relative flex h-2 w-2">
              {localStatus === 'running' ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </>
              ) : localStatus === 'failed' ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </>
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
                  ? 'text-green-500'
                  : localStatus === 'failed'
                    ? 'text-red-400'
                    : 'text-amber-500'
              }`}
            >
              {isRedeploying ? 'redeploying' : localStatus}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Redeploy Button */}
            <button
              type="button"
              onClick={handleRedeploy}
              disabled={isRedeploying}
              className={`text-xs font-medium transition-colors px-3 py-1.5 rounded-lg border flex items-center gap-1.5 shadow-sm disabled:opacity-50 ${
                localStatus === 'failed' || localStatus === 'pending'
                  ? 'text-emerald-300 hover:text-emerald-200 border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25'
                  : 'text-zinc-300 hover:text-foreground border-border/50 hover:bg-muted/50'
              }`}
              title="Trigger fresh container build & redeploy"
            >
              {isRedeploying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              <span>{isRedeploying ? 'Deploying...' : 'Redeploy'}</span>
            </button>

            {/* Env Vars Button */}
            <button
              type="button"
              onClick={() => setEnvModalOpen(true)}
              className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors px-3 py-1.5 rounded-lg border border-amber-500/30 hover:bg-amber-500/10 flex items-center gap-1.5 shadow-sm"
              title="Configure Environment Variables & Secrets"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Env</span>
            </button>

            {/* Update Container Image Button */}
            <button
              type="button"
              onClick={() => setImageModalOpen(true)}
              className={`text-xs font-medium transition-colors px-3 py-1.5 rounded-lg border flex items-center gap-1.5 shadow-sm ${
                currentDockerImage
                  ? 'text-cyan-400 hover:text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/10'
                  : 'text-slate-400 hover:text-slate-300 border-slate-700/80 hover:bg-slate-800/60'
              }`}
              title="Update Container Image without losing database, users, or domains"
            >
              <Container className="w-3.5 h-3.5" />
              <span>Image</span>
            </button>

            {/* Custom Domain Button */}
            <button
              type="button"
              onClick={() => setDomainModalOpen(true)}
              className={`text-xs font-medium transition-colors px-3 py-1.5 rounded-lg border flex items-center gap-1.5 shadow-sm ${
                currentDomain
                  ? 'text-emerald-400 hover:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/10'
                  : 'text-indigo-400 hover:text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/10'
              }`}
              title="Connect or configure Custom Domain"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Domain</span>
            </button>

            {/* AI Architect Button */}
            <button
              type="button"
              onClick={() => setAiModalOpen(true)}
              className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors px-3 py-1.5 rounded-lg border border-blue-500/30 hover:bg-blue-500/10 flex items-center gap-1.5 shadow-sm"
              title="Prompt AI Architect to modify code and push to GitHub"
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI Architect
            </button>

            {/* Web IDE Button */}
            {(app.runtime === 'docker' || app.aiFiles) && !app.dockerImage && (
              <a 
                href={getAppUrl(`${safeName}-ide`)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors px-3 py-1.5 rounded-lg border border-cyan-500/30 hover:bg-cyan-500/10 flex items-center gap-1"
              >
                <Terminal className="w-3 h-3" />
                IDE
              </a>
            )}

            {/* Visit Button */}
            <a 
              href={getAppUrl(safeName)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-foreground/80 hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border/50 hover:bg-muted/50"
            >
              Visit
            </a>

            {/* Delete Button */}
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-xs font-medium text-red-500 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Deployment Logs */}
      <DeploymentLogViewer
        appId={app.id}
        status={localStatus}
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
