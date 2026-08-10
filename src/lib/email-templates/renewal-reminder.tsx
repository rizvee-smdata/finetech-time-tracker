import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  managerName?: string
  customerName?: string
  companyName?: string | null
  renewalDate?: string
  daysToRenewal?: number
  value?: string
  leadUrl?: string
}

const RenewalReminderEmail = ({
  managerName,
  customerName,
  companyName,
  renewalDate,
  daysToRenewal,
  value,
  leadUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Renewal in ${daysToRenewal ?? 0} days — ${customerName ?? 'a customer'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Hi {managerName ?? 'there'},</Heading>
        <Text style={text}>
          The renewal for <strong>{customerName ?? 'your account'}</strong>
          {companyName ? ` (${companyName})` : ''} is due on <strong>{renewalDate}</strong> —
          that&apos;s in {daysToRenewal ?? 0} day{daysToRenewal === 1 ? '' : 's'}.
        </Text>
        {value && <Text style={text}>Expected renewal value: <strong>{value}</strong></Text>}
        <Text style={text}>
          Please confirm the renewal plan with the customer and update the deal so the pipeline stays accurate.
        </Text>
        {leadUrl && (
          <Button href={leadUrl} style={button}>
            Open the deal
          </Button>
        )}
        <Text style={footer}>You receive this every two weeks while a renewal is within 60 days.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: RenewalReminderEmail,
  subject: (d: Record<string, any>) =>
    `Renewal in ${d.daysToRenewal ?? 0} days — ${d.customerName ?? 'account renewal'}`,
  displayName: 'Renewal approaching',
  previewData: {
    managerName: 'Sazzad',
    customerName: 'Trust Bank PLC',
    companyName: 'Trust Bank PLC',
    renewalDate: '2026-10-01',
    daysToRenewal: 45,
    value: 'USD 12,000',
    leadUrl: 'https://example.com/crm/123',
  },
} satisfies TemplateEntry

export default RenewalReminderEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#000', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 16px' }
const button = {
  backgroundColor: '#111827',
  color: '#ffffff',
  padding: '10px 18px',
  borderRadius: '6px',
  fontSize: '14px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = { fontSize: '12px', color: '#999', margin: '24px 0 0' }
