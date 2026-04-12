/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'

const LOGO_URL = 'https://yfrwpqpafoquajfxlbhk.supabase.co/storage/v1/object/public/email-assets/stackseam-logo.png'

interface RecoveryEmailProps { siteName: string; confirmationUrl: string }

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your password for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <img src={LOGO_URL} alt="StackSeam" width="140" height="auto" style={logo} />
        <Heading style={h1}>Reset your password</Heading>
        <Text style={text}>We received a request to reset your password for {siteName}. Click the button below to choose a new password.</Text>
        <Button style={button} href={confirmationUrl}>Reset Password</Button>
        <Text style={footer}>If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.</Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '560px', margin: '0 auto' }
const logo = { marginBottom: '24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1e293b', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#64748b', lineHeight: '1.6', margin: '0 0 25px' }
const button = { backgroundColor: 'hsl(38, 92%, 50%)', color: '#1a1a2e', fontSize: '15px', fontWeight: '600' as const, borderRadius: '8px', padding: '12px 28px', textDecoration: 'none' }
const footer = { fontSize: '13px', color: '#94a3b8', margin: '30px 0 0' }
