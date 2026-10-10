'use client';

import { Settings2, Power, Zap, UserX } from 'lucide-react';
import { useState } from 'react';
import type { Overview } from './types';

export function GlobalConfigPanel({ system }: { system: Overview['system'] }) {
  const [maintenance, setMaintenance] = useState(false);
  const [disableSignups, setDisableSignups] = useState(false);
  const [highPerformanceMode, setHighPerformanceMode] = useState(true);

  return (
    <div className="space-y-6 mb-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border/50 bg-card/80 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">Maintenance Mode</p>
              <p className="text-sm font-medium">Bypass limits & offline screen</p>
            </div>
            <button 
              onClick={() => setMaintenance(!maintenance)}
              className={`p-2 rounded-lg transition-colors ${maintenance ? 'bg-amber-500/20 text-amber-500' : 'bg-muted text-muted-foreground'}`}
            >
              <Power className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">When active, the dashboard will show a maintenance screen to all non-admin users.</p>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card/80 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">Disable Signups</p>
              <p className="text-sm font-medium">Pause Clerk webhook ingress</p>
            </div>
            <button 
              onClick={() => setDisableSignups(!disableSignups)}
              className={`p-2 rounded-lg transition-colors ${disableSignups ? 'bg-red-500/20 text-red-500' : 'bg-muted text-muted-foreground'}`}
            >
              <UserX className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Drops new user creation webhooks immediately. Current users are unaffected.</p>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card/80 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">AI Pipeline</p>
              <p className="text-sm font-medium">High Performance Mode</p>
            </div>
            <button 
              onClick={() => setHighPerformanceMode(!highPerformanceMode)}
              className={`p-2 rounded-lg transition-colors ${highPerformanceMode ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground'}`}
            >
              <Zap className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Routes traffic to premium low-latency AI models for all users temporarily.</p>
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-3">Cluster Capacity</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border/50 p-4 bg-card/40">
            <p className="text-xs text-muted-foreground mb-1">Node CPU</p>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-lg font-semibold">{system.cpuUsagePct}%</span>
              <span className="text-xs text-muted-foreground mb-1">load</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={`h-full ${system.cpuUsagePct > 80 ? 'bg-red-500' : system.cpuUsagePct > 50 ? 'bg-amber-500' : 'bg-green-500'} w-[${system.cpuUsagePct}%]`} style={{ width: `${system.cpuUsagePct}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-border/50 p-4 bg-card/40">
            <p className="text-xs text-muted-foreground mb-1">Memory (Global)</p>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-lg font-semibold">{system.usedMemGb}</span>
              <span className="text-xs text-muted-foreground mb-1">/ {system.totalMemGb} GB</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-blue-500/80" style={{ width: `${(system.usedMemGb / system.totalMemGb) * 100}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-border/50 p-4 bg-card/40">
            <p className="text-xs text-muted-foreground mb-1">Network Out</p>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-lg font-semibold">{system.networkOutMbps}</span>
              <span className="text-xs text-muted-foreground mb-1">Mbps</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary/80" style={{ width: `${Math.min((system.networkOutMbps / 1000) * 100, 100)}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
