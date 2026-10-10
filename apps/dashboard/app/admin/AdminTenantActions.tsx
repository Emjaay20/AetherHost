'use client';

import {
  MoreHorizontal,
  ShieldAlert,
  ShieldCheck,
  PlaySquare,
  Key,
  CreditCard,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  impersonateTenant,
  replayTenantWebhooks,
  refundTenant,
  suspendTenant,
  unsuspendTenant,
} from './actions';

export function AdminTenantActions({
  tenantId,
  tenantName,
  currentStatus = 'active',
}: {
  tenantId: string;
  tenantName: string;
  currentStatus?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Dialog states
  const [modalType, setModalType] = useState<
    'refund' | 'suspend' | 'unsuspend' | null
  >(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const isSuspended = currentStatus === 'suspended';

  const handleImpersonate = () => {
    setOpen(false);
    startTransition(async () => {
      try {
        const res = await impersonateTenant(tenantId, tenantName);
        if ('error' in res) {
          setFeedback({ type: 'error', message: res.error as string });
          return;
        }
        if (res.url) {
          window.location.href = res.url;
        } else {
          router.push('/console');
        }
      } catch (err: any) {
        setFeedback({
          type: 'error',
          message: err?.message || 'Failed to impersonate',
        });
      }
    });
  };

  const handleReplay = () => {
    setOpen(false);
    startTransition(async () => {
      try {
        const res = await replayTenantWebhooks(tenantId);
        if ('error' in res) {
          setFeedback({ type: 'error', message: res.error as string });
        } else {
          setFeedback({
            type: 'success',
            message: res.message || `Replayed ${res.count} webhooks`,
          });
        }
      } catch (err: any) {
        setFeedback({
          type: 'error',
          message: err?.message || 'Replay failed',
        });
      }
    });
  };

  const handleRefundSubmit = () => {
    setModalType(null);
    startTransition(async () => {
      try {
        const amount = refundAmount ? parseFloat(refundAmount) : undefined;
        const res = await refundTenant(tenantId, amount, reason);
        if ('error' in res) {
          setFeedback({ type: 'error', message: res.error as string });
        } else {
          setFeedback({
            type: 'success',
            message:
              res.message ||
              `Refunded $${res.refundedAmountDollars.toFixed(2)} (Invoice ${res.invoiceId})`,
          });
        }
      } catch (err: any) {
        setFeedback({
          type: 'error',
          message: err?.message || 'Refund failed',
        });
      } finally {
        setRefundAmount('');
        setReason('');
      }
    });
  };

  const handleSuspendSubmit = () => {
    setModalType(null);
    startTransition(async () => {
      try {
        const res = await suspendTenant(tenantId, reason);
        if ('error' in res) {
          setFeedback({ type: 'error', message: res.error as string });
        } else {
          setFeedback({
            type: 'success',
            message: res.message || `Tenant suspended`,
          });
        }
      } catch (err: any) {
        setFeedback({
          type: 'error',
          message: err?.message || 'Suspension failed',
        });
      } finally {
        setReason('');
      }
    });
  };

  const handleUnsuspendSubmit = () => {
    setModalType(null);
    startTransition(async () => {
      try {
        const res = await unsuspendTenant(tenantId);
        if ('error' in res) {
          setFeedback({ type: 'error', message: res.error as string });
        } else {
          setFeedback({
            type: 'success',
            message: res.message || `Tenant reactivated`,
          });
        }
      } catch (err: any) {
        setFeedback({
          type: 'error',
          message: err?.message || 'Reactivation failed',
        });
      }
    });
  };

  return (
    <>
      <div className="relative inline-block text-left">
        <button
          onClick={() => setOpen(!open)}
          disabled={isPending}
          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors disabled:opacity-50"
          title="Tenant Actions"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : (
            <MoreHorizontal className="w-4 h-4" />
          )}
        </button>

        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1 w-52 bg-card/95 backdrop-blur-md border border-border/80 rounded-xl shadow-xl z-50 py-1.5 overflow-hidden text-left">
              <div className="px-3 py-1 border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Operations: {tenantName}
              </div>

              <button
                className="w-full text-left px-3 py-2 text-xs hover:bg-muted/40 flex items-center gap-2.5 transition-colors"
                onClick={handleImpersonate}
              >
                <Key className="w-3.5 h-3.5 text-amber-400" /> Impersonate
              </button>

              <button
                className="w-full text-left px-3 py-2 text-xs hover:bg-muted/40 flex items-center gap-2.5 transition-colors"
                onClick={handleReplay}
              >
                <PlaySquare className="w-3.5 h-3.5 text-blue-400" /> Replay Webhooks
              </button>

              <button
                className="w-full text-left px-3 py-2 text-xs hover:bg-muted/40 flex items-center gap-2.5 transition-colors"
                onClick={() => {
                  setOpen(false);
                  setModalType('refund');
                }}
              >
                <CreditCard className="w-3.5 h-3.5 text-emerald-400" /> Issue Refund
              </button>

              <div className="h-px bg-border/50 my-1" />

              {isSuspended ? (
                <button
                  className="w-full text-left px-3 py-2 text-xs hover:bg-green-500/10 text-green-400 flex items-center gap-2.5 transition-colors"
                  onClick={() => {
                    setOpen(false);
                    setModalType('unsuspend');
                  }}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-green-400" /> Reactivate Tenant
                </button>
              ) : (
                <button
                  className="w-full text-left px-3 py-2 text-xs hover:bg-red-500/10 text-red-400 flex items-center gap-2.5 transition-colors"
                  onClick={() => {
                    setOpen(false);
                    setModalType('suspend');
                  }}
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-red-400" /> Suspend Tenant
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Floating feedback toast */}
      {feedback && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm flex items-start gap-3 p-4 rounded-xl border border-border/80 bg-card/95 backdrop-blur-md shadow-2xl text-xs">
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className="font-semibold text-foreground">
              {feedback.type === 'success' ? 'Success' : 'Error'}
            </p>
            <p className="mt-0.5 text-muted-foreground break-words">{feedback.message}</p>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-muted-foreground hover:text-foreground p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Refund Modal */}
      {modalType === 'refund' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span>Issue Refund</span>
              </div>
              <button
                onClick={() => setModalType(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Issue a refund for <strong>{tenantName}</strong>. If no amount is specified, the latest invoice will be fully refunded.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Amount (USD, optional)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 29.00"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Reason</label>
                <input
                  type="text"
                  placeholder="Customer request / SLA credit"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setModalType(null)}
                className="px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRefundSubmit}
                disabled={isPending}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
              >
                Confirm Refund
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Modal */}
      {modalType === 'suspend' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-red-400">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span>Suspend Tenant</span>
              </div>
              <button
                onClick={() => setModalType(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Are you sure you want to suspend <strong>{tenantName}</strong> ({tenantId})? All active workloads will immediately be stopped and new provisioning blocked.
            </p>
            <div>
              <label className="text-xs text-muted-foreground">Reason (Audit log)</label>
              <input
                type="text"
                placeholder="Non-payment, Terms of Service violation..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setModalType(null)}
                className="px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSuspendSubmit}
                disabled={isPending}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors"
              >
                Suspend Tenant
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reactivate Modal */}
      {modalType === 'unsuspend' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-green-500/30 bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-green-400">
                <ShieldCheck className="w-4 h-4 text-green-400" />
                <span>Reactivate Tenant</span>
              </div>
              <button
                onClick={() => setModalType(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Reactivate <strong>{tenantName}</strong> ({tenantId})? Suspended applications will be scheduled to restart.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setModalType(null)}
                className="px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUnsuspendSubmit}
                disabled={isPending}
                className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors"
              >
                Reactivate Tenant
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
