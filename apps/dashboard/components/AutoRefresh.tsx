'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AutoRefresh({ interval = 3000 }: { interval?: number }) {
  const router = useRouter()
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined') {
        const activeTag = document.activeElement?.tagName?.toLowerCase()
        // Never refresh while user is actively typing in an input, textarea or select
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
          return
        }
        // Never refresh if any modal dialog or overlay is open
        if (
          document.querySelector('[role="dialog"]') ||
          document.querySelector('.fixed.inset-0.z-50')
        ) {
          return
        }
      }
      router.refresh()
    }, interval)
    return () => clearInterval(timer)
  }, [router, interval])
  return null
}

