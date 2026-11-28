'use client'

import { useEffect, useState } from 'react'

type Insight = { id: number; title: string; excerpt: string; content?: string; date: string; sourceUrl?: string }
const origin = process.env.NEXT_PUBLIC_WORDPRESS_URL || 'https://aetherpress-intelligence.aetherhost.app'

export default function Page() {
  const [items, setItems] = useState<Insight[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [selected, setSelected] = useState<number | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const sync = () => { const match = /^#article-(\d+)$/.exec(location.hash); setSelected(match ? Number(match[1]) : null) }
    sync(); window.addEventListener('hashchange', sync)
    fetch(`${origin}/wp-json/aetherpress/v1/insights`, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(response => { if (!response.ok) throw new Error('Unavailable'); return response.json() })
      .then(data => { if (!Array.isArray(data)) throw new Error('Invalid feed'); setItems(data.filter((item): item is Insight => Number.isInteger(item?.id) && typeof item?.title === 'string')); setState('ready') })
      .catch(error => { if (error.name !== 'AbortError') setState('error') })
    return () => { controller.abort(); window.removeEventListener('hashchange', sync) }
  }, [])
  const article = items.find(item => item.id === selected)
  return <><header><a className="brand" href="#">AetherPress<span>.</span></a><span className="header-label">Research &amp; ideas</span></header><main>
    {selected === null ? <><section className="hero"><p className="eyebrow">The AetherPress journal</p><h1>Ideas worth<br/><em>looking into.</em></h1><p className="intro">Thoughtful research, reviewed by people and published with WordPress.</p></section><section className="stories"><div className="section-title"><h2>Latest insights</h2><span>Research, in context</span></div>{state === 'loading' && <p role="status">Loading insights…</p>}{state === 'error' && <p role="alert">We couldn’t load the WordPress feed. Please try again later.</p>}{state === 'ready' && !items.length && <p>No insights have been published yet.</p>}<div className="grid">{items.map(item => <article className="card" key={item.id}><p className="eyebrow">Research insight</p><h3><a href={`#article-${item.id}`}>{item.title}</a></h3><p>{item.excerpt}</p><a className="read" href={`#article-${item.id}`}>Read insight</a></article>)}</div></section></> : <section className="article"><a className="back" href="#">All insights</a>{state === 'loading' ? <p>Loading article…</p> : !article ? <p role="status">This published insight is unavailable.</p> : <><p className="eyebrow">Research insight</p><h1>{article.title}</h1><p className="article-body">{article.content || article.excerpt || 'No article text has been published yet.'}</p>{article.sourceUrl && /^https:\/\//i.test(article.sourceUrl) && <a className="source" href={article.sourceUrl} target="_blank" rel="noopener noreferrer">Visit the research source</a>}</>}</section>}
  </main><footer><span>AetherPress</span><span>Published with WordPress</span></footer></>
}
