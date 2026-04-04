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
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

const LOGO_URL = 'https://ivmbbnmmioeufmxtvsgs.supabase.co/storage/v1/object/public/email-assets/stackseam-logo.png'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to StackSeam — confirm your email to get started</Preview>
    <Body style={main}>
      <Container style={card}>
        <Section style={logoSection}>
          <Img src={LOGO_URL} alt="StackSeam" width="140" height="auto" style={logo} />
        </Section>
        <Hr style={divider} />
        <Heading style={h1}>Welcome to StackSeam! 🎉</Heading>
        <Text style={text}>
          You're one step away from managing your IT stack like a pro. Confirm your email address to activate your account.
        </Text>
        <Text style={textSmall}>
          Email: <strong>{recipient}</strong>
        </Text>
        <Section style={buttonSection}>
          <Button style={button} href={confirmationUrl}>
            Verify My Email
          </Button>
        </Section>
        <Hr style={divider} />
        <Text style={footer}>
          If you didn't sign up for StackSeam, you can safely ignore this email.
        </Text>
        <Text style={footerBrand}>
          © StackSeam — IT Stack Intelligence for MSPs
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

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
  fontSize: '14px',
  color: '#6b7280',
  lineHeight: '1.5',
  margin: '0 0 24px',
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
const footer = {
  fontSize: '12px',
  color: '#9ca3af',
  margin: '0 0 4px',
  textAlign: 'center' as const,
}
const footerBrand = {
  fontSize: '11px',
  color: '#d1d5db',
  margin: '0',
  textAlign: 'center' as const,
}
