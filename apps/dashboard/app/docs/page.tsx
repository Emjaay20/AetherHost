import type { Metadata } from 'next'
import DocsClient from './DocsClient'

export const metadata: Metadata = {
  title: 'Docs | AetherHost',
  description: 'How AetherHost deploys apps, how the CLI works, and how plans are enforced.',
}

export default function DocsPage() {
  return <DocsClient />
}
