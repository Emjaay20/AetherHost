'use client'

import { useState } from 'react'
import { Send, CheckCircle2, AlertTriangle, ShieldAlert, Sparkles, MessageSquare } from 'lucide-react'

export default function SlackAlertManager() {
  const [webhookUrl, setWebhookUrl] = useState('')
  const [eventType, setEventType] = useState<'deployment_failed' | 'service_unhealthy' | 'deployment_success'>('deployment_failed')
  const [appName, setAppName] = useState('preflight-web')
  const [customMessage, setCustomMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleTestAlert = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setResult(null)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.aetherhost.com.ng'
      const response = await fetch(`${apiUrl}/v1/notifications/slack/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookUrl: webhookUrl.trim() || undefined,
          appName: appName.trim() || 'preflight-web',
          eventType,
          message: customMessage.trim() || undefined,
        }),
      })

      const data = await response.json()

      if (response.ok && data.delivered) {
        setResult({
          success: true,
          message: `Alert dispatched successfully to Slack! Delivered event: ${eventType} for ${data.payload?.appName || appName}.`,
        })
      } else if (response.ok && !data.delivered) {
        setResult({
          success: false,
          message: data.error || 'Slack webhook URL not provided or not configured on the server. Please enter a valid Slack incoming webhook.',
        })
      } else {
        setResult({
          success: false,
          message: data.message || `Failed to dispatch Slack alert (HTTP ${response.status})`,
        })
      }
    } catch (err: any) {
      setResult({
        success: false,
        message: err.message || 'Network error while attempting to dispatch alert.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-500">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Slack Deployment & Incident Reporting</h2>
            <p className="text-sm text-muted-foreground">
              Automated reporting for failed deployments, unhealthy services, and release verification.
            </p>
          </div>
        </div>

        <form onSubmit={handleTestAlert} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Slack Incoming Webhook URL (Optional if set on VPS)
            </label>
            <input
              type="url"
              placeholder="https://hooks.slack.com/services/T00/B00/XXXX"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Leave blank to use the system-level <code className="text-primary">SLACK_WEBHOOK_URL</code> configured on AetherHost.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Event Type
              </label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value as any)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="deployment_failed">🚨 Failed Deployment (Release Check Failure)</option>
                <option value="service_unhealthy">⚠️ Service Unhealthy (Health Check Probe Error)</option>
                <option value="deployment_success">🚀 Deployment Live & Verified</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Target Application
              </label>
              <input
                type="text"
                placeholder="preflight-web or flowmeet"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Custom Failure Note / Probe Diagnostic (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Health probe check failed on endpoint /health (HTTP 502 Bad Gateway)"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isLoading ? (
                <>Sending...</>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Send Demonstrable Alert to Slack
                </>
              )}
            </button>
          </div>
        </form>

        {result && (
          <div
            className={`mt-4 p-4 rounded-lg flex items-start gap-3 border ${
              result.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}
          >
            {result.success ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            )}
            <div className="text-sm">
              <p className="font-semibold">{result.success ? 'Success' : 'Notice'}</p>
              <p className="mt-0.5 opacity-90">{result.message}</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-primary" /> Active Notification Triggers
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
            <div className="font-semibold text-rose-400 mb-1">🚨 Failed Deployments</div>
            <p className="text-muted-foreground">
              Fires when build workers encounter Docker compile errors, failed migrations, or container startup crash loops.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
            <div className="font-semibold text-amber-400 mb-1">⚠️ Unhealthy Services</div>
            <p className="text-muted-foreground">
              Fires when runtime health endpoints (<code className="text-foreground">/health</code>) fail readiness or return non-2xx status.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
            <div className="font-semibold text-emerald-400 mb-1">🚀 Release Verification</div>
            <p className="text-muted-foreground">
              Dispatches green confirmation with public URL and SSL status when a new service version is successfully promoted.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
