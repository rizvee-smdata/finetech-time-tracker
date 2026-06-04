import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  recipientName?: string
  repName?: string
  message?: string
  signature?: string
}

const FollowupEmail = ({ recipientName, repName, message, signature }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{message ? message.slice(0, 90) : 'Following up'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Hi {recipientName ?? 'there'},</Heading>
        {(message ?? '').split('\n\n').map((p, i) => (
          <Text key={i} style={text}>{p}</Text>
        ))}
        <Text style={text}>Best regards,<br />{repName ?? 'Your sales team'}</Text>
        {signature && <Text style={footer}>{signature}</Text>}
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: FollowupEmail,
  subject: (d: Record<string, any>) => d.subject ?? 'Following up',
  displayName: 'Sales follow-up',
  previewData: {
    recipientName: 'Karim',
    repName: 'Sazzad',
    message: 'Just checking in on our last conversation about the firewall renewal.\n\nWould Thursday work for a quick call?',
    signature: 'SmartData Limited',
  },
} satisfies TemplateEntry

export default FollowupEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#000', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 16px' }
const footer = { fontSize: '12px', color: '#999', margin: '20px 0 0' }
