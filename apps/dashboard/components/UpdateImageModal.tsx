'use client'

import { useState, useEffect, useRef } from 'react'
import {
  X,
  Container,
  RotateCcw,
  Save,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Database,
  Globe,
  KeyRound,
  ArrowRight,
} from 'lucide-react'
import { updateApplicationDockerImage } from '../app/actions'

interface UpdateImageModalProps {
  appId: string
  appName: string
  initialDockerImage?: string | null
  isOpen: boolean
  onClose: () => void
  onImageUpdated?: (newImage: string, redeployed: boolean) => void
}

export default function UpdateImageModal({
  appId,
  appName,
  initialDockerImage,
  isOpen,
  onClose,
  onImageUpdated,
}: UpdateImageModalProps) {
  const [imageInput, setImageInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const isInitializedRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      isInitializedRef.current = false
      setError(null)
      setSuccessMsg(null)
      return
    }

    if (isInitializedRef.current) return
    isInitializedRef.current = true

    setImageInput(initialDockerImage || '')
  }, [isOpen, initialDockerImage])

  async function handleUpdate(redeploy: boolean) {
    const trimmed = imageInput.trim()
    if (!trimmed) {
      setError('Please provide a container image reference (e.g. ghcr.io/org/app:latest)')
      return
    }

    setError(null)
    setSuccessMsg(null)
    setIsSaving(true)

    try {
      const res = await updateApplicationDockerImage(appId, trimmed, redeploy)
      if (res.error) {
        setError(res.error)
        setIsSaving(false)
        return
      }

      setSuccessMsg(
        redeploy
          ? 'Container image updated! Rolling redeployment initiated.'
          : 'Container image reference updated successfully.'
      )

      if (onImageUpdated) {
        onImageUpdated(trimmed, redeploy)
      }

      setTimeout(() => {
        onClose()
      }, 1200)
    } catch {
      setError('An error occurred while updating the container image.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Container className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-foreground flex items-center gap-2">
                Update Container Image
              </h3>
              <p className="text-xs text-muted-foreground">
                Deploy a new image for <span className="text-foreground font-mono font-medium">{appName}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-slate-800 hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Preservation Guarantee Banner */}
          <div className="p-3.5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>Zero-Loss Rolling Deployment</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Updating your container image performs a rolling update without recreating your databases, volumes, or routing configs.
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1 text-slate-300 font-medium">
                <Globe className="w-3 h-3 text-cyan-400" /> Domains Kept
              </div>
              <div className="flex items-center gap-1 text-slate-300 font-medium">
                <Database className="w-3 h-3 text-cyan-400" /> Database Kept
              </div>
              <div className="flex items-center gap-1 text-slate-300 font-medium">
                <KeyRound className="w-3 h-3 text-cyan-400" /> OAuth / Users Kept
              </div>
            </div>
          </div>

          {/* Current Image */}
          {initialDockerImage && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Current Image</label>
              <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 font-mono text-xs text-slate-300 break-all select-all flex items-center gap-2">
                <span className="text-muted-foreground">image:</span>
                <span className="text-cyan-300">{initialDockerImage}</span>
              </div>
            </div>
          )}

          {/* New Image Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground flex items-center justify-between">
              <span>New Container Image</span>
              <span className="text-[11px] text-muted-foreground font-mono">tag, digest, or registry</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={imageInput}
                onChange={(e) => setImageInput(e.target.value)}
                placeholder="e.g. ghcr.io/username/my-service:v2.1.0"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-foreground focus:outline-none focus:border-cyan-500 placeholder:text-muted-foreground/40"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Supported registries include GitHub Packages (ghcr.io), Docker Hub, Quay, Google Artifact Registry, and custom private registries.
            </p>
          </div>

          {/* Feedback messages */}
          {error && (
            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            A rolling update pulls the new image and rebinds the service.
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg border border-slate-800 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => handleUpdate(false)}
              disabled={isSaving || !imageInput.trim()}
              className="px-3.5 py-2 text-xs font-medium text-foreground rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Save Only
            </button>

            <button
              type="button"
              onClick={() => handleUpdate(true)}
              disabled={isSaving || !imageInput.trim()}
              className="px-4 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-md shadow-cyan-600/20 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              Update & Deploy
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
