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
    label: 'Security & Zero-Trust',
    icon: ShieldCheck,
    items: [
      { id: 'secret-vault', label: 'Envelope Encryption (AES-GCM)', badge: 'SOC 2' },
      { id: 'container-security', label: 'Immutable Container Profiles' },
      { id: 'backup-dr', label: 'Restic Backup & 14s Restore Drill', badge: 'Verified' },
      { id: 'supply-chain', label: 'CI Scans & STRIDE Threat Model' },
    ],
  },
  {
    label: 'Rust Core Platform',
    icon: Cpu,
    items: [
      { id: 'platform-arch', label: 'Subsystem Architecture', badge: '189ns' },
      { id: 'authz-engine', label: 'In-Memory RBAC/ABAC Engine' },
      { id: 'telemetry-metrics', label: 'W3C Tracing & RED Metrics' },
      { id: 'actix-integration', label: 'Actix-Web Middleware & Extractor' },
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
        <Link href="/" className="truncate text-sm font-semibold tracking-tight hover:text-white">
          AetherHost
        </Link>
        <span className="text-zinc-600">/</span>
        <span className="truncate text-sm font-medium text-zinc-400">Platform Documentation</span>
        <span className="ml-2 hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 sm:inline-block">
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
        <button
          type="button"
          aria-label="Close docs menu"
          className={`fixed inset-0 z-30 bg-black/70 backdrop-blur-sm lg:hidden ${open ? 'block' : 'hidden'}`}
          onClick={() => setOpen(false)}
        />

        {/* Sidebar Navigation */}
        <aside
          id="docs-sidebar"
          data-open={open ? 'true' : 'false'}
          className="fixed bottom-0 left-0 top-14 z-30 w-[min(20rem,88vw)] overflow-y-auto border-r border-zinc-800 bg-[#09090b] px-4 py-5 lg:sticky lg:top-14 lg:block lg:h-[calc(100vh-3.5rem)] lg:w-64 lg:shrink-0"
        >
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
              AetherHost is a developer platform and enterprise workload orchestrator built for high reliability, strict multi-tenant isolation, and sub-microsecond internal security. It enables engineering teams to deploy microservices, APIs, and background workers while enforcing strict quotas, AES-256-GCM secret envelope encryption, and in-memory authorization across every single HTTP boundary.
            </p>

            {/* Platform Highlights Grid */}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  Zero-Trust Security
                </div>
                <p className="mt-1 text-xs text-zinc-400 leading-5">
                  Envelope encrypted secrets at rest, non-root immutable containers, and Docker socket proxy isolation.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                  <Cpu className="h-4 w-4 text-cyan-400" />
                  189ns Rust Engine
                </div>
                <p className="mt-1 text-xs text-zinc-400 leading-5">
                  Sub-microsecond in-memory RBAC/ABAC authorization and W3C distributed tracing with RED metrics.
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

            {/* 3. SECURITY & ZERO-TRUST */}
            <div className="mt-16 rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-6">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                <ShieldCheck className="h-5 w-5" />
                Security & Zero-Trust Architecture
              </div>
              <p className="mt-2 text-xs sm:text-sm text-zinc-300 leading-6">
                All production systems operate under an explicit zero-trust security model. Secrets are never stored in plaintext, containers run immutably without root capabilities, and backup restores are continuously validated.
              </p>
            </div>

            <h2 id="secret-vault" className="mt-10 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Envelope Encryption: Secret Vault (AES-256-GCM)
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              Customer database credentials, API tokens, and payment keys are sealed using our <code className="text-zinc-100 font-mono">SecretVaultService</code> before touching PostgreSQL. Raw secrets never exist unencrypted on disk.
            </p>
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-300">
              <div className="text-zinc-500">// Serialized Encrypted Envelope Structure</div>
              <pre className="mt-2 text-emerald-300">{`{
  "__encrypted": true,
  "version": 1,
  "iv": "a1b2c3...<96_bit_unique_iv>",
  "authTag": "d4e5f6...<128_bit_gcm_tag>",
  "ciphertext": "8a9b0c...<aes_256_gcm_ciphertext>"
}`}</pre>
            </div>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-zinc-300 leading-6">
              <li><strong>Unique Initialization Vectors (IV)</strong>: Every encryption call generates a cryptographically random 12-byte IV preventing identical ciphertexts.</li>
              <li><strong>Tamper Detection</strong>: Any modification of the ciphertext or tag causes instant decryption rejection.</li>
              <li><strong>Key Derivation & Rotation</strong>: Primary master keys derive operational keys via <code className="font-mono text-xs text-zinc-200">scrypt</code> with versioned key identifiers.</li>
            </ul>

            <h2 id="container-security" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Immutable Containers & Docker Socket Proxy
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              Workload containers on the host execute under hardened, immutable runtime profiles:
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-xs sm:text-sm">
                <thead className="text-zinc-500 border-b border-zinc-800">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Control</th>
                    <th className="py-2 pr-4 font-medium">Implementation</th>
                    <th className="py-2 font-medium">Security Impact</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  <tr className="border-b border-zinc-800/60 font-mono text-xs">
                    <td className="py-2.5 pr-4 text-white">Root Filesystem</td>
                    <td className="py-2.5 pr-4 text-emerald-400">read_only: true</td>
                    <td className="py-2.5 font-sans text-zinc-400">Prevents malware persistence and unauthorized binary execution.</td>
                  </tr>
                  <tr className="border-b border-zinc-800/60 font-mono text-xs">
                    <td className="py-2.5 pr-4 text-white">Capabilities</td>
                    <td className="py-2.5 pr-4 text-emerald-400">cap_drop: [ALL]</td>
                    <td className="py-2.5 font-sans text-zinc-400">Revokes all Linux kernel capabilities (raw sockets, ptrace, root bypass).</td>
                  </tr>
                  <tr className="border-b border-zinc-800/60 font-mono text-xs">
                    <td className="py-2.5 pr-4 text-white">Privilege Escalation</td>
                    <td className="py-2.5 pr-4 text-emerald-400">no-new-privileges: true</td>
                    <td className="py-2.5 font-sans text-zinc-400">Disallows SUID bit exploitation within guest containers.</td>
                  </tr>
                  <tr className="border-b border-zinc-800/60 font-mono text-xs">
                    <td className="py-2.5 pr-4 text-white">Daemon Isolation</td>
                    <td className="py-2.5 pr-4 text-emerald-400">docker-socket-proxy</td>
                    <td className="py-2.5 font-sans text-zinc-400">Blocks API from mounting raw host volumes or modifying host networking.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h2 id="backup-dr" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Restic Deduplicated Backups & 14-Second Restore Drills
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              Legacy tarball snapshots caused multi-hour backups and 4-hour timeouts. The platform was overhauled to use content-defined chunking (CDC) deduplication and automated restore verification:
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-xs font-semibold text-emerald-400">Uncompressed CDC Pipeline</p>
                <p className="mt-1 text-xs text-zinc-300 leading-5">
                  Pre-syncs uncompressed PostgreSQL dumps, cutting snapshot runtime from <strong>4 hours to 5m 55s</strong> while achieving a 4.1x deduplication ratio.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-xs font-semibold text-emerald-400">14-Second Automated Restore Drill</p>
                <p className="mt-1 text-xs text-zinc-300 leading-5">
                  Nightly systemd timers restore the latest backup into an isolated scratch container, running schema parity assertions in <strong>14.2 seconds</strong> with zero production downtime.
                </p>
              </div>
            </div>

            <h2 id="supply-chain" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Automated Supply Chain Security & Threat Modeling
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              Every pull request passes through an automated security triage pipeline before merge:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-300 leading-6">
              <li><strong>Gitleaks (Zero Committed Secrets)</strong>: Full git history scanning for leaked tokens, Stripe credentials, and private keys.</li>
              <li><strong>Trivy Container & Dependency Audit</strong>: Rejects pull requests introducing HIGH or CRITICAL CVE vulnerabilities.</li>
              <li><strong>Checkov Static IaC Analysis</strong>: Validates Terraform configurations against CIS security benchmarks.</li>
              <li><strong>cargo-deny Supply Chain Policy</strong>: Audits Rust crates for unmaintained dependencies, unsound I/O safety issues, and license compliance (MIT, Apache-2.0, MPL-2.0).</li>
            </ul>

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

            <h2 id="platform-arch" className="mt-10 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Empirical Micro-Benchmark Latency Budgets
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              Performance claims are backed by rigorous Criterion micro-benchmarks profiled under high concurrency:
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-xs sm:text-sm">
                <thead className="text-zinc-500 border-b border-zinc-800">
                  <tr>
                    <th className="py-2.5 pr-4 font-medium">Operation</th>
                    <th className="py-2.5 pr-4 font-medium">Measured Latency (p50)</th>
                    <th className="py-2.5 pr-4 font-medium">Throughput (single core)</th>
                    <th className="py-2.5 font-medium">Budget Margin</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300 font-mono text-xs">
                  <tr className="border-b border-zinc-800/60">
                    <td className="py-2.5 pr-4 font-sans text-white">Cached Policy Evaluation</td>
                    <td className="py-2.5 pr-4 text-emerald-400 font-bold">189.28 ns</td>
                    <td className="py-2.5 pr-4 text-zinc-400">~5,280,000 ops/sec</td>
                    <td className="py-2.5 text-emerald-400">5.3x faster than budget (&lt; 1µs)</td>
                  </tr>
                  <tr className="border-b border-zinc-800/60">
                    <td className="py-2.5 pr-4 font-sans text-white">Uncached Policy Evaluation</td>
                    <td className="py-2.5 pr-4 text-cyan-400 font-bold">1.168 µs</td>
                    <td className="py-2.5 pr-4 text-zinc-400">~856,000 ops/sec</td>
                    <td className="py-2.5 text-cyan-400">8.5x faster than budget (&lt; 10µs)</td>
                  </tr>
                  <tr className="border-b border-zinc-800/60">
                    <td className="py-2.5 pr-4 font-sans text-white">In-Flight Gauge Inc / Dec</td>
                    <td className="py-2.5 pr-4 text-emerald-400 font-bold">3.93 ns</td>
                    <td className="py-2.5 pr-4 text-zinc-400">~254,000,000 ops/sec</td>
                    <td className="py-2.5 text-emerald-400">Lock-free atomic ops</td>
                  </tr>
                  <tr className="border-b border-zinc-800/60">
                    <td className="py-2.5 pr-4 font-sans text-white">Full RED Telemetry Recording</td>
                    <td className="py-2.5 pr-4 text-zinc-200 font-bold">245.59 ns</td>
                    <td className="py-2.5 pr-4 text-zinc-400">~4,070,000 ops/sec</td>
                    <td className="py-2.5 text-emerald-400">4.0x faster than budget</td>
                  </tr>
                  <tr className="border-b border-zinc-800/60">
                    <td className="py-2.5 pr-4 font-sans text-white">4-Thread Concurrent Contention</td>
                    <td className="py-2.5 pr-4 text-purple-400 font-bold">209.63 ns</td>
                    <td className="py-2.5 pr-4 text-zinc-400">~4,770,000 ops/sec</td>
                    <td className="py-2.5 text-purple-400">Zero lock convoying</td>
                  </tr>
                </tbody>
              </table>
            </div>

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
              <li><strong>Audit Recording</strong>: Every decision emits a structured nanosecond-precision audit record attributing decision, policy name, and reason.</li>
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
              Exposes standard Prometheus RED metrics at <code className="text-zinc-100 font-mono">/_aether/metrics</code>:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-400 font-mono">
              <li>http_requests_total{'{'}service, method, status{'}'}</li>
              <li>http_requests_in_flight{'{'}service{'}'}</li>
              <li>http_request_duration_seconds_bucket{'{'}service, le{'}'}</li>
            </ul>

            <h2 id="actix-integration" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Actix-Web Middleware & Ergonomic Extractor
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-300">
              Feature teams integrate authentication and authorization in two lines using our <code className="text-zinc-100 font-mono">AuthzMiddleware</code> and <code className="text-zinc-100 font-mono">AuthenticatedSubject</code> extractor:
            </p>
            <CodeBlock
              id="actix-code"
              language="rust"
              text={`use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use aether_authz::{actix::{AuthzMiddleware, AuthenticatedSubject}, AuthzEngine};
use aether_telemetry::actix::ActixTelemetryMiddleware;

async fn get_pcba_quote(subject: AuthenticatedSubject, path: web::Path<String>) -> impl Responder {
    // subject.tenant_id and subject.subject_id guaranteed valid and authorized
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
              The platform maintains a dual-track deployment architecture: production workloads run on hardened VPS infrastructure, while Kubernetes Helm charts and GitOps manifests are continuously tested in automated CI:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-300 leading-6">
              <li><strong>Helm Packaging (<code className="font-mono text-zinc-200">deploy/helm/aether-platform</code>)</strong>: Includes deployments, services, ingress routing, auto-scaling, and Prometheus ServiceMonitors.</li>
              <li><strong>Kubeconform Validation</strong>: All rendered manifests are strictly validated against Kubernetes 1.31 schemas.</li>
              <li><strong>KinD In-Cluster Testing</strong>: Every CI run provisions an ephemeral KinD cluster, builds the platform image, performs a Helm rollout, and smoke-tests live health and Prometheus metrics endpoints.</li>
            </ul>

            <h2 id="decisions" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold text-white">
              Key Architectural Decisions (ADRs)
            </h2>
            <div className="mt-4 max-w-3xl space-y-5 text-sm leading-6 text-zinc-300">
              <section className="rounded-lg border border-zinc-800/80 bg-zinc-900/20 p-4">
                <p className="font-semibold text-zinc-100">ADR 021: Unified In-Memory Authz and Telemetry in Rust Monolith</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Rejected external network PDPs (like remote OPA) to avoid 5-15ms latency hops. Built in-memory <code className="text-zinc-300 font-mono">RwLock</code> cache with atomic metrics, achieving ~189ns evaluation with zero unsafe code.
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
