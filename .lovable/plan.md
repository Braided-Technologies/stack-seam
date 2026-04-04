
## Add MFA, Google OAuth & Email Cleanup

### 1. Remove emojis from auth emails
Quick fix — remove 🎉 from signup and 🚀 from invite templates.

### 2. Enable Google OAuth
Lovable Cloud has managed Google OAuth built in — no API keys needed. We'll:
- Configure the Google provider
- Add a "Sign in with Google" button to the Auth page
- This satisfies the "formal auth" requirement immediately

### 3. Add TOTP-based MFA (Authenticator App)
Supabase natively supports TOTP MFA (Google Authenticator, Authy, etc.). We'll:
- Create an MFA setup page that shows a QR code for enrolling an authenticator app
- Create an MFA verification page for entering the 6-digit code on login
- Update the auth flow: after login, check if MFA is enrolled → if yes, require verification; if no, redirect to setup

### 4. Enforce MFA setup on first login / invitation acceptance
- After accepting an invitation and landing in the app for the first time, redirect users to the MFA setup page
- Users must complete MFA enrollment before accessing the main app
- Store MFA enrollment status check via Supabase's built-in `auth.mfa.listFactors()`

### Platform notes
- **Microsoft OAuth** is not currently available on Lovable Cloud — only Google and Apple are supported. We can add it when it becomes available.
- **Phone/SMS MFA** requires SMS provider configuration. We can set this up later if needed, but TOTP (authenticator app) is more secure and works immediately.
- **Email-based MFA** isn't a standard option — the authenticator app approach is the industry standard.

### Files to create/modify
- `src/pages/Auth.tsx` — add Google sign-in button
- `src/pages/MfaSetup.tsx` — new page for QR code enrollment
- `src/pages/MfaVerify.tsx` — new page for code entry on login
- `src/contexts/AuthContext.tsx` — add MFA state checks
- `src/App.tsx` — add MFA routes and enforcement logic
- 6 email template files — remove emojis
