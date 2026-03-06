'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Mode = 'magic' | 'password'
type State = 'idle' | 'loading' | 'success'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<Mode>('magic')
  const [state, setState] = useState<State>('idle')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email.trim()) return
    setState('loading')
    const supabase = createClient()

    if (mode === 'magic') {
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
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) {
        toast.error(error.message)
        setState('idle')
      } else {
        router.push('/dashboard')
        router.refresh()
      }
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
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
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

      {mode === 'password' && (
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full h-9 px-3 pr-9 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={state === 'loading'}
        className="w-full h-9 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition shadow-sm"
      >
        {state === 'loading' ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {mode === 'magic' ? 'Sending…' : 'Signing in…'}
          </>
        ) : (
          mode === 'magic' ? 'Send magic link' : 'Sign in'
        )}
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={() => { setMode(mode === 'magic' ? 'password' : 'magic'); setState('idle') }}
          className="text-xs text-slate-400 hover:text-orange-500 underline underline-offset-2 transition"
        >
          {mode === 'magic' ? 'Sign in with password instead' : 'Send magic link instead'}
        </button>
      </div>
    </form>
  )
}
