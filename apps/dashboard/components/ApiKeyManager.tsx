'use client'

import { useState, useEffect } from 'react'
import { createApiKey, listApiKeys, revokeApiKey } from '../app/actions'
import { Key, Plus, Trash2, Copy, Check, Terminal, ShieldAlert } from 'lucide-react'

interface ApiKeyItem {
  id: string
  name: string
  keyPrefix: string
  createdAt: string
  lastUsedAt: string | null
}

export default function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [keyName, setKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [commandCopied, setCommandCopied] = useState(false)
  const [installerCopied, setInstallerCopied] = useState(false)

  const loadKeys = async () => {
    setLoading(true)
    try {
      const data = await listApiKeys()
      if (Array.isArray(data)) {
        setKeys(data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadKeys()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await createApiKey(keyName || 'CLI Access Token')
      if (res.data?.key) {
        setNewKey(res.data.key)
        setKeyName('')
        await loadKeys()
      } else if (res.error) {
        alert(res.error)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key? Any CLI session using it will immediately lose access.')) {
      return
    }
    try {
      await revokeApiKey(id)
      setKeys(keys.filter(k => k.id !== id))
    } catch (err) {
      console.error(err)
    }
  }

  const copyToClipboard = (text: string, isCommand = false) => {
    navigator.clipboard.writeText(text)
    if (isCommand) {
      setCommandCopied(true)
      setTimeout(() => setCommandCopied(false), 2000)
    } else {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <section className="p-6 rounded-2xl border border-border/50 bg-card shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-lg text-foreground">CLI & Developer Access Tokens</h3>
            <p className="text-sm text-muted-foreground">
              Use API keys to authenticate the Rust <code>aether</code> CLI and automate deployments from CI/CD.
            </p>
          </div>
        </div>

        {/* Quick Install Snippet */}
        <div className="mt-4 p-3 bg-muted/40 border border-border/50 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-mono text-xs text-foreground overflow-x-auto">
            <Terminal className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>curl -fsSL https://console.aetherhost.com.ng/install.sh | bash</span>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText('curl -fsSL https://console.aetherhost.com.ng/install.sh | bash')
              setInstallerCopied(true)
              setTimeout(() => setInstallerCopied(false), 2000)
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border text-xs font-sans font-medium hover:bg-muted transition-colors shrink-0 text-muted-foreground hover:text-foreground self-start sm:self-auto"
          >
            {installerCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            {installerCopied ? 'Copied' : 'Copy Install Command'}
          </button>
        </div>

        {/* Create Key Form */}
        <form onSubmit={handleCreate} className="mt-6 flex gap-3">
          <input
            type="text"
            placeholder="Key nickname (e.g. MacBook Pro, GitHub Actions)"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Generating...' : 'Generate CLI Token'}
          </button>
        </form>
      </section>

      {/* New Key Alert Banner */}
      {newKey && (
        <section className="p-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2 text-amber-500 font-semibold text-sm">
            <ShieldAlert className="w-4 h-4" />
            <span>Copy your API key now. It will not be shown again.</span>
          </div>

          <div className="flex items-center justify-between bg-background border border-border rounded-xl p-3 font-mono text-xs">
            <span className="truncate pr-4 select-all text-foreground">{newKey}</span>
            <button
              onClick={() => copyToClipboard(newKey)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-sans font-medium transition-colors shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Key'}
            </button>
          </div>

          <div className="space-y-2 pt-2 border-t border-border/40">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-primary" /> Run this command in your terminal:
            </p>
            <div className="flex items-center justify-between bg-black/60 rounded-xl p-3 font-mono text-xs text-emerald-400">
              <span className="truncate pr-4 select-all">
                aether login --token {newKey}
              </span>
              <button
                onClick={() => copyToClipboard(`aether login --token ${newKey}`, true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 text-xs font-sans font-medium transition-colors shrink-0"
              >
                {commandCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {commandCopied ? 'Copied' : 'Copy Command'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Keys List */}
      <section className="p-6 rounded-2xl border border-border/50 bg-card shadow-sm">
        <h4 className="font-semibold text-sm text-foreground mb-4">Active API Keys</h4>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Loading active tokens...</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No API keys generated yet. Click &quot;Generate CLI Token&quot; above to connect your terminal.
          </p>
        ) : (
          <div className="divide-y divide-border/40">
            {keys.map((k) => (
              <div key={k.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm text-foreground flex items-center gap-2">
                    {k.name}
                    <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {k.keyPrefix}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt ? ` • Last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : ' • Never used'}
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(k.id)}
                  title="Revoke Token"
                  className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
