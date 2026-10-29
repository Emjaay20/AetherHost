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

  const defaultCnameTarget = `${safeName}.aetherhost.com.ng`

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-[#0d0f12] border border-border/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-card/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                Custom Domain
                <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
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
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2">
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Domain Input */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground flex items-center justify-between">
              <span>Domain Name</span>
              {initialCustomDomain && (
                <a
                  href={`https://${initialCustomDomain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
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
                className="w-full px-3.5 py-2.5 rounded-xl bg-muted/40 border border-border/60 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 font-mono"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Enter your root domain (e.g. <code className="text-foreground">mybrand.com</code>) or subdomain (e.g. <code className="text-foreground">shop.mybrand.com</code>).
            </p>
          </div>

          {/* DNS Configuration Instructions */}
          <div className="p-4 rounded-xl bg-muted/20 border border-border/40 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Required DNS Records at your Registrar</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Add either an <strong className="text-foreground">A record</strong> (for apex/root domain) or a <strong className="text-foreground">CNAME record</strong> (for subdomains) in Cloudflare, Namecheap, GoDaddy, etc.:
            </p>

            <div className="space-y-2 text-xs font-mono">
              {/* A Record */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/40 border border-white/5">
                <div>
                  <span className="text-blue-400 font-semibold mr-2">A</span>
                  <span className="text-zinc-400 mr-2">@</span>
                  <span className="text-foreground">{SERVER_IP}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(SERVER_IP, 'ip')}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-foreground px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors"
                >
                  {copiedIp ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedIp ? 'Copied' : 'Copy IP'}</span>
                </button>
              </div>

              {/* CNAME Record */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/40 border border-white/5">
                <div className="truncate mr-2">
                  <span className="text-purple-400 font-semibold mr-2">CNAME</span>
                  <span className="text-zinc-400 mr-2">www</span>
                  <span className="text-foreground">{defaultCnameTarget}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(defaultCnameTarget, 'cname')}
                  className="shrink-0 flex items-center gap-1 text-[11px] text-zinc-400 hover:text-foreground px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors"
                >
                  {copiedCname ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCname ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <p className="text-[10px] text-zinc-500 italic">
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
                  className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
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
                className="text-xs text-muted-foreground hover:text-foreground px-3.5 py-2 rounded-xl hover:bg-muted/50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || isRemoving}
                className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm shadow-blue-500/20 disabled:opacity-50"
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
