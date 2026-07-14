import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { listTrialRequests, approveTrialRequest, rejectTrialRequest } from '@/lib/trials/request.functions'
import { useAuth } from '@/hooks/use-auth'
import { format } from 'date-fns'
import { CheckCircle2, XCircle, Mail, Building2, User, Phone, Globe, Users } from 'lucide-react'

export const Route = createFileRoute('/_authenticated/admin/trial-requests')({
  head: () => ({ meta: [{ title: 'Trial requests — Lavisho TT admin' }] }),
  component: TrialRequestsPage,
})

type Req = Awaited<ReturnType<typeof listTrialRequests>>[number]

function TrialRequestsPage() {
  const { isSuperAdmin } = useAuth()
  const router = useRouter()
  const list = useServerFn(listTrialRequests)
  const approve = useServerFn(approveTrialRequest)
  const reject = useServerFn(rejectTrialRequest)
  const [tab, setTab] = useState<'pending_approval' | 'pending_email_verification' | 'approved' | 'rejected'>('pending_approval')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectFor, setRejectFor] = useState<Req | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const q = useQuery({
    queryKey: ['trial-requests'],
    queryFn: () => list(),
    enabled: isSuperAdmin,
  })

  const rows = useMemo(() => (q.data ?? []).filter((r) => r.status === tab), [q.data, tab])
  const counts = useMemo(() => {
    const c = { pending_approval: 0, pending_email_verification: 0, approved: 0, rejected: 0 } as Record<string, number>
    for (const r of q.data ?? []) c[r.status] = (c[r.status] ?? 0) + 1
    return c
  }, [q.data])

  if (!isSuperAdmin) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">Super admins only</h1>
          <p className="mt-1 text-sm text-muted-foreground">You don't have access to this page.</p>
        </div>
      </div>
    )
  }

  async function onApprove(r: Req) {
    if (busyId) return
    setBusyId(r.id)
    try {
      await approve({ data: { requestId: r.id, origin: window.location.origin } })
      toast.success(`Approved ${r.company_name}`)
      await q.refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Approval failed')
    } finally {
      setBusyId(null)
    }
  }

  async function onReject() {
    if (!rejectFor || busyId) return
    setBusyId(rejectFor.id)
    try {
      await reject({ data: { requestId: rejectFor.id, reason: rejectReason || undefined } })
      toast.success('Request rejected')
      setRejectFor(null)
      setRejectReason('')
      await q.refetch()
    } catch (e: any) {
      toast.error(e?.message ?? 'Rejection failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trial requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review and approve or reject inbound trial signups.</p>
        </div>
        <button onClick={() => router.invalidate()} className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent">
          Refresh
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {(
          [
            ['pending_approval', 'Pending approval'],
            ['pending_email_verification', 'Awaiting email verify'],
            ['approved', 'Approved'],
            ['rejected', 'Rejected'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {label}
            <span className={`rounded-full px-2 py-0.5 text-xs ${tab === k ? 'bg-primary-foreground/20' : 'bg-muted'}`}>
              {counts[k] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {q.isLoading && <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Loading…</div>}
        {!q.isLoading && rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No requests in this state.
          </div>
        )}
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold">{r.company_name}</h3>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-2 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
                  <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> {r.full_name}</span>
                  <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {r.work_email}</span>
                  {r.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {r.phone}</span>}
                  {r.country && <span className="inline-flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> {r.country}</span>}
                  {r.team_size && <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {r.team_size}</span>}
                  <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Submitted {format(new Date(r.created_at), 'MMM d, yyyy p')}</span>
                </div>
                {r.notes && (
                  <p className="mt-3 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">{r.notes}</p>
                )}
                {r.rejection_reason && (
                  <p className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    Rejection note: {r.rejection_reason}
                  </p>
                )}
                {r.status === 'approved' && r.trial_ends_at && (
                  <p className="mt-3 text-xs text-muted-foreground">Trial ends {format(new Date(r.trial_ends_at), 'MMM d, yyyy')}</p>
                )}
              </div>
              {r.status === 'pending_approval' && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    disabled={busyId === r.id}
                    onClick={() => onApprove(r)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </button>
                  <button
                    disabled={busyId === r.id}
                    onClick={() => { setRejectFor(r); setRejectReason('') }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {rejectFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRejectFor(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Reject {rejectFor.company_name}?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Optional reason will be included in the notification email.</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              maxLength={600}
              placeholder="e.g. Not a good fit right now…"
              className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRejectFor(null)} className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">Cancel</button>
              <button onClick={onReject} disabled={busyId === rejectFor.id} className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
                {busyId === rejectFor.id ? 'Rejecting…' : 'Reject request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending_email_verification: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    pending_approval: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
    approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    rejected: 'bg-destructive/15 text-destructive',
  }
  const label: Record<string, string> = {
    pending_email_verification: 'Awaiting email verify',
    pending_approval: 'Pending approval',
    approved: 'Approved',
    rejected: 'Rejected',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-muted'}`}>{label[status] ?? status}</span>
}
