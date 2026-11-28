import './style.css'
import type { ReactNode } from 'react'

export const metadata = { title: 'AetherPress | Research and ideas', description: 'A WordPress-powered editorial frontend.' }

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
