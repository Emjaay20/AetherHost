'use client'

import { useState } from 'react'
import { promptApplication } from '../app/actions'
import { Sparkles, AlertCircle, Loader2 } from 'lucide-react'

export default function AiProvisioningPrompt() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    const formData = new FormData(e.currentTarget)
    try {
      const res = await promptApplication(formData)
      if (res?.error) {
        setError(res.error)
      } else {
        (e.target as HTMLFormElement).reset()
      }
    } catch (e: any) {
      setError('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-8 p-6 rounded-2xl bg-card border border-border/50 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -ml-10 -mt-10" />
      <div className="flex items-center gap-3 text-foreground mb-4 relative">
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
          <Sparkles className="w-4 h-4" />
        </div>
        <h3 className="font-semibold">AI Infrastructure Architect</h3>
      </div>
      
      <p className="text-sm text-muted-foreground mb-4 relative">
        Describe what you want to build, and our LLM will automatically determine the best runtime and configure the deployment for you.
      </p>

      <form onSubmit={handleSubmit} className="relative flex flex-col gap-4">
        <div className="relative">
          <textarea
            name="prompt"
            required
            rows={3}
            placeholder="e.g. Spin up a Python backend for my new analytics dashboard..."
            className="w-full bg-background border border-border rounded-xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            disabled={loading}
          />
        </div>
        
        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="self-end px-6 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 active:scale-95 shadow-sm bg-blue-600 text-white hover:bg-blue-700 border border-blue-800 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Architecting...
            </>
          ) : (
            'Build it'
          )}
        </button>
      </form>
    </div>
  )
}
