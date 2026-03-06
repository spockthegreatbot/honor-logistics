import { Truck } from 'lucide-react'
import { Toaster } from 'sonner'
import LoginForm from './login-form'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Toaster position="top-center" richColors />
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center mb-4 shadow-md">
              <Truck className="w-7 h-7 text-white" strokeWidth={2} />
            </div>
            <h1 className="text-xl font-bold text-slate-900 text-center">
              Honor Removals &amp; Logistics
            </h1>
            <p className="text-sm text-slate-500 mt-1 text-center">
              Sign in to your workspace
            </p>
          </div>

          <LoginForm />
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          &copy; {new Date().getFullYear()} Honor Removals &amp; Logistics. All rights reserved.
        </p>
      </div>
    </div>
  )
}
