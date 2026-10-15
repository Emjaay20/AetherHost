'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  BookOpen,
  Terminal,
  Cpu,
  Layers,
  ShieldCheck,
  Scale,
  CreditCard,
  ArrowLeft,
  Copy,
  Check,
  Server,
  Zap,
  GitBranch,
  Lock,
  ExternalLink,
  Code2,
  Box,
  Activity,
  CheckCircle2,
  HelpCircle
} from 'lucide-react'

export default function DocsClient() {
  const [activeTab, setActiveTab] = useState<'overview' | 'cli' | 'architecture' | 'tradeoffs' | 'billing'>('overview')
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null)

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedSnippet(id)
    setTimeout(() => setCopiedSnippet(null), 2000)
  }

  const tabs = [
    { id: 'overview', label: 'Platform Overview', icon: BookOpen, desc: 'What is AetherHost and how it works' },
    { id: 'cli', label: 'Rust Developer CLI', icon: Terminal, desc: 'Installation, authentication, and commands' },
    { id: 'architecture', label: 'System Architecture', icon: Layers, desc: 'Distributed design across NestJS, Go & Rust' },
    { id: 'tradeoffs', label: 'Engineering Trade-offs', icon: Scale, desc: 'ADRs & rationale for technical recruiters' },
    { id: 'billing', label: 'Commercial Truth & Billing', icon: CreditCard, desc: 'Atomic SQL quota gating and Bachs engine' },
  ] as const

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Home</span>
            </Link>
            <span className="text-border">/</span>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                ⚡
              </div>
              <span className="font-semibold text-sm sm:text-base">AetherHost Documentation</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/console"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs sm:text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
            >
              Open Console
            </Link>
            <a
              href="https://github.com/Emjaay20/AetherHost"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-xs sm:text-sm font-medium transition-colors"
            >
              GitHub <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Hero Section */}
        <div className="mb-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider">
            Engineering Documentation & Architecture Manual
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">
            How AetherHost Works
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-3xl leading-relaxed">
            A deep-dive technical guide into AetherHost's multi-runtime PaaS architecture, native Rust systems toolchain, atomic quota gating, and the engineering trade-offs behind building an autonomous cloud platform.
          </p>
        </div>

        {/* Tab Navigation Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-10 pb-4 border-b border-border/40">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`text-left p-3.5 rounded-xl border transition-all duration-200 relative ${
                  isActive
                    ? 'bg-primary/10 border-primary/40 shadow-sm'
                    : 'bg-card/50 border-border/50 hover:bg-muted/50 hover:border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={`text-sm font-semibold truncate ${isActive ? 'text-foreground' : ''}`}>
                    {tab.label}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-1 hidden sm:block">
                  {tab.desc}
                </p>
                {isActive && (
                  <div className="absolute -bottom-4 left-0 right-0 h-0.5 bg-primary rounded-full hidden lg:block" />
                )}
              </button>
            )
          })}
        </div>

        {/* =========================================================================
            TAB 1: PLATFORM OVERVIEW
        ========================================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-10 animate-in fade-in duration-300">
            <section className="p-6 sm:p-8 rounded-2xl border border-border/50 bg-card shadow-sm space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold flex items-center gap-2.5">
                  <BookOpen className="w-6 h-6 text-primary" /> What is AetherHost?
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  AetherHost is a production-grade Platform-as-a-Service (PaaS) and Autonomous Cloud Control Plane designed for digital agencies and modern developers. It bridges the gap between infrastructure container orchestrators (like Render, Railway, or Fly.io) and generative software engineering studios (like Lovable or v0).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-5 rounded-xl border border-border/50 bg-background/50 space-y-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold">1</div>
                  <h3 className="font-semibold text-base">Prompt to Production</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Prompt the internal AI Architect to generate fullstack applications, commit to GitHub, run HTTP health checks, and expose them to live wildcard DNS automatically.
                  </p>
                </div>

                <div className="p-5 rounded-xl border border-border/50 bg-background/50 space-y-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 font-bold">2</div>
                  <h3 className="font-semibold text-base">Atomic Commercial Truth</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Hardware compute, memory, and LLM token usage are governed by strict, atomic database gates. Workloads cannot exceed customer plan limits, eliminating surprise hosting bills.
                  </p>
                </div>

                <div className="p-5 rounded-xl border border-border/50 bg-background/50 space-y-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold">3</div>
                  <h3 className="font-semibold text-base">Native Systems Toolchain</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Powered by a memory-safe Rust CLI, a zero-GC WebSocket log daemon (<code className="text-xs">aether-logd</code>), and an edge byte-metering reverse proxy (<code className="text-xs">aether-router</code>).
                  </p>
                </div>
              </div>
            </section>

            {/* Supported Runtimes */}
            <section className="p-6 sm:p-8 rounded-2xl border border-border/50 bg-card shadow-sm space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Cpu className="w-5 h-5 text-primary" /> Supported Deployment Runtimes
              </h3>
              <p className="text-sm text-muted-foreground">
                AetherHost supports automated container provisioning across multiple languages with out-of-the-box health checking and zero-downtime blue/green cutover:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {[
                  { name: 'Node.js & Next.js', tag: 'nodejs', desc: 'Node 18/20/22, Express, Fastify, Next.js' },
                  { name: 'Python & FastAPI', tag: 'python', desc: 'Python 3.11+, Flask, FastAPI, Uvicorn' },
                  { name: 'Go Microservices', tag: 'go', desc: 'Go 1.22+ compiled binaries, Gin, Chi' },
                  { name: 'Rust Axum / Actix', tag: 'rust', desc: 'High-throughput Rust binaries, Axum, Tokio' },
                ].map(r => (
                  <div key={r.name} className="p-4 rounded-xl border border-border/40 bg-muted/20 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{r.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">--runtime {r.tag}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{r.desc}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* =========================================================================
            TAB 2: RUST DEVELOPER CLI
        ========================================================================== */}
        {activeTab === 'cli' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Philosophy Card */}
            <section className="p-6 sm:p-8 rounded-2xl border border-border/50 bg-card shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 font-bold">
                  🦀
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold">The AetherHost Developer CLI (<code className="text-primary font-mono">aether</code>)</h2>
                  <p className="text-sm text-muted-foreground">High-performance command-line tool written in modern, memory-safe Rust 1.80+.</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Most cloud platforms write their CLI tools in Node.js or Python, which introduces runtime baggage, slow cold boots (300ms+), and version mismatches. AetherHost's CLI compiles to a single, statically linked native binary with zero runtime dependencies. It boots in under <strong>5 milliseconds</strong> and provides rich terminal tables and real-time output.
              </p>
            </section>

            {/* 1-Line Installation */}
            <section className="p-6 sm:p-8 rounded-2xl border border-border/50 bg-card shadow-sm space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Terminal className="w-5 h-5 text-primary" /> 1-Line Quick Installation
              </h3>
              <p className="text-sm text-muted-foreground">
                Run this command in macOS (Terminal) or Linux (Bash/Zsh) to install the official CLI binary:
              </p>

              <div className="relative group">
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-xs sm:text-sm text-emerald-400 overflow-x-auto flex items-center justify-between">
                  <span>curl -fsSL https://console.aetherhost.com.ng/install.sh | bash</span>
                  <button
                    onClick={() => copyToClipboard('curl -fsSL https://console.aetherhost.com.ng/install.sh | bash', 'install')}
                    className="ml-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 text-xs font-sans font-medium transition-colors shrink-0"
                  >
                    {copiedSnippet === 'install' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedSnippet === 'install' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground pt-1">
                Prefer Cargo? Install directly from GitHub: <code className="bg-muted px-2 py-0.5 rounded text-foreground">cargo install --git https://github.com/Emjaay20/AetherHost.git aether-cli</code>
              </div>
            </section>

            {/* Authentication Walkthrough */}
            <section className="p-6 sm:p-8 rounded-2xl border border-border/50 bg-card shadow-sm space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" /> Step-by-Step Authentication
              </h3>
              <ol className="space-y-4 text-sm text-muted-foreground">
                <li className="flex gap-3">
                  <span className="font-bold text-foreground">1.</span>
                  <div>
                    <strong className="text-foreground">Generate an API Key:</strong> Open{' '}
                    <Link href="/settings" className="text-primary hover:underline font-medium">Settings &rarr; API Keys</Link>{' '}
                    in your console and click <em>"Generate CLI Token"</em>. You will receive a key in the format <code className="text-xs">aeth_...</code>.
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold text-foreground">2.</span>
                  <div className="flex-1 space-y-2">
                    <strong className="text-foreground">Authenticate in your terminal:</strong> Run:
                    <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-xs text-emerald-400 flex items-center justify-between">
                      <span>aether login --token &lt;YOUR_API_KEY&gt;</span>
                      <button
                        onClick={() => copyToClipboard('aether login --token <YOUR_API_KEY>', 'login')}
                        className="ml-4 p-1 text-zinc-400 hover:text-zinc-100"
                      >
                        {copiedSnippet === 'login' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Credentials are saved securely to <code className="text-xs">~/.aether/config.json</code> and automatically target <code className="text-xs">https://api.aetherhost.com.ng</code>.
                    </p>
                  </div>
                </li>
              </ol>
            </section>

            {/* Command Reference */}
            <section className="p-6 sm:p-8 rounded-2xl border border-border/50 bg-card shadow-sm space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Code2 className="w-5 h-5 text-primary" /> Complete Command Reference
              </h3>

              <div className="space-y-3 pt-2">
                {[
                  {
                    cmd: 'aether status',
                    desc: 'Checks health, latency, and connectivity of the control plane API.',
                    example: 'aether status\n# Output: ✓ ONLINE: Control Plane is online and healthy!'
                  },
                  {
                    cmd: 'aether list (or aether ls)',
                    desc: 'Fetches all tenant workloads and renders a colored UTF-8 terminal table showing application status, runtime, and GitHub repository.',
                    example: 'aether list'
                  },
                  {
                    cmd: 'aether create <name> --runtime <type>',
                    desc: 'Provisions a new application repository, initializes the runtime template, and queues container build on the worker node.',
                    example: 'aether create my-api --runtime nodejs'
                  },
                  {
                    cmd: 'aether logs <app-id>',
                    desc: 'Streams container build logs, stderr output, and HTTP access logs chronologically to your terminal.',
                    example: 'aether logs app_my-api_440b92f3'
                  },
                  {
                    cmd: 'aether ai <app-id> "<prompt>"',
                    desc: 'Prompts the LLM Architect to synthesize code modifications, execute conventional git commits, and push rolling deployments.',
                    example: 'aether ai app_my-api_440b92f3 "Add a health check endpoint at /api/health that returns uptime"'
                  },
                ].map((item, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-border/50 bg-background/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-primary">{item.cmd}</span>
                      <button
                        onClick={() => copyToClipboard(item.cmd, `cmd-${idx}`)}
                        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                      >
                        {copiedSnippet === `cmd-${idx}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                    <pre className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-zinc-300 overflow-x-auto">
                      {item.example}
                    </pre>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* =========================================================================
            TAB 3: SYSTEM ARCHITECTURE
        ========================================================================== */}
        {activeTab === 'architecture' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <section className="p-6 sm:p-8 rounded-2xl border border-border/50 bg-card shadow-sm space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold flex items-center gap-2.5">
                  <Layers className="w-6 h-6 text-primary" /> Multi-Language Systems Topology
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  AetherHost employs a decoupled multi-language architecture, utilizing each language for its optimal engineering strengths:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-xl border border-red-500/20 bg-red-500/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-red-400">NestJS & Next.js 16</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-300">Control Plane</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Handles business logic, Clerk JWT authentication, PostgreSQL transaction boundaries, and responsive in-dashboard live previewing.
                  </p>
                </div>

                <div className="p-5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-cyan-400">Go 1.22 Runtime Agent</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">Orchestrator</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Runs out-of-process. Polls the control plane for pending workloads, generates Dockerfiles, manages containers via Docker API, and executes HTTP readiness probes.
                  </p>
                </div>

                <div className="p-5 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-amber-400">Rust 1.80+ Daemons</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">Systems & Edge</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Houses the official developer CLI (<code className="text-[11px]">aether-cli</code>), sub-millisecond WebSocket log daemon (<code className="text-[11px]">aether-logd</code>), and edge bandwidth proxy (<code className="text-[11px]">aether-router</code>).
                  </p>
                </div>
              </div>

              {/* Data Flow ASCII Diagram */}
              <div className="space-y-2 pt-2">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">End-to-End Deployment Lifecycle Flow</h4>
                <pre className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-[11px] sm:text-xs text-zinc-300 overflow-x-auto leading-relaxed">
{`Internet Ingress (Port 443 Wildcard *.aetherhost.com.ng)
       │
       ▼
[Traefik Edge Proxy] ── Let's Encrypt Automated TLS
       │
       ├──► Host(api.*)     ──► [NestJS Control Plane API] ──► [PostgreSQL & Redis]
       ├──► Host(console.*) ──► [Next.js 16 Dashboard Console]
       └──► Host(<app>.*)   ──► [Isolated Container Workload] ◄── Provisioned via Go Agent
                                          ▲
                                          │ Readiness Probe Verified (200 OK)
                                          │
                                   [Go Runtime Agent] ◄── Pulls pending jobs via internal API`}
                </pre>
              </div>
            </section>
          </div>
        )}

        {/* =========================================================================
            TAB 4: ENGINEERING TRADE-OFFS (RECRUITER & STAFF ENGINEER SECTION)
        ========================================================================== */}
        {activeTab === 'tradeoffs' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Executive Badge */}
            <section className="p-6 sm:p-8 rounded-2xl border border-purple-500/30 bg-purple-500/5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-purple-400 font-bold text-sm uppercase tracking-wider">
                <Scale className="w-4 h-4" /> Architectural Decisions & Engineering Trade-Offs
              </div>
              <h2 className="text-xl sm:text-2xl font-bold">Why AetherHost Was Designed This Way</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Senior engineering is fundamentally about choosing the <strong>right trade-offs</strong> for maintainability, security, and velocity. Below is a breakdown of the deliberate architectural decisions made during AetherHost's development, intended for engineering leaders, system architects, and technical recruiters reviewing this codebase.
              </p>
            </section>

            {/* Trade-off 1 */}
            <div className="p-6 rounded-2xl border border-border/50 bg-card shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base sm:text-lg text-foreground">
                  1. Modular Monolith vs Distributed Microservices
                </h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">ADR-001</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
                <div className="p-4 rounded-xl bg-background/50 border border-border/40 space-y-1.5">
                  <strong className="text-primary font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> The Decision
                  </strong>
                  <p className="text-muted-foreground leading-relaxed">
                    Build a single, highly structured NestJS control plane with decoupled domain modules (<code className="text-xs">billing</code>, <code className="text-xs">entitlements</code>, <code className="text-xs">applications</code>, <code className="text-xs">ai</code>) sharing a unified Prisma PostgreSQL persistence layer.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-background/50 border border-border/40 space-y-1.5">
                  <strong className="text-amber-500 font-semibold flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4" /> The Trade-Off & Rationale
                  </strong>
                  <p className="text-muted-foreground leading-relaxed">
                    Avoided microservice network latency, distributed tracing complexity, and partial failure states during the initial commercial build. Strict domain boundaries mean modules can be split into independent services effortlessly if individual horizontal scaling demands it.
                  </p>
                </div>
              </div>
            </div>

            {/* Trade-off 2 */}
            <div className="p-6 rounded-2xl border border-border/50 bg-card shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base sm:text-lg text-foreground">
                  2. Pull-Based Agent Orchestration vs Inbound Webhook Push
                </h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">ADR-010</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
                <div className="p-4 rounded-xl bg-background/50 border border-border/40 space-y-1.5">
                  <strong className="text-primary font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> The Decision
                  </strong>
                  <p className="text-muted-foreground leading-relaxed">
                    The Go Orchestration Agent runs as an out-of-process daemon that continuously polls the central API for jobs, authenticating with an internal cryptographic secret (<code className="text-xs">x-agent-key</code>).
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-background/50 border border-border/40 space-y-1.5">
                  <strong className="text-amber-500 font-semibold flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4" /> The Trade-Off & Rationale
                  </strong>
                  <p className="text-muted-foreground leading-relaxed">
                    By making the agent pull instead of push, worker nodes <strong>never open public ports to the internet</strong>. This eliminates an entire class of remote code execution (RCE) vulnerabilities and lets workers operate securely behind NATs and strict corporate firewalls.
                  </p>
                </div>
              </div>
            </div>

            {/* Trade-off 3 */}
            <div className="p-6 rounded-2xl border border-border/50 bg-card shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base sm:text-lg text-foreground">
                  3. Atomic SQL Quota Enforcement vs Distributed Redis Locks
                </h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">ADR-006</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
                <div className="p-4 rounded-xl bg-background/50 border border-border/40 space-y-1.5">
                  <strong className="text-primary font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> The Decision
                  </strong>
                  <p className="text-muted-foreground leading-relaxed">
                    Enforce resource quotas using atomic SQL statements:
                    <code className="block mt-1 p-1.5 rounded bg-zinc-950 font-mono text-[11px] text-amber-300">
                      UPDATE &quot;TenantEntitlement&quot; SET &quot;usageApplications&quot; = &quot;usageApplications&quot; + 1 WHERE &quot;tenantId&quot; = $1 AND &quot;usageApplications&quot; &lt; &quot;limitApplications&quot;
                    </code>
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-background/50 border border-border/40 space-y-1.5">
                  <strong className="text-amber-500 font-semibold flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4" /> The Trade-Off & Rationale
                  </strong>
                  <p className="text-muted-foreground leading-relaxed">
                    Distributed locks (like Redlock) suffer from clock drift, lock acquisition timeouts, and network split-brain risks. Atomic SQL guarantees ACID transactional safety directly at the database engine level, making quota overselling physically impossible.
                  </p>
                </div>
              </div>
            </div>

            {/* Trade-off 4 */}
            <div className="p-6 rounded-2xl border border-border/50 bg-card shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base sm:text-lg text-foreground">
                  4. Post-Response AI Token Deduction vs Pre-Deduction
                </h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">ADR-011</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
                <div className="p-4 rounded-xl bg-background/50 border border-border/40 space-y-1.5">
                  <strong className="text-primary font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> The Decision
                  </strong>
                  <p className="text-muted-foreground leading-relaxed">
                    The AI Proxy checks quota eligibility before invoking the LLM provider (Groq / OpenAI), but deducts token balance <strong>strictly after</strong> a successful HTTP 200 response is returned.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-background/50 border border-border/40 space-y-1.5">
                  <strong className="text-amber-500 font-semibold flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4" /> The Trade-Off & Rationale
                  </strong>
                  <p className="text-muted-foreground leading-relaxed">
                    If an upstream LLM provider suffers a 504 Gateway Timeout or 500 Internal Error, the client is never charged for tokens they didn't receive. This builds deep agency customer trust and protects customer margins.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 5: COMMERCIAL TRUTH & BILLING
        ========================================================================== */}
        {activeTab === 'billing' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <section className="p-6 sm:p-8 rounded-2xl border border-border/50 bg-card shadow-sm space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold flex items-center gap-2.5">
                  <CreditCard className="w-6 h-6 text-primary" /> The Bachs Commercial Engine
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  AetherHost implements recurring subscription billing in Nigerian Naira (NGN) via Bachs, enforcing strict idempotent webhook deduplication and instant entitlement application.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-xl border border-border/50 bg-background/50 space-y-2">
                  <h3 className="font-bold text-sm">Starter Plan (Free)</h3>
                  <div className="text-2xl font-extrabold text-foreground">₦0 <span className="text-xs font-normal text-muted-foreground">/mo</span></div>
                  <ul className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border/40">
                    <li>• 1 Application Container</li>
                    <li>• 512 MB Storage</li>
                    <li>• 10 AI Generation Requests</li>
                    <li>• 10 GB Bandwidth</li>
                  </ul>
                </div>

                <div className="p-5 rounded-xl border border-primary/40 bg-primary/5 space-y-2 relative">
                  <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-primary">Popular</span>
                  <h3 className="font-bold text-sm text-primary">Pro Plan</h3>
                  <div className="text-2xl font-extrabold text-foreground">₦15,000 <span className="text-xs font-normal text-muted-foreground">/mo</span></div>
                  <ul className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border/40">
                    <li>• 5 Application Containers</li>
                    <li>• 2 GB Storage</li>
                    <li>• 50 AI Generation Requests</li>
                    <li>• 50 GB Bandwidth</li>
                    <li>• Custom Domains Flag</li>
                  </ul>
                </div>

                <div className="p-5 rounded-xl border border-border/50 bg-background/50 space-y-2">
                  <h3 className="font-bold text-sm">Max Plan</h3>
                  <div className="text-2xl font-extrabold text-foreground">₦35,000 <span className="text-xs font-normal text-muted-foreground">/mo</span></div>
                  <ul className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border/40">
                    <li>• 20 Application Containers</li>
                    <li>• 10 GB Storage</li>
                    <li>• 200 AI Generation Requests</li>
                    <li>• 500 GB Bandwidth</li>
                    <li>• Priority Support Flag</li>
                  </ul>
                </div>
              </div>

              {/* Idempotent Webhook Verification */}
              <div className="p-5 rounded-xl bg-muted/20 border border-border/50 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" /> Cryptographic Webhook Security (HMAC SHA-256)
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Every webhook from Bachs (<code className="text-xs">/v1/billing/webhooks/bachs</code>) is cryptographically validated using a constant-time HMAC comparison (<code className="text-xs">timingSafeEqual</code>) before processing. Furthermore, every incoming <code className="text-xs">eventId</code> is logged in a dedicated PostgreSQL table; repeated webhook deliveries from network retries are deduplicated instantly, guaranteeing that customer resource quotas can never be double-applied.
                </p>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
