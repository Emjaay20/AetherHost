'use client'

import { useState } from 'react'
import { ArrowRight, Check, Globe2, LayoutTemplate } from 'lucide-react'

/** A demonstration of the proposed flow; it does not create or publish a site. */
export default function WordPressFrontendConcept({ appName }: { appName: string }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"><LayoutTemplate className="h-4 w-4" /> WordPress frontend <span className="rounded border border-border px-2 py-0.5 normal-case tracking-normal">Concept preview</span></div>
          <h3 className="mt-2 text-base font-semibold">Your content, presented your way</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">See the proposed journey from {appName} to a frontend in your own Spacefast account.</p>
        </div>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted">{open ? 'Close preview' : 'Explore the journey'}</button>
      </div>
      {open && <div className="mt-5 grid gap-4 border-t border-border pt-5 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <p className="text-xs leading-5 text-muted-foreground">This is a preview of a planned feature. It does not create a frontend, connect an account or publish a site.</p>
          {[
            ['1', 'Choose a frontend', 'Start with a Next.js editorial template connected to your published WordPress content.'],
            ['2', 'Connect Spacefast', 'Create or sign in to your Spacefast account, then authorize AetherHost when customer connections become available.'],
            ['3', 'Review and publish', 'Preview the site, approve the static files and publish to your own Spacefast workspace.'],
          ].map(([number, title, description]) => <div key={number} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs">{number}</span><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div></div>)}
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-muted-foreground">Customer-owned Spacefast connections require provider access. Registration and authorization will take place on Spacefast, not in this form.</p>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 text-xs"><span className="font-medium">Frontend preview</span><span className="text-muted-foreground">Illustration</span></div>
          <div className="bg-[#f6f3ed] p-6 text-[#1b2029] sm:p-8"><div className="flex items-center justify-between text-xs font-semibold"><span>{appName}</span><Globe2 className="h-4 w-4" /></div><p className="mt-10 text-[10px] font-bold uppercase tracking-[0.2em] text-[#586b63]">Your WordPress content</p><h4 className="mt-3 max-w-sm text-3xl font-semibold tracking-tight">Stories worth sharing.</h4><p className="mt-3 max-w-sm text-sm leading-6 text-[#59615d]">A welcoming home for your latest ideas, news and updates.</p><div className="mt-6 flex items-center gap-2 text-xs font-medium">Explore the latest <ArrowRight className="h-3 w-3" /></div><div className="mt-8 grid gap-3 sm:grid-cols-2">{['Your first story', 'More from your site'].map(title => <div key={title} className="rounded border border-[#deded7] bg-white p-4"><span className="text-[10px] uppercase tracking-wider text-[#65716b]">Sample article</span><p className="mt-2 text-sm font-semibold">{title}</p><p className="mt-2 text-xs text-[#65716b]">Published content appears here.</p></div>)}</div></div>
          <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5" /> Example layout; not a live website</div>
        </div>
      </div>}
    </section>
  )
}
