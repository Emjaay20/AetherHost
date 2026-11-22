'use client';

import type { Overview } from './types';

export function GlobalConfigPanel({ system }: { system: Overview['system'] }) {
  const scopeLabel =
    system.measurementScope || 'host_kernel_proc_net_dev_tx_rate';

  return (
    <div className="space-y-6 mb-8">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Cluster Capacity (Measured Host Telemetry)
          </p>
          <span className="text-[11px] text-muted-foreground font-mono">
            scope: {scopeLabel}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border/50 p-4 bg-card/40">
            <p className="text-xs text-muted-foreground mb-1">Node CPU Utilization</p>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-lg font-semibold">{system.cpuUsagePct}%</span>
              <span className="text-xs text-muted-foreground mb-1">active ticks</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${
                  system.cpuUsagePct > 80
                    ? 'bg-red-500'
                    : system.cpuUsagePct > 50
                      ? 'bg-amber-500'
                      : 'bg-green-500'
                }`}
                style={{ width: `${system.cpuUsagePct}%` }}
              />
            </div>
          </div>
          <div className="rounded-xl border border-border/50 p-4 bg-card/40">
            <p className="text-xs text-muted-foreground mb-1">Memory (Global Host)</p>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-lg font-semibold">{system.usedMemGb}</span>
              <span className="text-xs text-muted-foreground mb-1">/ {system.totalMemGb} GB</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500/80"
                style={{
                  width: `${Math.min(
                    100,
                    (system.usedMemGb / Math.max(system.totalMemGb, 1)) * 100,
                  )}%`,
                }}
              />
            </div>
          </div>
          <div className="rounded-xl border border-border/50 p-4 bg-card/40">
            <p className="text-xs text-muted-foreground mb-1">Measured Network Egress</p>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-lg font-semibold">{system.networkOutMbps}</span>
              <span className="text-xs text-muted-foreground mb-1">Mbps</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary/80"
                style={{
                  width: `${Math.min((system.networkOutMbps / 1000) * 100, 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
