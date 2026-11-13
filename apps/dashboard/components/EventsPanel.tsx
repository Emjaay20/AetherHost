'use client'

import { useState } from 'react'
import { Terminal, Database, Server, Cpu, Sparkles, Activity, ChevronDown, ChevronRight } from 'lucide-react'

// Helper to pick an icon and color based on event type
function getEventMeta(eventName: string) {
  switch (eventName) {
    case 'ApplicationProvisioningRequested':
      return { icon: Server, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' }
    case 'ApplicationProvisioned':
      return { icon: Database, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' }
    case 'AIRequestCompleted':
      return { icon: Sparkles, color: 'text-foreground', bg: 'bg-muted', border: 'border-border' }
    case 'TenantProvisioned':
      return { icon: Cpu, color: 'text-foreground', bg: 'bg-muted', border: 'border-border' }
    default:
      return { icon: Activity, color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' }
  }
}

export interface DomainEventItem {
  id?: string
  eventName: string
  createdAt: string | Date
  applicationId?: string | null
  payload?: Record<string, unknown> | null
}

export default function EventsPanel({ events }: { events: DomainEventItem[] }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="mt-8 rounded-lg border border-border bg-card overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground border border-border">
            <Terminal className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">Domain Events Log</h2>
          <span className="px-2 py-0.5 rounded-md bg-muted text-xs font-mono text-muted-foreground border border-border">
            {events.length} Events
          </span>
        </div>
        <div className="text-muted-foreground">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border bg-card max-h-[500px] overflow-y-auto">
          {events.length === 0 ? (
            <div className="p-8 flex flex-col items-center justify-center text-muted-foreground">
              <Activity className="w-6 h-6 mb-2 opacity-30" />
              <p className="text-xs font-medium">No system events recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {events.map((event: DomainEventItem, i: number) => {
                const meta = getEventMeta(event.eventName)
                const Icon = meta.icon
                
                return (
                  <div key={i} className="p-4 flex flex-col hover:bg-muted/40 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      {/* Header */}
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center border ${meta.bg} ${meta.border} ${meta.color} shrink-0`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-mono text-xs font-bold text-foreground">
                            {event.eventName}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              {new Date(event.createdAt).toLocaleString()}
                            </span>
                            {event.applicationId && (
                              <span className="text-xs font-mono px-1.5 py-0.5 rounded-md bg-muted border border-border text-muted-foreground">
                                app: {event.applicationId.split('_').pop()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Payload Data */}
                    {event.payload && Object.keys(event.payload).length > 0 && (
                      <div className="mt-3 ml-11">
                        <pre className="text-xs font-mono leading-relaxed text-muted-foreground bg-muted/30 border border-border p-3 rounded-md overflow-x-auto">
                          <code>
                            {JSON.stringify(event.payload, null, 2)}
                          </code>
                        </pre>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
