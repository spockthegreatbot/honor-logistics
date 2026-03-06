'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type State = 'idle' | 'loading' | 'success'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<State>('idle')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email.trim()) return

    setState('loading')
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin + '/auth/callback',
      },
    })

    if (error) {
      toast.error(error.message)
      setState('idle')
    } else {
      setState('success')
    }
  }

  if (state === 'success') {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle className="w-6 h-6 text-green-600" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-slate-900 text-sm">Check your email</p>
          <p className="text-slate-500 text-sm mt-0.5">
            We sent a magic link to <span className="font-medium text-slate-700">{email}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setState('idle')}
          className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 mt-1"
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-slate-700"
        >
          Work email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@honorlogistics.com.au"
          required
          autoFocus
          className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
        />
      </div>

      <button
        type="submit"
        disabled={state === 'loading'}
        className="w-full h-9 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition shadow-sm"
      >
        {state === 'loading' ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Sending…
          </>
        ) : (
          'Send magic link'
        )}
      </button>
    </form>
  )
}
