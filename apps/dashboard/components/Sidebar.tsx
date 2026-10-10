import { LayoutGrid, Settings, Server, Shield } from 'lucide-react'
import Link from 'next/link'

export default function Sidebar({ usage, limit, activePath }: { usage: number, limit: number, activePath: string }) {
  const percentUsed = Math.min((usage / limit) * 100, 100)

  return (
    <aside className="w-64 border-r border-border/40 bg-background/50 backdrop-blur-xl flex-shrink-0 flex flex-col min-h-screen">
      <div className="h-16 flex items-center px-6 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary to-blue-400 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.3)]">
            <Server className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold tracking-wide">AetherHost</span>
        </div>
      </div>
      <nav className="p-4 space-y-1.5 flex-1">
        <Link 
          href="/console" 
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${activePath === '/console' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
        >
          <LayoutGrid className="w-4 h-4" /> Applications
        </Link>
        <Link 
          href="/settings" 
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${activePath === '/settings' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
        >
          <Settings className="w-4 h-4" /> Settings
        </Link>
        <Link 
          href="/admin" 
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${activePath === '/admin' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
        >
          <Shield className="w-4 h-4" /> Admin Console
        </Link>
      </nav>
      
      {/* Quota Mini-card */}
      <div className="p-4 mt-auto">
        <div className="p-4 rounded-xl bg-card border border-border/50 shadow-inner relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Plan Usage</h4>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">Starter</span>
          </div>
          <div className="flex items-end gap-1 mb-2">
            <span className="text-2xl font-bold">{usage}</span>
            <span className="text-sm text-muted-foreground mb-1">/ {limit} apps</span>
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${percentUsed}%` }}
            />
          </div>
        </div>
      </div>
    </aside>
  )
}
