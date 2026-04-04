/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "StackSeam"
const LOGO_URL = 'https://ivmbbnmmioeufmxtvsgs.supabase.co/storage/v1/object/public/email-assets/stackseam-logo.png'

interface TeamInvitationProps {
  firstName?: string
  lastName?: string
  orgName?: string
  role?: string
  invitedByEmail?: string
  signupUrl?: string
}

const TeamInvitationEmail = ({
  firstName,
  lastName,
  orgName,
  role,
  invitedByEmail,
  signupUrl,
}: TeamInvitationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to join {orgName || 'an organization'} on {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <img src={LOGO_URL} alt={SITE_NAME} width="140" height="auto" style={logo} />
        <Heading style={h1}>
          You're invited to {SITE_NAME}
        </Heading>
        <Text style={text}>
          Hi{firstName ? ` ${firstName}` : ''},
        </Text>
        <Text style={text}>
          {invitedByEmail ? `${invitedByEmail} has` : 'You have been'} invited you to join{' '}
          <strong>{orgName || 'their organization'}</strong> on {SITE_NAME}
          {role ? ` as a ${role}` : ''}.
        </Text>
        <Text style={text}>
          To accept this invitation, create your account using the email address this invitation was sent to.
        </Text>
        <Button style={button} href={signupUrl || 'https://stack-map-nexus.lovable.app/auth'}>
          Create Your Account
        </Button>
        <Hr style={hr} />
        <Text style={footer}>
          If you weren't expecting this invitation, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TeamInvitationEmail,
  subject: (data: Record<string, any>) =>
    `You're invited to join ${data.orgName || 'an organization'} on StackSeam`,
  displayName: 'Team invitation',
  previewData: {
    firstName: 'Jane',
    lastName: 'Doe',
    orgName: 'Acme IT',
    role: 'member',
    invitedByEmail: 'admin@acme.com',
    signupUrl: 'https://stack-map-nexus.lovable.app/auth',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '560px', margin: '0 auto' }
const logo = { marginBottom: '24px' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#1e293b', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#64748b', lineHeight: '1.6', margin: '0 0 16px' }
const button = {
  backgroundColor: 'hsl(38, 92%, 50%)',
  color: '#1a1a2e',
  padding: '12px 28px',
  borderRadius: '8px',
  fontSize: '15px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  display: 'inline-block' as const,
  margin: '8px 0 24px',
}
const hr = { borderColor: '#e2e8f0', margin: '24px 0' }
const footer = { fontSize: '13px', color: '#94a3b8', lineHeight: '1.5', margin: '0' }
