/**
 * Official Chili Piper Client-Side SDK Integration
 * Loads https://js.chilipiper.com and provides type-safe bindings
 * for Form Concierge and Instant Booker.
 */

declare global {
  interface Window {
    ChiliPiper?: {
      submit: (
        domain: string,
        router: string,
        options?: {
          title?: string;
          lead?: Record<string, any>;
          map?: boolean;
          onSuccess?: (data: any) => void;
          onError?: (error: any) => void;
          onClose?: () => void;
          closeOnOutside?: boolean;
        }
      ) => void;
    };
  }
}

let scriptLoadPromise: Promise<void> | null = null;

export function loadChiliPiperSDK(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.ChiliPiper) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="chilipiper.js"]');
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.chilipiper.com/marketing/dist/modern/chilipiper.js';
    script.type = 'text/javascript';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Chili Piper JavaScript SDK'));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export interface ChiliPiperLeadPayload {
  Email: string;
  FirstName?: string;
  LastName?: string;
  Company?: string;
  Region?: 'EMEA' | 'AMER' | 'APAC';
  Estimated_Workloads__c?: number;
  Workspace_ID__c?: string;
  Escalation_Reason__c?: string;
  [key: string]: any;
}

/**
 * Triggers Chili Piper Form Concierge.
 * Qualifies lead and surfaces the instant calendar booking modal.
 */
export async function submitChiliPiperConcierge(
  subdomain: string = 'aetherhost',
  routerName: string = 'inbound-emea-router',
  lead: ChiliPiperLeadPayload,
  callbacks?: {
    onSuccess?: (data: any) => void;
    onError?: (err: any) => void;
    onClose?: () => void;
  }
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    await loadChiliPiperSDK();
    if (window.ChiliPiper && typeof window.ChiliPiper.submit === 'function') {
      window.ChiliPiper.submit(subdomain, routerName, {
        title: 'Schedule Your AetherHost Enterprise Onboarding',
        lead,
        closeOnOutside: true,
        onSuccess: (data) => {
          console.log('[Chili Piper] Meeting scheduled successfully:', data);
          callbacks?.onSuccess?.(data);
        },
        onError: (err) => {
          console.warn('[Chili Piper] Scheduling fallback triggered:', err);
          callbacks?.onError?.(err);
        },
        onClose: () => {
          callbacks?.onClose?.();
        },
      });
      return true;
    }
  } catch (err) {
    console.warn('[Chili Piper SDK] Falling back to direct booking:', err);
  }

  // Graceful fallback if script is blocked by adblocker / CSP
  callbacks?.onError?.(new Error('Chili Piper SDK unavailable'));
  return false;
}

/**
 * Generates an Instant Booker direct URL for 1:1 technical escalation with the dedicated CSM.
 */
export function getInstantBookerUrl(params: {
  csmSlug?: string;
  email?: string;
  tenantId?: string;
  reason?: string;
}): string {
  const csm = params.csmSlug || 'csm-emea';
  const query = new URLSearchParams();
  if (params.email) query.set('email', params.email);
  if (params.tenantId) query.set('tenant_id', params.tenantId);
  if (params.reason) query.set('reason', params.reason);

  return `https://aetherhost.chilipiper.com/me/${csm}?${query.toString()}`;
}
