import Image from 'next/image'
import { Toaster } from 'sonner'
import LoginForm from './login-form'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-4">
      <Toaster position="top-center" richColors theme="dark" />
      <div className="w-full max-w-sm">
        <div className="bg-[#1e2130] rounded-2xl shadow-xl border border-[#2a2d3e] p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="mb-4 flex items-center justify-center">
              <Image src="/logo.png" alt="Honor Logistics" width={200} height={60} className="object-contain" priority />
            </div>
            <p className="text-sm text-[#94a3b8] mt-1 text-center">
              Sign in to your workspace
            </p>
          </div>

          <LoginForm />
        </div>

        <p className="text-center text-xs text-[#94a3b8]/60 mt-6">
          &copy; {new Date().getFullYear()} Honor Removals &amp; Logistics. All rights reserved.
        </p>
      </div>
    </div>
  )
}
