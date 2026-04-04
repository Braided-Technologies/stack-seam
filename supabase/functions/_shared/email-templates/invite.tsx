/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

const LOGO_URL = 'https://ivmbbnmmioeufmxtvsgs.supabase.co/storage/v1/object/public/email-assets/stackseam-logo.png'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to join StackSeam</Preview>
    <Body style={main}>
      <Container style={card}>
        <Section style={logoSection}>
          <Img src={LOGO_URL} alt="StackSeam" width="140" height="auto" style={logo} />
        </Section>
        <Hr style={divider} />
        <Heading style={h1}>You're Invited! 🚀</Heading>
        <Text style={text}>
          Your team is using StackSeam to manage their IT stack. Click below to accept the invitation and join your organization.
        </Text>
        <Section style={buttonSection}>
          <Button style={button} href={confirmationUrl}>
            Accept Invitation
          </Button>
        </Section>
        <Text style={textSmall}>
          If you weren't expecting this invitation, you can safely ignore this email.
        </Text>
        <Hr style={divider} />
        <Text style={footerBrand}>
          © StackSeam — IT Stack Intelligence for MSPs
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = {
  backgroundColor: '#f4f4f5',
  fontFamily: 'Outfit, system-ui, sans-serif',
  padding: '40px 0',
}
const card = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  padding: '40px 32px',
  maxWidth: '480px',
  margin: '0 auto',
  border: '1px solid #e4e4e7',
}
const logoSection = { textAlign: 'center' as const, marginBottom: '8px' }
const logo = { margin: '0 auto' }
const divider = { borderColor: '#e4e4e7', margin: '20px 0' }
const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#1a1f36',
  margin: '0 0 12px',
  textAlign: 'center' as const,
}
const text = {
  fontSize: '15px',
  color: '#6b7280',
  lineHeight: '1.6',
  margin: '0 0 20px',
  textAlign: 'center' as const,
}
const textSmall = {
  fontSize: '13px',
  color: '#9ca3af',
  lineHeight: '1.5',
  margin: '0 0 16px',
  textAlign: 'center' as const,
}
const buttonSection = { textAlign: 'center' as const, margin: '8px 0 16px' }
const button = {
  backgroundColor: '#e8930c',
  color: '#1a1f36',
  fontSize: '15px',
  fontWeight: '600' as const,
  borderRadius: '8px',
  padding: '14px 28px',
  textDecoration: 'none',
  display: 'inline-block' as const,
}
const footerBrand = {
  fontSize: '11px',
  color: '#d1d5db',
  margin: '0',
  textAlign: 'center' as const,
}
