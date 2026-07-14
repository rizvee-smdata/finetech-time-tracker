import * as React from 'react'
import { render } from '@react-email/components'
import { template as trialNoticeTemplate } from '@/lib/email-templates/trial-notice'

const SITE_NAME = 'Lavisho TT'
const SENDER_DOMAIN = 'notify.lavishoemail.com'
const FROM_DOMAIN = 'notify.lavishoemail.com'

function genToken(): string {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
}

/**
 * Renders the trial-notice template and enqueues it directly through the
 * `enqueue_email` RPC using the service-role client. Used for both public
 * (email verification) and admin-triggered (approve/reject) trial notices,
 * bypassing the JWT-guarded /lovable/email/transactional/send route.
 */
export async function sendTrialNotice(
  supabaseAdmin: any,
  args: {
    to: string
    subject: string
    title: string
    greeting?: string
    intro?: string
    bodyText?: string
    ctaLabel?: string
    ctaUrl?: string
    footNote?: string
    label: string
    idempotencyKey?: string
  },
) {
  const messageId = crypto.randomUUID()
  const props = {
    subject: args.subject,
    title: args.title,
    greeting: args.greeting,
    intro: args.intro,
    bodyText: args.bodyText,
    ctaLabel: args.ctaLabel,
    ctaUrl: args.ctaUrl,
    footNote: args.footNote,
  }
  const el = React.createElement(trialNoticeTemplate.component, props)
  const html = await render(el)
  const text = await render(el, { plainText: true })

  const normalized = args.to.toLowerCase()

  // Ensure unsubscribe token exists (queue dispatcher expects one)
  let unsubscribeToken: string | null = null
  const { data: existing } = await supabaseAdmin
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalized)
    .maybeSingle()
  if (existing && !existing.used_at) {
    unsubscribeToken = existing.token
  } else if (!existing) {
    unsubscribeToken = genToken()
    await supabaseAdmin
      .from('email_unsubscribe_tokens')
      .upsert({ token: unsubscribeToken, email: normalized }, { onConflict: 'email', ignoreDuplicates: true })
    const { data: stored } = await supabaseAdmin
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalized)
      .maybeSingle()
    if (stored?.token) unsubscribeToken = stored.token
  }

  await supabaseAdmin.from('email_send_log').insert({
    message_id: messageId,
    template_name: 'trial-notice',
    recipient_email: args.to,
    status: 'pending',
  })

  const { error } = await supabaseAdmin.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: args.to,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: args.subject,
      html,
      text,
      purpose: 'transactional',
      label: args.label,
      idempotency_key: args.idempotencyKey ?? messageId,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })
  if (error) {
    console.error('sendTrialNotice enqueue failed', error)
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'trial-notice',
      recipient_email: args.to,
      status: 'failed',
      error_message: error.message ?? 'enqueue failed',
    })
    throw new Error('Failed to send email')
  }
  return { messageId }
}
