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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-xl bg-card border border-border rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-muted border border-border flex items-center justify-center text-muted-foreground">
              <Container className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
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
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Preservation Guarantee Banner */}
          <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Zero-Loss Rolling Deployment</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Updating your container image performs a rolling update without recreating your databases, volumes, or routing configs.
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1 text-foreground font-medium">
                <Globe className="w-3.5 h-3.5 text-muted-foreground" /> Domains Kept
              </div>
              <div className="flex items-center gap-1 text-foreground font-medium">
                <Database className="w-3.5 h-3.5 text-muted-foreground" /> Database Kept
              </div>
              <div className="flex items-center gap-1 text-foreground font-medium">
                <KeyRound className="w-3.5 h-3.5 text-muted-foreground" /> OAuth / Users Kept
              </div>
            </div>
          </div>

          {/* Current Image */}
          {initialDockerImage && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Current Image</label>
              <div className="p-2.5 rounded-md bg-muted/30 border border-border font-mono text-xs text-foreground break-all select-all flex items-center gap-2">
                <span className="text-muted-foreground">image:</span>
                <span>{initialDockerImage}</span>
              </div>
            </div>
          )}

          {/* New Image Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground flex items-center justify-between">
              <span>New Container Image</span>
              <span className="text-xs text-muted-foreground font-mono">tag, digest, or registry</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={imageInput}
                onChange={(e) => setImageInput(e.target.value)}
                placeholder="e.g. ghcr.io/username/my-service:v2.1.0"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/40"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Supported registries include GitHub Packages (ghcr.io), Docker Hub, Quay, Google Artifact Registry, and custom private registries.
            </p>
          </div>

          {/* Feedback messages */}
          {error && (
            <div className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-red-400 text-xs">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border bg-card flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            A rolling update pulls the new image and rebinds the service.
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-md border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => handleUpdate(false)}
              disabled={isSaving || !imageInput.trim()}
              className="px-3 py-1.5 text-xs font-medium text-foreground rounded-md border border-border bg-muted hover:bg-muted/80 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Save Only
            </button>

            <button
              type="button"
              onClick={() => handleUpdate(true)}
              disabled={isSaving || !imageInput.trim()}
              className="px-3.5 py-1.5 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
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
