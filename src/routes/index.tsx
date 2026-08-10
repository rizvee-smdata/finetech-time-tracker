import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import {
  MapPin,
  Users,
  ListChecks,
  Clock,
  Sparkles,
  BarChart3,
  Check,
  ArrowRight,
  ShieldCheck,
  PlayCircle,
} from 'lucide-react'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session) throw redirect({ to: '/dashboard' })
  },
  head: () => ({
    meta: [
      { title: 'Lavisho TT — Field activity, CRM and task management for growing teams' },
      { name: 'description', content: 'Track field visits with GPS, manage your sales pipeline, run tasks and get AI-powered coaching — in one workspace. Start a 7-day free trial.' },
      { property: 'og:title', content: 'Lavisho TT — Field activity, CRM and tasks in one workspace' },
      { property: 'og:description', content: 'GPS check-ins, CRM pipeline, task management, attendance and AI copilot. Start a 7-day free trial.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'Lavisho TT' },
      { name: 'twitter:description', content: 'Field activity, CRM and task management for growing teams.' },
    ],
  }),
  component: LandingPage,
})

const FEATURES = [
  { icon: MapPin, title: 'GPS field check-in', desc: 'Geofenced visits with selfie/voice notes, auto-close on next check-in, offline-safe.' },
  { icon: Users, title: 'CRM & pipeline', desc: 'Leads, accounts, quotes, forecast, sequences and territory routing with real-time coaching.' },
  { icon: ListChecks, title: 'Task management', desc: 'Board, list, calendar and gantt views. Sprints, dependencies, time logs and SLA tracking.' },
  { icon: Clock, title: 'Attendance & expenses', desc: 'Clock in/out, holidays, approval chains for expenses and office-work logs.' },
  { icon: Sparkles, title: 'AI copilot', desc: 'Anomaly detection, meeting prep briefs, weekly narratives and coaching flags.' },
  { icon: BarChart3, title: 'Reports & analytics', desc: 'Live scorecards, client health, route plans and executive dashboards.' },
]

const REELS: { label: string; desc: string; src?: string; poster?: string }[] = [
  { label: 'GPS check-in flow', desc: 'Geofence, selfie, voice — under 20 seconds.', src: '/reels/gps-checkin.mp4' },
  { label: 'CRM pipeline', desc: 'Drag deals through stages with live forecast.', src: '/reels/crm-pipeline.mp4' },
  { label: 'Task board', desc: 'Assign, comment, log time — all in one place.', src: '/reels/task-board.mp4' },
  { label: 'AI copilot', desc: 'Ask questions, get briefings and anomaly alerts.', src: '/reels/ai-copilot.mp4' },
]

const PLANS = [
  {
    name: 'Professional',
    price: '$12',
    tag: '/user/month',
    blurb: 'For growing field & sales teams.',
    cta: 'Start 7-day free trial',
    ctaTo: '/trial' as const,
    features: [
      'GPS check-ins & visit reports',
      'CRM: leads, accounts, quotes',
      'Task management (board / list / calendar)',
      'Attendance & expenses',
      'Standard reports & scorecards',
      'Email support',
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    tag: 'contact sales',
    blurb: 'For multi-region teams that need everything.',
    cta: 'Talk to sales',
    ctaTo: '/trial' as const,
    highlight: true,
    features: [
      'Everything in Professional',
      'AI copilot, anomalies & coaching',
      'Advanced forecasting & territory planning',
      'Client health & renewal automations',
      'SSO, audit logs, custom roles',
      'Priority onboarding & SLA support',
    ],
  },
]

const FAQ = [
  { q: 'How does the 7-day trial work?', a: 'Submit the trial form, verify your email, and our team activates your workspace within one business day. You get full access for 7 days with no credit card required.' },
  { q: 'Can I bring my existing CRM data?', a: 'Yes — CSV import is available on day one. For larger migrations our team can help move accounts, leads and open deals.' },
  { q: 'Where is my data stored?', a: 'Data is hosted on encrypted, SOC-2 compliant infrastructure. Row-level security ensures each workspace only sees its own data.' },
  { q: 'What happens after the trial?', a: 'You can pick Professional or Enterprise, or let the workspace expire. Nothing is charged automatically.' },
]

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--primary)/0.12),transparent_70%)]" />
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-16 md:pt-24">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> 7-day free trial · no credit card
              </span>
              <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
                Run your field team, sales pipeline and tasks — in one workspace.
              </h1>
              <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
                Lavisho TT gives you GPS check-ins, a real CRM, task management, attendance, and an AI copilot that helps you close more deals — without stitching together five different tools.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/trial"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
                >
                  Start 7-day free trial <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-accent"
                >
                  Sign in
                </Link>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Trusted by field teams across sales, service and distribution.
              </p>
            </div>
            <HeroMock />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-b border-border py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionEyebrow>Product</SectionEyebrow>
          <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Everything your field & sales team runs on</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Purpose-built modules that share data — so a visit becomes a lead, a lead becomes a task, and a task becomes a closed deal.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card p-6 transition hover:border-primary/40 hover:shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Reels */}
      <section id="reels" className="border-b border-border bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionEyebrow>See it in motion</SectionEyebrow>
          <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Product reels</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Short loops of the workflows your team lives in every day.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {REELS.map((r) => (
              <ReelCard key={r.label} reel={r} />
            ))}
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Drop your recordings into <code>/public/reels/</code> using the file names above to replace these.
          </p>

        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b border-border py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionEyebrow>Pricing</SectionEyebrow>
          <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Simple, transparent plans</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Start free for 7 days. Upgrade when your team is ready — no hidden fees.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`relative rounded-2xl border p-8 transition ${
                  p.highlight ? 'border-primary bg-card shadow-lg ring-1 ring-primary/40' : 'border-border bg-card'
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-3 right-6 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    Most powerful
                  </span>
                )}
                <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{p.name}</div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-4xl font-bold tracking-tight">{p.price}</span>
                  <span className="text-sm text-muted-foreground">{p.tag}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{p.blurb}</p>
                <ul className="mt-6 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to={p.ctaTo}
                  className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold transition ${
                    p.highlight
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'border border-input bg-background text-foreground hover:bg-accent'
                  }`}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-b border-border py-20">
        <div className="mx-auto max-w-3xl px-6">
          <SectionEyebrow>FAQ</SectionEyebrow>
          <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Frequently asked</h2>
          <div className="mt-8 divide-y divide-border rounded-xl border border-border bg-card">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold">
                  {f.q}
                  <span className="text-muted-foreground transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Ready to see it running your team?</h2>
          <p className="mt-3 text-muted-foreground">Get a 7-day trial workspace — reviewed and activated by a real person, usually within a business day.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/trial" className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90">
              Start 7-day free trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/auth" className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-accent">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">L</span>
          <span className="text-sm font-semibold tracking-tight">Lavisho TT</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#reels" className="hover:text-foreground">Reels</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <a href="#faq" className="hover:text-foreground">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/auth"
            className="hidden rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            to="/trial"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </header>
  )
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-widest text-primary">{children}</div>
}

function HeroMock() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-tr from-primary/20 via-primary/5 to-transparent blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
          <span className="ml-3 text-xs text-muted-foreground">app.lavisho.tt / dashboard</span>
        </div>
        <div className="grid grid-cols-3 gap-3 p-5">
          <MockStat label="Visits today" value="42" trend="+18%" />
          <MockStat label="Open leads" value="127" trend="+6" />
          <MockStat label="Won this week" value="₦8.4M" trend="+22%" />
        </div>
        <div className="grid gap-3 px-5 pb-5">
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pipeline</div>
            <div className="flex gap-2">
              {['New', 'Contact', 'Quote', 'Nego', 'Won'].map((s, i) => (
                <div key={s} className="flex-1 rounded bg-primary/10 px-2 py-3 text-center">
                  <div className="text-[10px] text-muted-foreground">{s}</div>
                  <div className="mt-1 text-sm font-semibold" style={{ opacity: 1 - i * 0.12 }}>
                    {[24, 18, 12, 7, 5][i]}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today's field team</div>
            <div className="space-y-2">
              {[
                { n: 'Ayesha', s: 'Checked in · Dhanmondi' },
                { n: 'Rakib', s: 'En route · 3 stops left' },
                { n: 'Nadia', s: 'Wrapped visit · 12 min' },
              ].map((p) => (
                <div key={p.n} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      {p.n[0]}
                    </span>
                    <span className="text-sm font-medium">{p.n}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{p.s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MockStat({ label, value, trend }: { label: string; value: string; trend: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
      <div className="text-[11px] text-emerald-600">{trend}</div>
    </div>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-xs text-muted-foreground sm:flex-row">
        <div>© {new Date().getFullYear()} Lavisho Group. All rights reserved.</div>
        <div className="flex items-center gap-4">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <Link to="/auth" className="hover:text-foreground">Sign in</Link>
          <Link to="/trial" className="hover:text-foreground">Start trial</Link>
        </div>
      </div>
    </footer>
  )
}
