import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { submitTrialRequest } from '@/lib/trials/request.functions'
import { ArrowLeft, ShieldCheck } from 'lucide-react'

export const Route = createFileRoute('/trial')({
  head: () => ({
    meta: [
      { title: 'Start your 7-day free trial — Lavisho TT' },
      { name: 'description', content: 'Request a 7-day free trial of Lavisho TT. Verify your email and our team activates your workspace within one business day.' },
      { property: 'og:title', content: 'Start your 7-day free trial — Lavisho TT' },
      { property: 'og:description', content: 'Field activity, CRM and tasks in one workspace. No credit card required.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: TrialPage,
})

function TrialPage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [form, setForm] = useState({
    full_name: '',
    work_email: '',
    company_name: '',
    phone: '',
    country: '',
    team_size: '',
    notes: '',
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const res: any = await submitTrialRequest({
        data: {
          ...form,
          origin: typeof window !== 'undefined' ? window.location.origin : 'https://lavishott.cloud',
        },
      })
      if (!res?.ok) {
        toast.error(res?.message ?? 'Could not submit your request.')
        if (res?.code === 'already_active') navigate({ to: '/auth' })
        return
      }
      setDone(form.work_email)
      toast.success('Verification email sent. Please check your inbox.')
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <div className="mt-8 rounded-2xl border border-border bg-card p-8 shadow-sm">
          {done ? (
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h1 className="mt-4 text-2xl font-bold tracking-tight">Check your inbox</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We've sent a verification link to <span className="font-medium text-foreground">{done}</span>. Click it to complete your trial request.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Once verified, our team will review and activate your workspace — usually within one business day. You'll get a second email with sign-in details.
              </p>
              <div className="mt-6 flex gap-2">
                <Link to="/" className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">
                  Back to home
                </Link>
                <Link to="/auth" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  Go to sign in
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit}>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                7-day trial · no credit card
              </span>
              <h1 className="mt-4 text-2xl font-bold tracking-tight">Start your Lavisho TT trial</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Tell us a bit about you. We'll email a verification link, then activate your workspace after a quick review.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Field label="Full name" required>
                  <input required maxLength={120} value={form.full_name} onChange={set('full_name')} className={input} placeholder="Jane Doe" />
                </Field>
                <Field label="Work email" required>
                  <input required type="email" maxLength={180} value={form.work_email} onChange={set('work_email')} className={input} placeholder="jane@company.com" />
                </Field>
                <Field label="Company name" required>
                  <input required maxLength={160} value={form.company_name} onChange={set('company_name')} className={input} placeholder="Acme Ltd" />
                </Field>
                <Field label="Phone (optional)">
                  <input maxLength={40} value={form.phone} onChange={set('phone')} className={input} placeholder="+8801…" />
                </Field>
                <Field label="Country (optional)">
                  <input maxLength={80} value={form.country} onChange={set('country')} className={input} placeholder="Bangladesh" />
                </Field>
                <Field label="Team size (optional)">
                  <select value={form.team_size} onChange={set('team_size')} className={input}>
                    <option value="">Select…</option>
                    <option>1–5</option>
                    <option>6–20</option>
                    <option>21–50</option>
                    <option>51–200</option>
                    <option>200+</option>
                  </select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="What are you hoping to solve? (optional)">
                    <textarea maxLength={1000} rows={4} value={form.notes} onChange={set('notes')} className={input} placeholder="Field visits, CRM, tasks…" />
                  </Field>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? 'Sending verification email…' : 'Request 7-day trial'}
              </button>

              <p className="mt-4 text-xs text-muted-foreground">
                Already have an account? <Link to="/auth" className="font-medium text-foreground underline">Sign in</Link>.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

const input =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </span>
      {children}
    </label>
  )
}
