'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, Menu, X } from 'lucide-react'

const NAV = [
  {
    label: 'Getting started',
    items: [
      { id: 'overview', label: 'What is AetherHost?' },
      { id: 'cli', label: 'Install the CLI' },
      { id: 'commands', label: 'Commands' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { id: 'architecture', label: 'Architecture' },
      { id: 'decisions', label: 'Decisions' },
      { id: 'billing', label: 'Billing' },
    ],
  },
] as const

const TOC = NAV.flatMap((group) => group.items)

const COMMANDS = [
  ['aether status', 'Check that the control plane is reachable.'],
  ['aether list', 'List this account’s applications.'],
  ['aether create <name> --runtime <type>', 'Create an app and queue a build.'],
  ['aether logs <app-id>', 'Stream build and container logs.'],
  ['aether ai <app-id> "<prompt>"', 'Ask the architect to change the app and redeploy.'],
]

function CodeBlock({ id, text, copied, onCopy }: { id: string; text: string; copied: string | null; onCopy: (text: string, id: string) => void }) {
  return (
    <div className="relative my-4">
      <pre className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 px-4 py-3 pr-16 text-[13px] leading-6 text-zinc-200">
        <code>{text}</code>
      </pre>
      <button
        type="button"
        onClick={() => onCopy(text, id)}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:text-white"
      >
        {copied === id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied === id ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

export default function DocsClient() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('overview')
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

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
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
        <Link href="/" className="truncate text-sm font-semibold tracking-tight">
          AetherHost
        </Link>
        <span className="text-zinc-600">/</span>
        <span className="truncate text-sm text-zinc-400">Docs</span>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/console" className="rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-white">
            Console
          </Link>
          <a
            href="https://github.com/Emjaay20/AetherHost"
            className="hidden rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:text-white sm:inline-flex"
          >
            GitHub
          </a>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl">
        <button
          type="button"
          aria-label="Close docs menu"
          className={`fixed inset-0 z-30 bg-black/60 lg:hidden ${open ? 'block' : 'hidden'}`}
          onClick={() => setOpen(false)}
        />
        <aside
          id="docs-sidebar"
          data-open={open ? 'true' : 'false'}
          className="docs-sidebar fixed bottom-0 left-0 top-14 z-30 w-[min(18rem,85vw)] overflow-y-auto border-r border-zinc-800 bg-[#09090b] px-4 py-6 lg:sticky lg:top-14 lg:block lg:h-[calc(100vh-3.5rem)] lg:w-56 lg:shrink-0 lg:translate-x-0"
        >
          {NAV.map((group) => (
            <div key={group.label} className="mb-6">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">{group.label}</p>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => jump(item.id)}
                      className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${
                        active === item.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <div className="flex min-w-0 flex-1">
          <article className="min-w-0 flex-1 px-4 py-8 sm:px-8 sm:py-10 lg:px-12">
            <p className="text-sm text-zinc-500">Docs</p>
            <h1 id="overview" className="mt-2 scroll-mt-24 text-3xl font-semibold tracking-tight">
              What is AetherHost?
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-zinc-300">
              AetherHost is a hosting control plane for agencies. You create an app, the platform builds a container, and Traefik serves it on a subdomain. An in-dashboard architect can write the first version and later changes, then commit them to GitHub.
            </p>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-zinc-300">
              Plans cap how many apps, how much storage, and how many AI requests an account can use. Those limits are enforced in the database before a workload is created, so a request cannot slip past the quota.
            </p>

            <h2 className="mt-10 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold">What you can deploy</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="py-2 pr-4 font-medium">Runtime</th>
                    <th className="py-2 pr-4 font-medium">Flag</th>
                    <th className="py-2 font-medium">Typical stack</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  {[
                    ['Node.js', 'nodejs', 'Node 18–22, Express, Next.js'],
                    ['Python', 'python', 'Python 3.11, Flask, FastAPI'],
                    ['Go', 'go', 'Go 1.22 binaries'],
                    ['Rust', 'rust', 'Axum, Tokio'],
                  ].map((row) => (
                    <tr key={row[1]} className="border-b border-zinc-800/80">
                      <td className="py-2.5 pr-4">{row[0]}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-zinc-400">--runtime {row[1]}</td>
                      <td className="py-2.5">{row[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 id="cli" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold">
              Install the CLI
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-zinc-300">
              <code className="text-zinc-100">aether</code> is a single Rust binary. It does not need Node or Python on the machine that runs it.
            </p>
            <CodeBlock
              id="install"
              text="curl -fsSL https://console.aetherhost.com.ng/install.sh | bash"
              copied={copied}
              onCopy={copy}
            />
            <p className="max-w-2xl text-sm leading-6 text-zinc-400">
              Or build it yourself:{' '}
              <code className="text-zinc-200">cargo install --git https://github.com/Emjaay20/AetherHost.git aether-cli</code>
            </p>
            <ol className="mt-6 max-w-2xl list-decimal space-y-3 pl-5 text-[15px] leading-7 text-zinc-300">
              <li>
                In the console, open Settings and generate a CLI token. It starts with <code className="text-zinc-100">aeth_</code>.
              </li>
              <li>
                Save it locally. The CLI writes <code className="text-zinc-100">~/.aether/config.json</code> and talks to{' '}
                <code className="text-zinc-100">https://api.aetherhost.com.ng</code>.
              </li>
            </ol>
            <CodeBlock id="login" text="aether login --token <YOUR_API_KEY>" copied={copied} onCopy={copy} />

            <h2 id="commands" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold">
              Commands
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="py-2 pr-4 font-medium">Command</th>
                    <th className="py-2 font-medium">What it does</th>
                  </tr>
                </thead>
                <tbody>
                  {COMMANDS.map(([cmd, desc]) => (
                    <tr key={cmd} className="border-b border-zinc-800/80 align-top">
                      <td className="py-2.5 pr-4 font-mono text-xs text-zinc-200">{cmd}</td>
                      <td className="py-2.5 text-zinc-300">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CodeBlock
              id="create"
              text={'aether create my-api --runtime nodejs'}
              copied={copied}
              onCopy={copy}
            />

            <h2 id="architecture" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold">
              Architecture
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-zinc-300">
              The control plane accepts the request. A Go agent on the VPS picks up pending work, starts the container, and checks <code className="text-zinc-100">/health</code>. Traefik terminates TLS and routes the hostname.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="py-2 pr-4 font-medium">Piece</th>
                    <th className="py-2 font-medium">Job</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  <tr className="border-b border-zinc-800/80">
                    <td className="py-2.5 pr-4">NestJS API</td>
                    <td className="py-2.5">Auth, billing, quotas, and the architect.</td>
                  </tr>
                  <tr className="border-b border-zinc-800/80">
                    <td className="py-2.5 pr-4">Next.js console</td>
                    <td className="py-2.5">The dashboard you are using.</td>
                  </tr>
                  <tr className="border-b border-zinc-800/80">
                    <td className="py-2.5 pr-4">Go agent</td>
                    <td className="py-2.5">Builds and starts containers. It polls the API, so the worker does not need a public port.</td>
                  </tr>
                  <tr className="border-b border-zinc-800/80">
                    <td className="py-2.5 pr-4">Rust tools</td>
                    <td className="py-2.5"><code>aether</code>, <code>aether-logd</code>, and <code>aether-router</code>.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 p-4 text-xs leading-6 text-zinc-300">{`*.aetherhost.com.ng
        │
        ▼
     Traefik
        ├── api.*      NestJS  →  Postgres / Redis
        ├── console.*  Next.js
        └── <app>.*    your container  ←  Go agent`}</pre>

            <h2 id="decisions" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold">
              Decisions
            </h2>
            <div className="mt-4 max-w-2xl space-y-6 text-[15px] leading-7 text-zinc-300">
              <section>
                <h3 className="text-base font-semibold text-zinc-100">One API, not a mesh of services</h3>
                <p className="mt-1">
                  Billing, apps, and AI live in one NestJS process with separate modules. That avoids network calls between services while the product is still small. The module boundaries are the split point if one of them later needs its own process.
                </p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-zinc-100">The agent pulls work</h3>
                <p className="mt-1">
                  The Go agent asks the API for pending apps. The API never opens a connection into the worker. Workers can sit behind a firewall, and there is no public endpoint that can be told to run a container.
                </p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-zinc-100">Quotas are a single SQL update</h3>
                <p className="mt-1">
                  A slot is taken only if the current usage is still under the limit. Two requests at the same time cannot both pass. A Redis lock was rejected because a split or a stale lock can oversell the plan.
                </p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-zinc-100">AI usage is charged after a successful reply</h3>
                <p className="mt-1">
                  The request is refused up front if the account is out of quota. Tokens are recorded only after the model returns. A provider timeout does not consume the allowance.
                </p>
              </section>
            </div>

            <h2 id="billing" className="mt-12 scroll-mt-24 border-b border-zinc-800 pb-2 text-xl font-semibold">
              Billing
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-zinc-300">
              Subscriptions are in naira through Bachs. A paid webhook updates the plan once. Repeats of the same event are ignored.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="py-2 pr-4 font-medium">Plan</th>
                    <th className="py-2 pr-4 font-medium">Price</th>
                    <th className="py-2 font-medium">Includes</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  <tr className="border-b border-zinc-800/80">
                    <td className="py-2.5 pr-4">Starter</td>
                    <td className="py-2.5 pr-4">₦0</td>
                    <td className="py-2.5">1 app, 512 MB, 10 AI requests</td>
                  </tr>
                  <tr className="border-b border-zinc-800/80">
                    <td className="py-2.5 pr-4">Pro</td>
                    <td className="py-2.5 pr-4">₦15,000 / month</td>
                    <td className="py-2.5">5 apps, 2 GB, 50 AI requests</td>
                  </tr>
                  <tr className="border-b border-zinc-800/80">
                    <td className="py-2.5 pr-4">Max</td>
                    <td className="py-2.5 pr-4">₦35,000 / month</td>
                    <td className="py-2.5">20 apps, 10 GB, 200 AI requests</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400">
              Bachs signs <code className="text-zinc-200">/v1/billing/webhooks/bachs</code>. The API checks the signature with a constant-time compare, then stores the event id. A retry cannot apply the plan twice.
            </p>

            <div className="mt-12 flex flex-col gap-3 border-t border-zinc-800 pt-6 text-sm sm:flex-row sm:justify-between">
              <Link href="/" className="text-zinc-400 hover:text-white">
                Home
              </Link>
              <Link href="/console" className="text-zinc-200 hover:text-white">
                Open the console
              </Link>
            </div>
          </article>

          <aside className="hidden w-44 shrink-0 pr-6 pt-10 xl:block">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">On this page</p>
            <ul className="mt-3 space-y-2">
              {TOC.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => jump(item.id)}
                    className={`text-left text-xs leading-5 ${active === item.id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </div>
  )
}
