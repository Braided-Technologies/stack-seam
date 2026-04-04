/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
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

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your StackSeam verification code</Preview>
    <Body style={main}>
      <Container style={card}>
        <Section style={logoSection}>
          <Img src={LOGO_URL} alt="StackSeam" width="140" height="auto" style={logo} />
        </Section>
        <Hr style={divider} />
        <Heading style={h1}>Verification Code</Heading>
        <Text style={text}>
          Use the code below to confirm your identity on StackSeam:
        </Text>
        <Section style={codeContainer}>
          <Text style={codeStyle}>{token}</Text>
        </Section>
        <Text style={textSmall}>
          This code will expire shortly. If you didn't request this, you can safely ignore this email.
        </Text>
        <Hr style={divider} />
        <Text style={footerBrand}>
          © StackSeam — IT Stack Intelligence for MSPs
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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
const codeContainer = {
  textAlign: 'center' as const,
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  padding: '16px',
  margin: '0 0 20px',
  border: '1px solid #e4e4e7',
}
const codeStyle = {
  fontFamily: 'DM Mono, Courier, monospace',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: '#1a1f36',
  letterSpacing: '4px',
  margin: '0',
}
const footerBrand = {
  fontSize: '11px',
  color: '#d1d5db',
  margin: '0',
  textAlign: 'center' as const,
}
