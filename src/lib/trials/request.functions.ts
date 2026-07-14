import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

const SubmitSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  work_email: z.string().trim().email().max(180),
  company_name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  country: z.string().trim().max(80).optional().or(z.literal('')),
  team_size: z.string().trim().max(40).optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  origin: z.string().trim().url().max(300),
})

function genToken(): string {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'company'
}

export const submitTrialRequest = createServerFn({ method: 'POST' })
  .inputValidator((d) => SubmitSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { sendTrialNotice } = await import('./emails.server')

    const email = data.work_email.toLowerCase()

    // Basic dedupe: block if a non-rejected recent request exists
    const { data: recent } = await supabaseAdmin
      .from('trial_requests')
      .select('id, status, created_at')
      .ilike('work_email', email)
      .in('status', ['pending_email_verification', 'pending_approval', 'approved'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (recent && recent.length > 0) {
      const r = recent[0] as { status: string }
      if (r.status === 'approved') {
        return { ok: false, code: 'already_active', message: 'A workspace already exists for this email. Please sign in.' }
      }
      return { ok: false, code: 'already_pending', message: 'A trial request for this email is already pending. Check your inbox for the verification email.' }
    }

    const token = genToken()
    const { error: insErr } = await supabaseAdmin.from('trial_requests').insert({
      full_name: data.full_name,
      work_email: email,
      company_name: data.company_name,
      phone: data.phone || null,
      country: data.country || null,
      team_size: data.team_size || null,
      notes: data.notes || null,
      verification_token: token,
      status: 'pending_email_verification',
    })
    if (insErr) {
      console.error('trial insert failed', insErr)
      throw new Error('Could not save trial request')
    }

    const verifyUrl = `${data.origin.replace(/\/+$/, '')}/trial/verify?token=${token}`
    await sendTrialNotice(supabaseAdmin, {
      to: email,
      subject: 'Verify your email — Lavisho TT trial',
      title: 'Verify your email',
      greeting: `Hi ${data.full_name.split(' ')[0]},`,
      intro: `Thanks for requesting a 7-day trial of Lavisho TT for ${data.company_name}.`,
      bodyText: 'Confirm your email using the button below. Once verified, our team will review and approve your workspace — you\'ll receive a second email with sign-in details.',
      ctaLabel: 'Verify email',
      ctaUrl: verifyUrl,
      label: 'trial-verify',
      idempotencyKey: `trial-verify-${token}`,
    })

    return { ok: true }
  })

export const verifyTrialEmail = createServerFn({ method: 'POST' })
  .inputValidator((d) => z.object({ token: z.string().min(10).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const { data: row } = await supabaseAdmin
      .from('trial_requests')
      .select('id, status, verification_token, work_email, company_name, full_name')
      .eq('verification_token', data.token)
      .maybeSingle()

    if (!row) return { ok: false, code: 'invalid', message: 'This verification link is invalid or has already been used.' }

    if (row.status !== 'pending_email_verification') {
      return { ok: true, alreadyVerified: true, email: row.work_email }
    }

    const { error: updErr } = await supabaseAdmin
      .from('trial_requests')
      .update({
        status: 'pending_approval',
        email_verified_at: new Date().toISOString(),
        verification_token: null,
      })
      .eq('id', row.id)
    if (updErr) {
      console.error('verify update failed', updErr)
      throw new Error('Could not verify email')
    }

    return { ok: true, alreadyVerified: false, email: row.work_email }
  })

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data: prof } = await supabase.from('profiles').select('is_super_admin').eq('id', userId).maybeSingle()
  if (!prof?.is_super_admin) throw new Error('Forbidden: super-admin only')
}

export const approveTrialRequest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid(), origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { sendTrialNotice } = await import('./emails.server')

    const { data: row } = await supabaseAdmin
      .from('trial_requests')
      .select('*')
      .eq('id', data.requestId)
      .maybeSingle()
    if (!row) throw new Error('Trial request not found')
    if (row.status === 'approved') return { ok: true, alreadyApproved: true }
    if (row.status !== 'pending_approval') throw new Error('Request is not ready for approval')

    // Create company
    const baseSlug = slugify(row.company_name)
    let slug = baseSlug
    for (let i = 0; i < 5; i++) {
      const { data: exists } = await supabaseAdmin.from('companies').select('id').eq('slug', slug).maybeSingle()
      if (!exists) break
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
    }
    const trialEnds = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: company, error: coErr } = await supabaseAdmin
      .from('companies')
      .insert({ name: row.company_name, slug, trial_ends_at: trialEnds })
      .select('id')
      .single()
    if (coErr || !company) {
      console.error('company create failed', coErr)
      throw new Error('Could not create workspace')
    }

    // Create or find auth user
    let userId: string | null = null
    const listRes: any = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = listRes?.data?.users?.find((u: any) => (u.email ?? '').toLowerCase() === row.work_email.toLowerCase())
    if (existing) {
      userId = existing.id
    } else {
      const created: any = await supabaseAdmin.auth.admin.createUser({
        email: row.work_email,
        email_confirm: true,
        user_metadata: { full_name: row.full_name },
      })
      if (created?.error || !created?.data?.user) {
        console.error('user create failed', created?.error)
        throw new Error('Could not create user account')
      }
      userId = created.data.user.id
    }

    // Add to company (admin role in that workspace)
    await supabaseAdmin.from('company_members').upsert({ company_id: company.id, user_id: userId! }, { onConflict: 'company_id,user_id' })
    await supabaseAdmin.from('user_roles').upsert({ user_id: userId!, role: 'admin' }, { onConflict: 'user_id,role' })

    // Magic link
    let signInUrl: string | undefined
    try {
      const link: any = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: row.work_email,
        options: { redirectTo: `${data.origin.replace(/\/+$/, '')}/dashboard` },
      })
      signInUrl = link?.data?.properties?.action_link
    } catch (e) {
      console.warn('magic link generation failed', e)
    }

    await supabaseAdmin
      .from('trial_requests')
      .update({
        status: 'approved',
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        created_company_id: company.id,
        created_user_id: userId,
        trial_ends_at: trialEnds,
      })
      .eq('id', row.id)

    await sendTrialNotice(supabaseAdmin, {
      to: row.work_email,
      subject: 'Your Lavisho TT trial is ready',
      title: 'Welcome to Lavisho TT',
      greeting: `Hi ${row.full_name.split(' ')[0]},`,
      intro: `Your 7-day trial for ${row.company_name} has been approved.`,
      bodyText: signInUrl
        ? 'Use the sign-in link below to open your new workspace. It signs you in without a password.'
        : `Sign in at ${data.origin.replace(/\/+$/, '')}/auth using your email. If you don't have a password yet, use "Forgot password" to set one.`,
      ctaLabel: signInUrl ? 'Sign in to Lavisho TT' : undefined,
      ctaUrl: signInUrl,
      footNote: `Your trial ends on ${new Date(trialEnds).toDateString()}.`,
      label: 'trial-approved',
      idempotencyKey: `trial-approved-${row.id}`,
    })

    return { ok: true }
  })

export const rejectTrialRequest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid(), reason: z.string().trim().max(600).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { sendTrialNotice } = await import('./emails.server')

    const { data: row } = await supabaseAdmin
      .from('trial_requests')
      .select('id, status, work_email, full_name, company_name')
      .eq('id', data.requestId)
      .maybeSingle()
    if (!row) throw new Error('Trial request not found')
    if (row.status === 'rejected') return { ok: true, alreadyRejected: true }

    await supabaseAdmin
      .from('trial_requests')
      .update({
        status: 'rejected',
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: data.reason || null,
      })
      .eq('id', row.id)

    await sendTrialNotice(supabaseAdmin, {
      to: row.work_email,
      subject: 'Update on your Lavisho TT trial request',
      title: 'Trial request update',
      greeting: `Hi ${row.full_name.split(' ')[0]},`,
      intro: `Thank you for your interest in Lavisho TT for ${row.company_name}.`,
      bodyText: data.reason
        ? `Unfortunately we're not able to activate your trial at this time.\n\nReason: ${data.reason}\n\nIf you believe this is a mistake, reply to this email and our team will take another look.`
        : `Unfortunately we're not able to activate your trial at this time. If you believe this is a mistake, reply to this email and our team will take another look.`,
      label: 'trial-rejected',
      idempotencyKey: `trial-rejected-${row.id}`,
    })

    return { ok: true }
  })

export const listTrialRequests = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data, error } = await supabaseAdmin
      .from('trial_requests')
      .select('id, full_name, work_email, company_name, phone, country, team_size, notes, status, email_verified_at, rejection_reason, trial_ends_at, created_at, reviewed_at')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) throw new Error(error.message)
    return data ?? []
  })
