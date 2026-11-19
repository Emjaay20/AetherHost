import type { Metadata } from 'next'
import DocsClient from './DocsClient'

export const metadata: Metadata = {
  title: 'Docs | AetherHost',
  description: 'Deploy applications with AetherHost: identity, secret encryption, verified releases, Kubernetes hardening, and recovery operations.',
}

export default function DocsPage() {
  return <DocsClient />
}
