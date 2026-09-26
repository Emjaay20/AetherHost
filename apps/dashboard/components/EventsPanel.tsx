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
      return { icon: Sparkles, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' }
    case 'TenantProvisioned':
      return { icon: Cpu, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20' }
    default:
      return { icon: Activity, color: 'text-gray-500', bg: 'bg-gray-500/10', border: 'border-gray-500/20' }
  }
}

export default function EventsPanel({ events }: { events: any[] }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="mt-8 rounded-2xl border border-border/50 bg-card overflow-hidden shadow-sm">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors duration-200"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground border border-border/50">
            <Terminal className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">Domain Events Log</h2>
          <span className="px-2 py-0.5 rounded-full bg-muted/50 text-[10px] font-medium text-muted-foreground border border-border/50">
            {events.length} Events
          </span>
        </div>
        <div className="text-muted-foreground">
          {isOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border/50 bg-background/30 backdrop-blur-sm max-h-[500px] overflow-y-auto">
          {events.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-muted-foreground">
              <Activity className="w-8 h-8 mb-3 opacity-20" />
              <p className="text-sm font-medium">No system events recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {events.map((event: any, i: number) => {
                const meta = getEventMeta(event.eventName)
                const Icon = meta.icon
                
                return (
                  <div key={i} className="p-4 flex flex-col hover:bg-muted/50 transition-colors duration-200">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      {/* Header */}
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${meta.bg} ${meta.border} ${meta.color} shrink-0`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-mono text-xs font-bold text-foreground">
                            {event.eventName}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                              {new Date(event.createdAt).toLocaleString()}
                            </span>
                            {event.applicationId && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-muted border border-border/50 text-muted-foreground">
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
                        <div className="relative group">
                          <pre className="text-[10px] font-mono leading-relaxed text-muted-foreground bg-[#0a0a0a] border border-border/40 p-3 rounded-lg overflow-x-auto shadow-inner scrollbar-thin scrollbar-thumb-white/10">
                            <code className="text-zinc-300">
                              {JSON.stringify(event.payload, null, 2)}
                            </code>
                          </pre>
                        </div>
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
