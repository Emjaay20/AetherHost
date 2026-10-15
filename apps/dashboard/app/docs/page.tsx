import type { Metadata } from 'next'
import DocsClient from './DocsClient'

export const metadata: Metadata = {
  title: 'Documentation & Architecture | AetherHost',
  description:
    'Comprehensive technical documentation, developer CLI guide, systems architecture, and engineering trade-offs behind the AetherHost Autonomous Cloud Platform.',
}

export default function DocsPage() {
  return <DocsClient />
}
