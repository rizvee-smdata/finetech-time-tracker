import * as React from 'react'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  title?: string
  greeting?: string
  intro?: string
  bodyText?: string
  ctaLabel?: string
  ctaUrl?: string
  footNote?: string
  subject?: string
}

const TrialNotice = ({
  title = 'Lavisho TT',
  greeting = 'Hello,',
  intro = '',
  bodyText = '',
  ctaLabel,
  ctaUrl,
  footNote,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{intro || title}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{title}</Heading>
        <Text style={text}>{greeting}</Text>
        {intro && <Text style={text}>{intro}</Text>}
        {bodyText && bodyText.split('\n\n').map((p, i) => (
          <Text key={i} style={text}>{p}</Text>
        ))}
        {ctaLabel && ctaUrl && (
          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button href={ctaUrl} style={button}>{ctaLabel}</Button>
            <Text style={small}>
              Or paste this link into your browser:<br />
              <a href={ctaUrl} style={link}>{ctaUrl}</a>
            </Text>
          </Section>
        )}
        <Hr style={hr} />
        <Text style={footer}>
          {footNote ?? 'You are receiving this because a trial request was submitted for Lavisho TT.'}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TrialNotice,
  subject: (d: Record<string, any>) => d.subject ?? 'Lavisho TT',
  displayName: 'Trial notice',
  previewData: {
    title: 'Verify your email',
    greeting: 'Hi Jane,',
    intro: 'Please confirm your email to complete your Lavisho TT trial request.',
    ctaLabel: 'Verify email',
    ctaUrl: 'https://example.com/trial/verify?token=abc',
  },
} satisfies TemplateEntry

export default TrialNotice

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0b0f17', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 14px' }
const small = { fontSize: '12px', color: '#666', margin: '16px 0 0', wordBreak: 'break-all' as const }
const link = { color: '#2563eb' }
const button = {
  backgroundColor: '#0b0f17',
  color: '#ffffff',
  padding: '12px 22px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: '14px',
}
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: '20px 0 0' }
