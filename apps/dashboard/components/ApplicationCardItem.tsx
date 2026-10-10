'use client'

import { useState } from 'react'
import { Box, Sparkles, Terminal, GitBranch, ArrowUpRight, Trash2 } from 'lucide-react'
import { safeAppName } from '../lib/app-name'
import { getAppUrl } from '../lib/domain'
import DeploymentLogViewer from './DeploymentLogViewer'
import AiProjectModal from './AiProjectModal'

interface ApplicationCardItemProps {
  app: {
    id: string
    name: string
    runtime: string
    status: string
    githubRepo?: string | null
    customDomain?: string | null
    dockerImage?: string | null
    aiFiles?: { path: string; content: string }[] | null
  }
  deleteAction: (id: string) => Promise<any>
}

export default function ApplicationCardItem({ app, deleteAction }: ApplicationCardItemProps) {
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm(`Are you sure you want to delete ${app.name}?`)) return
    setIsDeleting(true)
    try {
      await deleteAction(app.id)
    } finally {
      setIsDeleting(false)
    }
  }

  const safeName = safeAppName(app.name)

  return (
    <div className="group p-4 rounded-xl border border-border/50 bg-card hover:border-border transition-all shadow-sm hover:shadow-md flex flex-col justify-between">
      <div className="flex items-center justify-between w-full">
        {/* Left: Icon & Details */}
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center border border-border/50 group-hover:scale-105 transition-transform">
            <Box className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm">{app.name}</h4>
              <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {app.runtime}
              </span>
            </div>

            <div className="flex items-center gap-3 mt-1">
              <p className="text-xs text-muted-foreground font-mono">{app.id}</p>
              {app.githubRepo && (
                <a
                  href={app.githubRepo.replace(/\.git$/, '')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-white transition-colors"
                >
                  <GitBranch className="w-3 h-3 text-zinc-500" />
                  <span>{app.githubRepo.replace('https://github.com/', '').replace(/\.git$/, '')}</span>
                  <ArrowUpRight className="w-2.5 h-2.5 opacity-60" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Right: Status & Actions */}
        <div className="flex items-center gap-6">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <div className="relative flex h-2 w-2">
              {app.status === 'running' ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </>
              ) : (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </>
              )}
            </div>
            <span className={`text-xs font-medium capitalize ${app.status === 'running' ? 'text-green-500' : 'text-amber-500'}`}>
              {app.status}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
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
      <DeploymentLogViewer appId={app.id} status={app.status} />

      {/* AI Project Architect Modal */}
      <AiProjectModal
        app={app}
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
      />
    </div>
  )
}
