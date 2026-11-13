'use client'

import { useState, useEffect, useRef } from 'react'
import {
  X,
  Globe,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  Loader2,
  Trash2,
  Save,
  AlertCircle,
} from 'lucide-react'
import { updateApplicationCustomDomain } from '../app/actions'

interface CustomDomainModalProps {
  appId: string
  appName: string
  initialCustomDomain?: string | null
  isOpen: boolean
  onClose: () => void
  onDomainUpdated?: (newDomain: string | null) => void
}

const SERVER_IP = '194.163.172.101'

export default function CustomDomainModal({
  appId,
  appName,
  initialCustomDomain,
  isOpen,
  onClose,
  onDomainUpdated,
}: CustomDomainModalProps) {
  const [domainInput, setDomainInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [copiedIp, setCopiedIp] = useState(false)
  const [copiedCname, setCopiedCname] = useState(false)

  const safeName = appName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const defaultCnameTarget = `${safeName}.aetherhost.app`

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
    setDomainInput(initialCustomDomain || '')
  }, [isOpen, initialCustomDomain])

  if (!isOpen) return null

  const handleCopy = (text: string, type: 'ip' | 'cname') => {
    navigator.clipboard.writeText(text)
    if (type === 'ip') {
      setCopiedIp(true)
      setTimeout(() => setCopiedIp(false), 2000)
    } else {
      setCopiedCname(true)
      setTimeout(() => setCopiedCname(false), 2000)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)

    const cleaned = domainInput
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')

    if (!cleaned) {
      setError('Please enter a domain name')
      return
    }

    setIsSaving(true)
    try {
      const res = await updateApplicationCustomDomain(appId, cleaned)
      if (res.error) {
        setError(res.error)
      } else {
        setSuccessMsg(
          `Domain "${cleaned}" successfully connected! SSL certificate is provisioning automatically via Let's Encrypt.`,
        )
        onDomainUpdated?.(cleaned)
        setTimeout(() => {
          onClose()
        }, 1800)
      }
    } catch {
      setError('An error occurred while saving the custom domain')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemove = async () => {
    if (
      !confirm(
        `Are you sure you want to disconnect ${initialCustomDomain}? Traffic will route to ${defaultCnameTarget} only.`,
      )
    ) {
      return
    }
    setError(null)
    setSuccessMsg(null)
    setIsRemoving(true)
    try {
      const res = await updateApplicationCustomDomain(appId, null)
      if (res.error) {
        setError(res.error)
      } else {
        setSuccessMsg('Custom domain removed successfully')
        setDomainInput('')
        onDomainUpdated?.(null)
        setTimeout(() => {
          onClose()
        }, 1200)
      }
    } catch {
      setError('Failed to remove custom domain')
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div
        className="relative w-full max-w-lg bg-card border border-border rounded-lg shadow-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-muted border border-border flex items-center justify-center text-muted-foreground">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                Custom Domain
                <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-md border border-border text-muted-foreground">
                  Starter & Above
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Connect your own domain to <span className="text-foreground">{appName}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-md bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2">
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Domain Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground flex items-center justify-between">
              <span>Domain Name</span>
              {initialCustomDomain && (
                <a
                  href={`https://${initialCustomDomain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  Visit https://{initialCustomDomain} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="example.com or app.example.com"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary font-mono"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enter your root domain (e.g. <code className="text-foreground">mybrand.com</code>) or subdomain (e.g. <code className="text-foreground">shop.mybrand.com</code>).
            </p>
          </div>

          {/* DNS Configuration Instructions */}
          <div className="p-4 rounded-md bg-muted/20 border border-border space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Required DNS Records at your Registrar</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Add either an <strong className="text-foreground">A record</strong> (for apex/root domain) or a <strong className="text-foreground">CNAME record</strong> (for subdomains) in Cloudflare, Namecheap, GoDaddy, etc.:
            </p>

            <div className="space-y-2 text-xs font-mono">
              {/* A Record */}
              <div className="flex items-center justify-between p-2.5 rounded-md bg-muted/40 border border-border">
                <div>
                  <span className="text-foreground font-semibold mr-2">A</span>
                  <span className="text-muted-foreground mr-2">@</span>
                  <span className="text-foreground">{SERVER_IP}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(SERVER_IP, 'ip')}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md bg-muted hover:bg-muted/80 transition-colors"
                >
                  {copiedIp ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedIp ? 'Copied' : 'Copy IP'}</span>
                </button>
              </div>

              {/* CNAME Record */}
              <div className="flex items-center justify-between p-2.5 rounded-md bg-muted/40 border border-border">
                <div className="truncate mr-2">
                  <span className="text-foreground font-semibold mr-2">CNAME</span>
                  <span className="text-muted-foreground mr-2">www</span>
                  <span className="text-foreground">{defaultCnameTarget}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(defaultCnameTarget, 'cname')}
                  className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md bg-muted hover:bg-muted/80 transition-colors"
                >
                  {copiedCname ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCname ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground italic">
              Traefik edge router automatically provisions and auto-renews free Let&apos;s Encrypt SSL/TLS certificates once DNS propagates.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            <div>
              {initialCustomDomain && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={isRemoving || isSaving}
                  className="text-xs text-red-500 hover:text-red-400 px-3 py-1.5 rounded-md hover:bg-red-500/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isRemoving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>Disconnect</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || isRemoving}
                className="text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 px-3.5 py-1.5 rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Save & Connect</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
