import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { verifyTrialEmail } from '@/lib/trials/request.functions'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { z } from 'zod'

export const Route = createFileRoute('/trial/verify')({
  validateSearch: (s) => z.object({ token: z.string().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: 'Verifying your email — Lavisho TT' },
      { name: 'description', content: 'Confirming your Lavisho TT trial request.' },
    ],
  }),
  component: VerifyPage,
})

function VerifyPage() {
  const { token } = Route.useSearch()
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState<string | undefined>()

  useEffect(() => {
    let cancel = false
    ;(async () => {
      if (!token) {
        setState('error')
        setMessage('Missing verification token.')
        return
      }
      try {
        const res: any = await verifyTrialEmail({ data: { token } })
        if (cancel) return
        if (res?.ok) {
          setEmail(res.email)
          setState('ok')
          setMessage(res.alreadyVerified ? 'This email was already verified. Sit tight — our team is reviewing your request.' : 'Email verified! Our team will review and activate your workspace within one business day.')
        } else {
          setState('error')
          setMessage(res?.message ?? 'This link is invalid or has already been used.')
        }
      } catch (err: any) {
        if (cancel) return
        setState('error')
        setMessage(err?.message ?? 'Something went wrong verifying your email.')
      }
    })()
    return () => { cancel = true }
  }, [token])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        {state === 'loading' && (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <h1 className="mt-4 text-xl font-semibold">Verifying your email…</h1>
          </>
        )}
        {state === 'ok' && (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-xl font-bold tracking-tight">You're verified</h1>
            {email && <p className="mt-1 text-xs text-muted-foreground">{email}</p>}
            <p className="mt-3 text-sm text-muted-foreground">{message}</p>
            <div className="mt-6 flex justify-center gap-2">
              <Link to="/" className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">
                Home
              </Link>
              <Link to="/auth" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                Sign in
              </Link>
            </div>
          </>
        )}
        {state === 'error' && (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <XCircle className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-xl font-bold tracking-tight">Verification failed</h1>
            <p className="mt-3 text-sm text-muted-foreground">{message}</p>
            <div className="mt-6 flex justify-center gap-2">
              <Link to="/trial" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                Request a new trial
              </Link>
              <Link to="/" className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">
                Home
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
