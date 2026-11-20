'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  Bot,
  Check,
  ChevronRight,
  Copy,
  Cpu,
  HardDrive,
  Layers,
  Lock,
  Menu,
  Search,
  Server,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react'

type DocLink = { id: string; label: string; badge?: string }

type NavGroup = {
  label: string
  icon: typeof Terminal
  items: DocLink[]
}

const NAV: NavGroup[] = [
  {
    label: 'Getting started',
    icon: Terminal,
    items: [
      { id: 'overview', label: 'What is AetherHost?' },
      { id: 'cli', label: 'Install the CLI' },
      { id: 'commands', label: 'CLI Commands' },
    ],
  },
  {
    label: 'Security & operations',
    icon: ShieldCheck,
    items: [
      { id: 'security-posture', label: 'Security control status', badge: 'Updated' },
      { id: 'secure-access', label: 'Identity & tenant boundaries' },
      { id: 'secret-vault', label: 'Secret encryption & rotation' },
      { id: 'container-security', label: 'Immutable Container Profiles' },
      { id: 'backup-dr', label: 'Backups & database recovery' },
      { id: 'supply-chain', label: 'Verified releases & CI guardrails' },
      { id: 'data-governance', label: 'Data governance & retention' },
      { id: 'fleet-security', label: 'Fleet vulnerability management' },
      { id: 'incident-response', label: 'Incident response & evidence' },
      { id: 'aws-security', label: 'AWS security environment' },
    ],
  },
  {
    label: 'Rust Core Platform',
    icon: Cpu,
    items: [
      { id: 'platform-arch', label: 'Subsystem Architecture' },
      { id: 'authz-engine', label: 'In-Memory RBAC/ABAC Engine' },
      { id: 'telemetry-metrics', label: 'W3C Tracing & RED Metrics' },
      { id: 'actix-integration', label: 'Actix-Web Library Middleware' },
    ],
  },
  {
    label: 'AI Agents & MCP',
    icon: Bot,
    items: [
      { id: 'mcp-server', label: 'Model Context Protocol (MCP)' },
      { id: 'agent-tools', label: 'Agent Tools: Policy & Manifests' },
      { id: 'agent-config', label: 'Claude Code & Cursor Setup' },
    ],
  },
  {
    label: 'Infrastructure & Ops',
    icon: Server,
    items: [
      { id: 'edge-proxy', label: 'Edge Proxy & Realtime Log Daemon' },
      { id: 'kubernetes-kind', label: 'Kubernetes KinD & Helm CI' },
      { id: 'ci-timings', label: 'Measured CI Pipeline Timings' },
      { id: 'decisions', label: 'Architecture Decisions (ADRs)' },
      { id: 'billing', label: 'Quotas & Billing Mechanics' },
    ],
  },
  {
    label: 'Mobile & Console',
    icon: Layers,
    items: [{ id: 'mobile-preview', label: 'Mobile Preview & Workflows' }],
  },
]

const TOC: DocLink[] = NAV.flatMap((group) => group.items)

const COMMANDS = [
  ['aether status', 'Verify control plane reachability, latency, and auth token.'],
  ['aether list', 'List all tenant applications, runtimes, and health statuses.'],
  ['aether create <name> --runtime <type>', 'Provision a new application and trigger build pipeline.'],
  ['aether logs <app-id> [-f]', 'Stream live build and runtime logs via WebSocket.'],
  ['aether doctor', 'Check local Rust toolchain, Docker, Redis, and KinD Kubernetes readiness.'],
  ['aether mcp', 'Start stdio JSON-RPC 2.0 Model Context Protocol server for AI agents.'],
  ['aether ai <app-id> "<prompt>"', 'Dispatch prompt to AI architect to mutate code and redeploy.'],
]

function CodeBlock({
  id,
  text,
  language = 'bash',
  copied,
  onCopy,
}: {
  id: string
  text: string
  language?: string
  copied: string | null
  onCopy: (text: string, id: string) => void
}) {
  return (
    <div className="relative my-4 group">
      <div className="flex items-center justify-between rounded-t-md border-x border-t border-zinc-800 bg-zinc-900/80 px-3.5 py-1.5 text-[11px] font-mono text-zinc-400">
        <span>{language}</span>
        <button
          type="button"
          onClick={() => onCopy(text, id)}
          className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition-colors"
        >
          {copied === id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied === id ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-b-md border border-zinc-800 bg-zinc-950 px-4 py-3 text-[13px] leading-6 text-zinc-200 font-mono">
        <code>{text}</code>
      </pre>
    </div>
  )
}

export default function DocsClient() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('overview')
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    const fromHash = window.location.hash.replace('#', '')
    if (TOC.some((item) => item.id === fromHash)) setActive(fromHash)
  }, [])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopied(id)
    window.setTimeout(() => setCopied(null), 1600)
  }

  function jump(id: string) {
    setActive(id)
    setOpen(false)
    history.replaceState(null, '', `#${id}`)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const filteredNav = useMemo(() => {
    if (!search.trim()) return NAV
    const q = search.toLowerCase()
    return NAV.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)),
    })).filter((group) => group.items.length > 0)
  }, [search])

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 selection:bg-zinc-800 selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-zinc-800 bg-[#09090b]/95 px-4 backdrop-blur lg:px-6">
        <button
          type="button"
          className="rounded-md p-2 text-zinc-300 hover:bg-zinc-800 lg:hidden"
          aria-label={open ? 'Close docs menu' : 'Open docs menu'}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <Link href="/" className="shrink-0 text-sm font-semibold tracking-tight hover:text-white">
          AetherHost
        </Link>
        <span className="text-zinc-600">/</span>
        <span className="truncate text-sm font-medium text-zinc-400">
          <span className="sm:hidden">Docs</span>
          <span className="hidden sm:inline">Platform Documentation</span>
        </span>
        <span className="ml-2 hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 md:inline-block">
          v2.0 Architecture
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/console"
            className="rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-white transition-colors"
          >
            Console
          </Link>
          <a
            href="https://github.com/Emjaay20/AetherHost"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white sm:inline-flex items-center gap-1 transition-colors"
          >
            GitHub
          </a>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl">
        {/* Mobile Backdrop */}
        <div
          role="presentation"
          aria-hidden={!open}
          className={`fixed inset-0 z-40 bg-black/75 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${
            open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setOpen(false)}
        />

        {/* Sidebar Navigation */}
        <aside
          id="docs-sidebar"
          data-open={open ? 'true' : 'false'}
          className={`docs-sidebar fixed inset-y-0 left-0 z-50 w-[min(20rem,85vw)] overscroll-contain overflow-y-auto border-r border-zinc-800 bg-[#09090b] px-4 py-5 shadow-2xl transition-transform duration-200 ease-in-out lg:sticky lg:top-14 lg:z-0 lg:block lg:h-[calc(100vh-3.5rem)] lg:w-64 lg:shrink-0 lg:transform-none lg:shadow-none ${
            open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          {/* Mobile Drawer Header */}
          <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3 lg:hidden">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white">Documentation</span>
              <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                v2.0
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Quick Search */}
          <div className="relative mb-5">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search topics..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
            />
          </div>

          {filteredNav.map((group) => {
            const Icon = group.icon
            return (
              <div key={group.label} className="mb-6">
                <div className="mb-2 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  <Icon className="h-3.5 w-3.5 text-zinc-500" />
                  <span>{group.label}</span>
                </div>
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => jump(item.id)}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                          active === item.id
                            ? 'bg-zinc-800 font-medium text-white'
                            : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                        {item.badge && (
                          <span
                            className={`ml-1.5 rounded px-1.5 py-0.2 text-[10px] font-mono ${
                              item.badge === 'SOC 2' || item.badge === 'Verified'
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </aside>

        {/* Main Content Area */}
        <div className="flex min-w-0 flex-1">
          <article className="min-w-0 flex-1 px-4 py-8 sm:px-8 sm:py-10 lg:px-12">
            {/* 1. OVERVIEW */}
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Production Architecture 2.0
            </div>
            <h1 id="overview" className="mt-2 scroll-mt-24 text-3xl sm:text-4xl font-bold tracking-tight text-white">
              What is AetherHost?
            </h1>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              AetherHost is a multi-tenant developer platform for deploying applications, APIs, and background workers. Its security architecture combines authenticated service access, tenant authorization, application secret encryption, hardened containers, and verified image releases. This guide distinguishes implemented controls from deployment evidence still to be collected.
            </p>

            {/* Platform Highlights Grid */}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  Layered Security
                </div>
                <p className="mt-1 text-xs text-zinc-400 leading-5">
                  Application-bound AES-GCM encryption, container hardening, and scoped Docker discovery access.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                  <Cpu className="h-4 w-4 text-cyan-400" />
                  Rust Authorization
                </div>
                <p className="mt-1 text-xs text-zinc-400 leading-5">
                  In-memory RBAC/ABAC policies, server-owned service identities, W3C tracing, and RED metrics.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                  <Bot className="h-4 w-4 text-purple-400" />
                  AI Agent Enablement
                </div>
                <p className="mt-1 text-xs text-zinc-400 leading-5">
                  Native Model Context Protocol (MCP) server for Claude Code and Cursor to validate policies and manifests.
                </p>
              </div>
            </div>

            <h2 className="mt-10 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Supported Workload Runtimes
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-xs sm:text-sm">
                <thead className="text-zinc-500 border-b border-zinc-800">
                  <tr>
                    <th className="py-2.5 pr-4 font-medium">Runtime</th>
                    <th className="py-2.5 pr-4 font-medium">Deployment Flag</th>
                    <th className="py-2.5 font-medium">Underlying Stack</th>
                    <th className="py-2.5 text-right font-medium">Sandbox Mode</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  {[
                    ['Rust (Native)', 'rust', 'Axum / Actix-Web, Tokio runtime', 'cap_drop: ALL, read_only'],
                    ['Node.js', 'nodejs', 'Node.js 22 LTS, Next.js / Express', 'pnpm isolated container'],
                    ['Go', 'go', 'Go 1.24 static binary', 'distroless / minimal scratch'],
                    ['Python', 'python', 'Python 3.11, FastAPI, Uvicorn', 'gunicorn isolated worker'],
                    ['WordPress', 'wordpress', 'PHP 8.2-FPM, Nginx, MariaDB', 'dedicated cgroup volume'],
                  ].map((row) => (
                    <tr key={row[1]} className="border-b border-zinc-800/60 font-mono">
                      <td className="py-2.5 pr-4 font-sans text-white">{row[0]}</td>
                      <td className="py-2.5 pr-4 text-emerald-400">--runtime {row[1]}</td>
                      <td className="py-2.5 font-sans text-zinc-400">{row[2]}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-zinc-500">{row[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 2. CLI INSTALL & COMMANDS */}
            <h2 id="cli" className="mt-14 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Install the Developer CLI
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-zinc-300">
              The <code className="text-zinc-100 font-mono">aether</code> command-line utility is a compiled static Rust binary with zero external runtime dependencies. It connects to the control plane, inspects workloads, and runs the embedded MCP server.
            </p>
            <CodeBlock
              id="install"
              text="curl -fsSL https://console.aetherhost.app/install.sh | bash"
              copied={copied}
              onCopy={copy}
            />
            <p className="text-xs text-zinc-400">
              Or compile from source using Cargo: <code className="text-zinc-200">cargo install --git https://github.com/Emjaay20/AetherHost.git aether-cli</code>
            </p>

            <h3 className="mt-6 text-sm font-semibold text-zinc-200">Authentication & Local Configuration</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Obtain a personal CLI token starting with <code className="text-zinc-200 font-mono">aeth_</code> from the Console Settings panel, then authenticate:
            </p>
            <CodeBlock id="login" text="aether login --token <YOUR_AETH_TOKEN>" copied={copied} onCopy={copy} />

            <h2 id="commands" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              CLI Command Reference
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-xs sm:text-sm">
                <thead className="text-zinc-500 border-b border-zinc-800">
                  <tr>
                    <th className="py-2.5 pr-4 font-medium">Command</th>
                    <th className="py-2.5 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {COMMANDS.map(([cmd, desc]) => (
                    <tr key={cmd} className="border-b border-zinc-800/60 align-top">
                      <td className="py-2.5 pr-4 font-mono text-xs text-emerald-400">{cmd}</td>
                      <td className="py-2.5 text-zinc-300 text-xs sm:text-sm">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 3. SECURITY CONTROLS */}
            <div id="security-posture" className="mt-16 scroll-mt-24 rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                <ShieldCheck className="h-5 w-5" /> Security built into the deployment path
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                The verified release on 20 November 2026 passed CI, built and signed all four platform images, and deployed the API, dashboard, and agent after signature and readiness checks. Host access review, secret migration evidence, and full recovery verification are tracked separately. A control mapping is an internal assessment, not SOC 2 certification.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[['Prevent', 'Verified identities, tenant policies, encrypted secrets'], ['Detect', 'Secret scans, image scans, authorization audit events'], ['Recover', 'Isolated database restores and incident runbooks']].map(([title, description]) => (
                  <div key={title} className="rounded-lg border border-emerald-500/15 bg-zinc-950/50 p-4">
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="mt-2 text-xs leading-5 text-zinc-400">{description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">Observed release evidence · 20 November 2026</h3>
                <a href="https://github.com/Emjaay20/AetherHost/actions/runs/44712911205" target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-400 underline underline-offset-4">Inspect the CI and deployment run</a>
              </div>
              <table className="mt-4 w-full min-w-[30rem] text-left text-xs leading-6 text-zinc-300">
                <thead className="border-b border-zinc-800 text-zinc-500"><tr><th className="py-2 pr-4 font-medium">Control</th><th className="py-2 pr-4 font-medium">Observed result</th><th className="py-2 font-medium">Scope</th></tr></thead>
                <tbody>
                  {[
                    ['Application tests', '121 unit · 10 e2e passed', 'CI test harness'],
                    ['Rust platform', '36 passed · no skips', 'Workspace tests, plus doc tests'],
                    ['Kubernetes', 'Admission rejection and rollout passed', 'Isolated KinD environment'],
                    ['Image supply chain', 'Four images built, scanned, and signed', 'API, dashboard, agent, Rust platform'],
                    ['Production release', 'Signer verification and readiness passed', 'VPS API, dashboard, and agent'],
                  ].map(([control, result, scope]) => <tr key={control} className="border-b border-zinc-800/60 last:border-0"><td className="py-2 pr-4 text-white">{control}</td><td className="py-2 pr-4 text-emerald-300">{result}</td><td className="py-2 text-zinc-400">{scope}</td></tr>)}
                </tbody>
              </table>
              <p className="mt-4 text-xs leading-5 text-zinc-400">These results belong to the linked release. A CI admission test does not prove production network isolation; a healthy deploy does not prove complete recovery or effective operator least privilege. Read-only runtime evidence is collected after subsequent releases to identify the remaining work without exposing credentials or tenant data.</p>
            </div>

            <h2 id="secure-access" className="mt-10 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">Identity before authorization</h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              Private Rust services authenticate expiring bearer credentials against a server-owned identity registry. The registry supplies the actor, role, tenant, and resource ownership. Client-supplied identity headers cannot grant access. Missing credentials are rejected, unknown resources fail closed, and cross-tenant access requires an explicit platform policy.
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              This service adapter is separate from public tenant application traffic and Clerk-based console sign-in. Service tokens must stay on trusted servers; do not embed them in browser clients. The router removes service authorization and identity headers before forwarding requests.
            </p>

            <h2 id="secret-vault" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">Application-bound encryption & key rotation</h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              Tenant environment variables are encrypted using AES-256-GCM, a random 12-byte IV, and a 16-byte authentication tag. Version 2 payloads authenticate the key ID and application context as additional data. Moving ciphertext to another application fails authentication.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-300">
              <li><strong>Dedicated keys:</strong> Production startup rejects missing vault configuration. Agent credentials are not used for new encryption.</li>
              <li><strong>Rotation:</strong> A named keyring reads older key IDs while new writes use the active key. A dry-run migration validates records before explicit application.</li>
              <li><strong>Migration:</strong> Legacy plaintext and version 1 records remain readable for staged migration. Their presence must be assessed before claiming complete encrypted coverage.</li>
              <li><strong>Scope:</strong> This is application encryption. KMS integration and separate data-key wrapping are not implied.</li>
            </ul>
            <CodeBlock id="vault-migration" language="bash" text={`# Build maintenance tools locally; production images already include them.
pnpm --filter @aetherhost/api security:build
# Configure the protected keyring first; no secret values are printed.
pnpm --filter @aetherhost/api security:migrate-secrets
# After reviewing the dry-run and protecting a backup:
pnpm --filter @aetherhost/api security:migrate-secrets --apply`} copied={copied} onCopy={copy} />

            <h2 id="container-security" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">Container & Kubernetes boundaries</h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              Control-plane service profiles use read-only filesystems, capability restrictions, and no-new-privileges where supported. Traefik discovery uses a read-only Docker API proxy. The provisioning proxy retains lifecycle permissions and is a separate privileged trust boundary.
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              The Helm chart uses non-root identities, RuntimeDefault seccomp, disabled service-account token mounting, and immutable image digests by default. Network policies permit selected ingress namespaces, DNS, and the configured backend. Enforcement requires a network-policy-capable CNI. CI also checks that restricted pod admission rejects a privileged workload.
            </p>

            <h2 id="backup-dr" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">Backups that are restored and queried</h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              Restic backs up uncompressed staging data off-host. The recovery drill samples repository data, extracts the database dump, restores it into a disposable PostgreSQL container with no network, and checks required tables and tenant relationships. It emits the measured drill duration and removes the sandbox on exit.
            </p>
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-950/10 p-4 text-sm leading-6 text-zinc-300">
              Database recovery time is not full platform RTO. A complete recovery measurement must also include application startup, authenticated workflows, tenant workloads, and routing. Historical extraction timings do not establish that result.
            </div>

            <h2 id="supply-chain" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">A verified release, from commit to digest</h2>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-zinc-300">
              <li>Required language tests and security checks run before publication. Third-party Actions use immutable commit references; Checkov failures block the pipeline.</li>
              <li>CI builds images for the approved revision, scans them, generates SBOM/provenance data, and signs passing images using GitHub OIDC and Cosign.</li>
              <li>The deployment entry point resolves each image to a digest and verifies the expected signer, issuer, and source revision.</li>
              <li>Production pulls the verified API, dashboard, and agent digests. Failed readiness checks fail the release.</li>
            </ol>
            <p className="mt-3 text-sm leading-6 text-zinc-400">Branch protections, SSH restrictions, protected deployment environments, registry access, and public dashboard build configuration must be activated and verified in their respective systems.</p>

            <h2 id="data-governance" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">Data governance with explicit lifecycle rules</h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">The data inventory classifies deployment secrets, credentials, billing metadata, device identifiers, and logs. Deployment output is redacted before persistence. Log retention uses an explicitly configured age, previews eligible records, and deletes only deployment logs when applied. Audit and billing records are excluded from that cleanup.</p>
            <p className="mt-3 text-sm leading-6 text-zinc-400">Authorization decisions emit structured audit events as well as a bounded diagnostic buffer. Durable collection, access restrictions, retention, and tamper resistance require an external logging destination and operational verification.</p>

            <h2 id="fleet-security" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">Findings with owners and deadlines</h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">The fleet scanner inspects deployed image digests and writes machine-readable vulnerability reports. Temporary suppressions require an owner, rationale, tracking reference, and expiry. CI rejects unregistered or expired exceptions. Scheduled assessments reveal newly disclosed vulnerabilities after deployment.</p>
            <CodeBlock id="fleet-check" language="bash" text={`python3 scripts/security/check-policy.py
# On the production host with Trivy and Docker access:
bash scripts/security/fleet-scan.sh /var/lib/aetherhost/security/latest`} copied={copied} onCopy={copy} />

            <h2 id="incident-response" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">Detect, contain, remediate, prevent</h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">The security incident exercise covers a compromised deployment identity: preserve evidence, revoke access, isolate affected workloads, remediate the entry point, verify recovery, and assign preventive actions. Record timestamps and actual outcomes. A written exercise or unexecuted runbook must not be presented as a completed incident drill.</p>

            <h2 id="aws-security" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">An isolated AWS security environment</h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">The optional Terraform environment defines private versioned S3 storage, KMS rotation, CloudTrail management and object access events, and a GitHub OIDC role restricted to writing an evidence prefix. GuardDuty is optional. Account setup, reviewed plans, protected state, and deployed evidence remain prerequisites; this example is not a claim that production runs on AWS.</p>

            {/* 4. RUST CORE PLATFORM */}
            <div className="mt-16 rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-6">
              <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm">
                <Cpu className="h-5 w-5" />
                Rust Core Platform Subsystem
              </div>
              <p className="mt-2 text-xs sm:text-sm text-zinc-300 leading-6">
                Engineered in 6 modular Rust workspace crates: <code className="font-mono text-zinc-200">aether-core</code>, <code className="font-mono text-zinc-200">aether-authz</code>, <code className="font-mono text-zinc-200">aether-telemetry</code>, <code className="font-mono text-zinc-200">aether-router</code>, <code className="font-mono text-zinc-200">aether-logd</code>, and <code className="font-mono text-zinc-200">aether-cli</code>.
              </p>
            </div>

            <h2 id="platform-arch" className="mt-10 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">Platform components & responsibilities</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[['aether-authz', 'Policy decisions, service identity validation, and audit events'], ['aether-router', 'Authenticated forwarding, tenant authorization, and traffic metrics'], ['aether-logd', 'Tenant-scoped log ingestion and WebSocket access'], ['aether-telemetry', 'W3C trace context and Prometheus metrics']].map(([name, description]) => (
                <div key={name} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"><code className="text-sm text-cyan-300">{name}</code><p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p></div>
              ))}
            </div>
            <p className="mt-4 text-sm leading-6 text-zinc-400">Criterion benchmarks are available in the repository. Publish results with the measured commit, hardware, workload, and command; microbenchmarks do not establish production latency or throughput.</p>

            <h2 id="authz-engine" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              In-Memory Authorization Engine (<code className="font-mono text-zinc-300">aether-authz</code>)
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              The authorization subsystem resolves fine-grained permissions entirely in memory. It combines Role-Based Access Control (RBAC) with Attribute-Based Access Control (ABAC) rules:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-300 leading-6">
              <li><strong>Default-Closed Model</strong>: Any request not explicitly allowed by a matching policy is rejected with 403 Forbidden.</li>
              <li><strong>Role Inheritance</strong>: Roles cascade hierarchically (<code className="font-mono text-zinc-200">admin &rarr; developer &rarr; viewer</code>).</li>
              <li><strong>Tenant Boundary Isolation</strong>: Cross-tenant operations are denied at the boundary unless explicitly permitted by an authorized cross-tenant rule.</li>
              <li><strong>Bounded TTL Evaluation Cache (<code className="font-mono text-zinc-200">EvaluationCache</code>)</strong>: Stores cached decisions in an <code className="font-mono text-zinc-200">Arc&lt;RwLock&lt;HashMap&lt;CacheKey, CachedEntry&gt;&gt;&gt;</code> (<code className="font-mono text-zinc-200">crates/aether-authz/src/cache.rs</code>) with per-entry TTL expiration and a <code className="font-mono text-zinc-200">max_capacity</code> bound (default <code className="font-mono text-zinc-200">10,000</code>). It is not LRU: when <code className="font-mono text-zinc-200">map.len() &gt;= max_capacity</code> on insert, it calls <code className="font-mono text-zinc-200">map.clear()</code> to evict all cached entries before inserting the new entry.</li>
              <li><strong>Criterion Benchmarks</strong>: Measured at <code className="font-mono text-zinc-200">189.28 ns</code> median for cached evaluation (<code className="font-mono text-zinc-200">crates/aether-authz/benches/authz_bench.rs :: authz_policy_evaluation/cached_evaluation</code>) and <code className="font-mono text-zinc-200">1.168 µs</code> median for uncached evaluation (<code className="font-mono text-zinc-200">authz_policy_evaluation/uncached_evaluation</code>).</li>
              <li><strong>Audit Recording</strong>: Policy evaluations produce structured records identifying the actor, resource, decision, reason, and evaluation duration.</li>
            </ul>

            <h2 id="telemetry-metrics" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              W3C Distributed Tracing & Prometheus RED Metrics
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              The <code className="text-zinc-100 font-mono">aether-telemetry</code> crate standardizes observability across proxies and backend microservices:
            </p>
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-300">
              <div className="text-zinc-500">// W3C Distributed Traceparent Propagation</div>
              <div className="mt-2 text-zinc-200">traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01</div>
              <div className="mt-1 text-zinc-500">            └─ ver └─ 128-bit trace id ───────────┘ └─ 64-bit parent ┘ └─ flags</div>
            </div>
            <p className="mt-4 text-sm text-zinc-300">
              Exposes standard Prometheus RED metrics at <code className="text-zinc-100 font-mono">/_aether/metrics</code> (single-thread metric recording measured at <code className="text-zinc-100 font-mono">245.59 ns</code> median in <code className="text-zinc-100 font-mono">crates/aether-telemetry/benches/telemetry_bench.rs :: telemetry_metrics_single_thread/record_request_single_thread</code>):
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-400 font-mono">
              <li>http_requests_total{'{'}service, method, status{'}'}</li>
              <li>http_requests_in_flight{'{'}service{'}'}</li>
              <li>http_request_duration_seconds_bucket{'{'}service, le{'}'}</li>
            </ul>

            <h2 id="actix-integration" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Actix-Web Library Middleware & Extractor
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              The control-plane API (<code className="text-zinc-100 font-mono">apps/api</code>) is a NestJS service and the running Rust daemons (<code className="text-zinc-100 font-mono">aether-router</code>, <code className="text-zinc-100 font-mono">aether-logd</code>) use Axum; no production Actix-Web service runs in this repository. To support future Actix-Web services, <code className="text-zinc-100 font-mono">aether-authz</code> and <code className="text-zinc-100 font-mono">aether-telemetry</code> provide reusable library middleware (<code className="text-zinc-100 font-mono">AuthzMiddleware</code>, <code className="text-zinc-100 font-mono">ActixTelemetryMiddleware</code>) and the <code className="text-zinc-100 font-mono">AuthenticatedSubject</code> extractor, validated in integration tests (<code className="text-zinc-100 font-mono">crates/aether-authz/tests/actix_integration.rs</code>) and the standalone proving-ground example (<code className="text-zinc-100 font-mono">crates/aether-authz/examples/actix_monolith.rs</code>):
            </p>
            <CodeBlock
              id="actix-code"
              language="rust"
              text={`use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use aether_authz::{actix::{AuthzMiddleware, AuthenticatedSubject}, AuthzEngine};
use aether_telemetry::actix::ActixTelemetryMiddleware;

async fn get_pcba_quote(subject: AuthenticatedSubject, path: web::Path<String>) -> impl Responder {
    // Identity comes from the server registry, not caller-supplied role headers.
    HttpResponse::Ok().json(serde_json::json!({
        "tenant": subject.tenant_id,
        "quote_id": path.into_inner(),
        "status": "ready"
    }))
}

pub fn configure_app(cfg: &mut web::ServiceConfig, engine: AuthzEngine) {
    cfg.service(
        web::scope("/api/v1/quotes")
            .wrap(AuthzMiddleware::enforcing(engine))
            .wrap(ActixTelemetryMiddleware::new("quotation-service"))
            .route("/{quote_id}", web::get().to(get_pcba_quote))
    );
}`}
              copied={copied}
              onCopy={copy}
            />

            {/* 5. AI AGENTS & MCP */}
            <div className="mt-16 rounded-xl border border-purple-500/20 bg-purple-950/10 p-6">
              <div className="flex items-center gap-2 text-purple-400 font-semibold text-sm">
                <Bot className="h-5 w-5" />
                AI Coding Agent Integration (Model Context Protocol)
              </div>
              <p className="mt-2 text-xs sm:text-sm text-zinc-300 leading-6">
                Coding agents like Claude Code, Cursor, and Antigravity connect directly to the platform via our embedded Model Context Protocol (MCP) server, allowing them to autonomously introspect architectures and simulate permissions.
              </p>
            </div>

            <h2 id="mcp-server" className="mt-10 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Starting the MCP Server (<code className="font-mono text-zinc-300">aether mcp</code>)
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              The CLI includes an embedded JSON-RPC 2.0 stdio server implementing the official MCP specification:
            </p>
            <CodeBlock id="mcp-run" text="aether mcp" copied={copied} onCopy={copy} />

            <h2 id="agent-tools" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Exposed Agent Tools
            </h2>
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="font-mono text-xs font-semibold text-emerald-400">1. get_platform_info</p>
                <p className="mt-1 text-xs text-zinc-300 leading-5">
                  Returns platform conventions, supported runtimes, standard proxy ports, authz version, and telemetry standards.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="font-mono text-xs font-semibold text-cyan-400">2. validate_manifest</p>
                <p className="mt-1 text-xs text-zinc-300 leading-5">
                  Pre-flight validation of application deployment specs (name regex, runtime choices, valid port bindings) before creating containers.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="font-mono text-xs font-semibold text-purple-400">3. evaluate_policy</p>
                <p className="mt-1 text-xs text-zinc-300 leading-5">
                  Evaluates RBAC/ABAC permissions against the in-memory engine. Allows agents to test whether proposed cross-tenant actions or role operations will be granted or denied.
                </p>
              </div>
            </div>

            <h2 id="agent-config" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Claude Code & Cursor Configuration
            </h2>
            <p className="mt-4 text-sm text-zinc-300">
              Add the following to your Claude Code configuration (<code className="text-zinc-100 font-mono">~/.claude.json</code>) or project MCP settings:
            </p>
            <CodeBlock
              id="mcp-config"
              language="json"
              text={`{
  "mcpServers": {
    "aether": {
      "command": "cargo",
      "args": ["run", "-q", "-p", "aether-cli", "--manifest-path", "crates/Cargo.toml", "--", "mcp"]
    }
  }
}`}
              copied={copied}
              onCopy={copy}
            />

            {/* 6. INFRASTRUCTURE & OPS */}
            <h2 id="edge-proxy" className="mt-16 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Edge Reverse Proxy & WebSocket Log Daemon
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              Incoming web traffic is routed and metered through high-performance Rust daemons:
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-xs font-semibold text-zinc-200">aether-router (Edge Proxy)</p>
                <p className="mt-1 text-xs text-zinc-400 leading-5">
                  Terminates incoming requests, extracts tenant headers, evaluates tenant boundaries via <code className="text-zinc-300 font-mono">aether-authz</code>, tracks bandwidth bytes, and forwards to application backends.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-xs font-semibold text-zinc-200">aether-logd (Log Ingestion & Streamer)</p>
                <p className="mt-1 text-xs text-zinc-400 leading-5">
                  High-throughput structured log ingestion with bounded async backpressure channels and real-time WebSocket fan-out (<code className="text-zinc-300 font-mono">/ws/:app_id</code>).
                </p>
              </div>
            </div>

            <h2 id="kubernetes-kind" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Kubernetes, KinD & Helm Deployment Validation
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              The platform maintains a dual-track deployment architecture: production workloads run on hardened VPS infrastructure, while Kubernetes Helm charts and GitOps manifests have a separate validation path in CI:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-300 leading-6">
              <li><strong>Helm Packaging (<code className="font-mono text-zinc-200">deploy/helm/aether-platform</code>)</strong>: Includes deployments, services, ingress routing, auto-scaling, and Prometheus ServiceMonitors.</li>
              <li><strong>Kubeconform Validation</strong>: All rendered manifests are validated with <code className="font-mono text-zinc-200">kubeconform -strict</code> against Kubernetes 1.31 schemas.</li>
              <li><strong>KinD In-Cluster Testing</strong>: Every CI run on <code className="font-mono text-zinc-200">main</code> (and Kubernetes-touching PRs) provisions an ephemeral KinD cluster, builds the platform image, performs a Helm rollout, and smoke-tests live health and Prometheus metrics endpoints.</li>
            </ul>

            <h2 id="ci-timings" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Measured CI Pipeline Timings (<code className="font-mono text-zinc-300">ci.yml</code>)
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              Per-job median durations measured directly from GitHub Actions runs across pre-<code className="font-mono text-zinc-200">4e7a61b</code> baseline runs (<code className="font-mono text-zinc-200">#43716481729</code>, <code className="font-mono text-zinc-200">#43716554681</code>, <code className="font-mono text-zinc-200">#43718567328</code>, <code className="font-mono text-zinc-200">#43718680336</code> on <code className="font-mono text-zinc-200">2026-11-15</code>), full runs on <code className="font-mono text-zinc-200">main</code> (<code className="font-mono text-zinc-200">n=15</code>, <code className="font-mono text-zinc-200">2026-11-16</code>–<code className="font-mono text-zinc-200">2026-11-19</code>, including <code className="font-mono text-zinc-200">#44594918177</code>), and path-filtered PR runs (<code className="font-mono text-zinc-200">n=15</code>, <code className="font-mono text-zinc-200">2026-11-19</code>–<code className="font-mono text-zinc-200">2026-11-20</code>):
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[38rem] text-left text-xs sm:text-sm">
                <thead className="text-zinc-500 border-b border-zinc-800">
                  <tr>
                    <th className="py-2.5 pr-4 font-medium">Job</th>
                    <th className="py-2.5 pr-4 font-medium">Pre-4e7a61b Baseline</th>
                    <th className="py-2.5 pr-4 font-medium">Full Runs on main (n=15)</th>
                    <th className="py-2.5 font-medium">PR Runs w/ Path Filter (n=15)</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300 font-mono text-xs">
                  <tr className="border-b border-zinc-800/60">
                    <td className="py-2.5 pr-4 font-sans text-white">Change Detection &amp; Path Filter</td>
                    <td className="py-2.5 pr-4 text-zinc-500">None (added in 4e7a61b)</td>
                    <td className="py-2.5 pr-4 text-emerald-400">5.0s (4s–11s)</td>
                    <td className="py-2.5 text-cyan-400">5.0s (always runs)</td>
                  </tr>
                  <tr className="border-b border-zinc-800/60">
                    <td className="py-2.5 pr-4 font-sans text-white">API, Shared Libs &amp; Dashboard</td>
                    <td className="py-2.5 pr-4 text-zinc-400">42.0s</td>
                    <td className="py-2.5 pr-4 text-emerald-400">43.0s (34s–50s)</td>
                    <td className="py-2.5 text-cyan-400">4.0s skipped / 51.5s executed</td>
                  </tr>
                  <tr className="border-b border-zinc-800/60">
                    <td className="py-2.5 pr-4 font-sans text-white">Go Runtime Agent</td>
                    <td className="py-2.5 pr-4 text-zinc-400">14.0s</td>
                    <td className="py-2.5 pr-4 text-emerald-400">16.0s (9s–29s)</td>
                    <td className="py-2.5 text-cyan-400">4.0s skipped</td>
                  </tr>
                  <tr className="border-b border-zinc-800/60">
                    <td className="py-2.5 pr-4 font-sans text-white">Rust Crates (6 workspace crates)</td>
                    <td className="py-2.5 pr-4 text-zinc-400">22.0s (4 crates)</td>
                    <td className="py-2.5 pr-4 text-emerald-400">107.0s / 1m 47s (95s–119s)</td>
                    <td className="py-2.5 text-cyan-400">16.0s skipped (action setup)</td>
                  </tr>
                  <tr className="border-b border-zinc-800/60">
                    <td className="py-2.5 pr-4 font-sans text-white">Security &amp; Dependency Checks</td>
                    <td className="py-2.5 pr-4 text-zinc-400">12.0s</td>
                    <td className="py-2.5 pr-4 text-emerald-400">23.0s (17s–38s)</td>
                    <td className="py-2.5 text-cyan-400">21.0s (always runs)</td>
                  </tr>
                  <tr className="border-b border-zinc-800/60">
                    <td className="py-2.5 pr-4 font-sans text-white">Terraform Security (Checkov)</td>
                    <td className="py-2.5 pr-4 text-zinc-500">None (added in 4e7a61b)</td>
                    <td className="py-2.5 pr-4 text-emerald-400">18.0s (15s–226s)</td>
                    <td className="py-2.5 text-cyan-400">10.0s skipped (image pull)</td>
                  </tr>
                  <tr className="border-b border-zinc-800/60">
                    <td className="py-2.5 pr-4 font-sans text-white">Kubernetes KinD &amp; Helm Validation</td>
                    <td className="py-2.5 pr-4 text-zinc-500">None (added in 4e7a61b)</td>
                    <td className="py-2.5 pr-4 text-emerald-400">164.0s / 2m 44s (140s–174s)</td>
                    <td className="py-2.5 text-cyan-400">4.0s skipped</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h2 id="decisions" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Key Architectural Decisions (ADRs)
            </h2>
            <div className="mt-4 max-w-3xl space-y-5 text-sm leading-6 text-zinc-300">
              <section className="rounded-lg border border-zinc-800/80 bg-zinc-900/20 p-4">
                <p className="font-semibold text-zinc-100">ADR 021: Unified In-Memory Authz &amp; Telemetry Library API</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Rejected external network PDPs (like remote OPA) to avoid 5–15ms latency hops. Built an in-memory <code className="text-zinc-300 font-mono">RwLock&lt;HashMap&gt;</code> evaluation cache with per-entry TTL and simple capacity-bound full-map eviction (<code className="text-zinc-300 font-mono">map.clear()</code> at <code className="text-zinc-300 font-mono">max_capacity</code>; not LRU), reusable across the Axum daemons and the Actix-Web library middleware/extractor API.
                </p>
              </section>
              <section className="rounded-lg border border-zinc-800/80 bg-zinc-900/20 p-4">
                <p className="font-semibold text-zinc-100">ADR 006: Atomic Database Quota Reservation</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Quotas are reserved via single SQL updates (<code className="text-zinc-300 font-mono">UPDATE plans SET used = used + 1 WHERE used &lt; limit</code>). Prevents race conditions and overselling without relying on fragile distributed locks.
                </p>
              </section>
              <section className="rounded-lg border border-zinc-800/80 bg-zinc-900/20 p-4">
                <p className="font-semibold text-zinc-100">ADR 020: Spacefast Customer OAuth Foundation</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Enables tenant-level OAuth for external static site deployments. State tokens prevent CSRF, and customer access tokens are stored in the AES-256-GCM secret vault.
                </p>
              </section>
            </div>

            <h2 id="billing" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Quota Enforcement & Billing Mechanics
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              Plans restrict application counts, storage volumes, and AI requests. Quotas are checked at the database layer before container creation.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-xs sm:text-sm">
                <thead className="text-zinc-500 border-b border-zinc-800">
                  <tr>
                    <th className="py-2.5 pr-4 font-medium">Tier Plan</th>
                    <th className="py-2.5 pr-4 font-medium">Monthly Price</th>
                    <th className="py-2.5 font-medium">Allocated Quota</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  <tr className="border-b border-zinc-800/60">
                    <td className="py-2.5 pr-4 font-medium text-white">Starter</td>
                    <td className="py-2.5 pr-4 text-zinc-400">₦0</td>
                    <td className="py-2.5">1 app, 512 MB memory, 10 AI requests</td>
                  </tr>
                  <tr className="border-b border-zinc-800/60">
                    <td className="py-2.5 pr-4 font-medium text-white">Pro</td>
                    <td className="py-2.5 pr-4 text-emerald-400">₦15,000 / month</td>
                    <td className="py-2.5">5 apps, 2 GB memory, 50 AI requests</td>
                  </tr>
                  <tr className="border-b border-zinc-800/60">
                    <td className="py-2.5 pr-4 font-medium text-white">Max</td>
                    <td className="py-2.5 pr-4 text-cyan-400">₦35,000 / month</td>
                    <td className="py-2.5">20 apps, 10 GB memory, 200 AI requests</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 7. MOBILE PREVIEW */}
            <h2 id="mobile-preview" className="mt-14 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Mobile Companion App
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              AetherHost Mobile is our React Native / Expo companion app for on-call engineers. It authenticates through the same Clerk tenant pool to provide real-time logs, DNS status, and emergency redeployments from anywhere.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-xs font-semibold text-zinc-200">Android Direct APK</p>
                <p className="mt-1 text-xs text-zinc-400 leading-5">
                  Signed standalone preview APK for direct installation on Android devices.
                </p>
                <a
                  href="https://expo.dev/artifacts/eas/OR_6VUhHH-pC52QMvPbdfoIzY57u1on69QMccdfaGxc.apk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-white"
                >
                  Download APK
                  <ChevronRight className="h-3 w-3" />
                </a>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-xs font-semibold text-zinc-200">iOS Expo Go Preview</p>
                <p className="mt-1 text-xs text-zinc-400 leading-5">
                  Instant preview via Expo Go client for iOS developers.
                </p>
                <a
                  href="https://expo.dev/go"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:text-white"
                >
                  Get Expo Go
                  <ChevronRight className="h-3 w-3" />
                </a>
              </div>
            </div>

            {/* Bottom Navigation */}
            <div className="mt-16 flex flex-col gap-3 border-t border-zinc-800 pt-6 text-sm sm:flex-row sm:justify-between">
              <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
                &larr; Back to Home
              </Link>
              <Link href="/console" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
                Launch Platform Console &rarr;
              </Link>
            </div>
          </article>

          {/* Right Floating TOC */}
          <aside className="hidden w-48 shrink-0 pr-6 pt-10 xl:block">
            <div className="sticky top-20">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">On this page</p>
              <ul className="mt-3 space-y-1.5 border-l border-zinc-800 pl-3">
                {TOC.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => jump(item.id)}
                      className={`text-left text-xs leading-5 transition-colors ${
                        active === item.id ? 'font-medium text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
