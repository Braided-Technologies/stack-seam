import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import stackseamIcon from '@/assets/stackseam-icon.svg';

const LAST_UPDATED = 'April 13, 2026';
const COMPANY = 'Braided Technologies';
const PRODUCT = 'StackSeam';
const CONTACT_EMAIL = 'nils@braided.tech';
const SITE = 'https://stackseam.tech';

function PrivacyPolicy() {
  return (
    <article className="prose prose-sm dark:prose-invert max-w-none">
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground"><em>Last updated: {LAST_UPDATED}</em></p>

      <h2>1. Who we are</h2>
      <p>
        {PRODUCT} ("we", "our", "us") is a service operated by {COMPANY}. This Privacy Policy describes how we collect, use, store, and share information when you use {PRODUCT} (the "Service") at <a href={SITE}>{SITE}</a>.
      </p>

      <h2>2. Information we collect</h2>
      <h3>Information you provide</h3>
      <ul>
        <li><strong>Account information:</strong> first name, last name, email address, password (hashed), and the organization you create or join.</li>
        <li><strong>Stack data:</strong> the applications, integrations, contracts, costs, contacts, and notes you add to your IT stack.</li>
        <li><strong>Support and feedback:</strong> any messages, screenshots, or feedback you submit to us.</li>
        <li><strong>Optional API keys:</strong> if you choose to bring your own keys for AI providers (OpenAI, Anthropic, etc.), we store them encrypted at rest using Supabase Vault.</li>
      </ul>
      <h3>Information collected automatically</h3>
      <ul>
        <li><strong>Authentication metadata:</strong> sign-in timestamps, IP address (transient), and OAuth provider IDs (when you use Google or Microsoft sign-in).</li>
        <li><strong>Usage logs:</strong> we log AI query counts per organization for rate limiting and operational monitoring.</li>
      </ul>

      <h2>3. How we use your information</h2>
      <ul>
        <li>To provide and operate the Service.</li>
        <li>To send you transactional and authentication emails (confirmations, password resets, invitations).</li>
        <li>To enforce usage limits and prevent abuse.</li>
        <li>To improve the Service and respond to your support requests.</li>
        <li>To comply with legal obligations.</li>
      </ul>
      <p>
        We do <strong>not</strong> sell your personal information. We do not use your stack data to train AI models.
      </p>

      <h2>4. Sub-processors and third parties</h2>
      <p>We use the following sub-processors to operate {PRODUCT}:</p>
      <ul>
        <li><strong>Supabase</strong> — database, authentication, storage, and edge functions hosting (US region).</li>
        <li><strong>Vercel</strong> — frontend hosting and CDN.</li>
        <li><strong>OpenAI</strong> — AI features (research assistant, integration discovery, contract scanning). We send only the minimum context needed for each query.</li>
        <li><strong>Tavily</strong> — web search API used during integration discovery.</li>
        <li><strong>Resend</strong> — transactional email delivery.</li>
        <li><strong>Google &amp; Microsoft</strong> — optional OAuth identity providers.</li>
      </ul>
      <p>Each sub-processor is contractually obligated to handle data securely. Data Processing Agreements are available on request.</p>

      <h2>5. Data retention</h2>
      <p>
        We retain your account information and stack data for as long as your account is active. If you delete your account, we delete all associated personal data within 30 days, except where retention is required by law.
      </p>
      <p>
        Authentication and audit logs are retained for up to 90 days. Email send logs are retained for up to 180 days for delivery troubleshooting.
      </p>

      <h2>6. Your rights (GDPR / CCPA / similar)</h2>
      <p>If you are located in the EU, UK, California, or another jurisdiction with data-protection laws, you have the following rights:</p>
      <ul>
        <li><strong>Access:</strong> request a copy of the personal data we hold about you.</li>
        <li><strong>Rectification:</strong> correct inaccurate information (you can edit your profile in Settings).</li>
        <li><strong>Erasure:</strong> request deletion of your account and associated data.</li>
        <li><strong>Portability:</strong> request your data in a machine-readable format.</li>
        <li><strong>Objection / restriction:</strong> object to or restrict certain processing.</li>
      </ul>
      <p>
        You can delete your account at any time from <strong>Settings &gt; Profile &gt; Delete Account</strong>. For other requests, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We will respond within 30 days.
      </p>

      <h2>7. International data transfers</h2>
      <p>
        Our infrastructure is hosted in the United States. If you access {PRODUCT} from outside the US, your information will be transferred to and processed in the US. We rely on Standard Contractual Clauses with our sub-processors where required.
      </p>

      <h2>8. Security</h2>
      <p>
        We use HTTPS for all traffic, encrypt sensitive secrets at rest with Supabase Vault, enforce row-level security on every database table, and follow the principle of least privilege for service accounts. No system is perfectly secure; please report vulnerabilities to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>9. Cookies</h2>
      <p>
        We use only essential cookies required for authentication. We do not use tracking, advertising, or analytics cookies.
      </p>

      <h2>10. Children</h2>
      <p>
        {PRODUCT} is not intended for individuals under 16. We do not knowingly collect data from children.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. Material changes will be communicated by email or through the Service. The "Last updated" date at the top reflects the most recent revision.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about this policy or your data? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </article>
  );
}

function TermsOfService() {
  return (
    <article className="prose prose-sm dark:prose-invert max-w-none">
      <h1>Terms of Service</h1>
      <p className="text-muted-foreground"><em>Last updated: {LAST_UPDATED}</em></p>

      <h2>1. Acceptance</h2>
      <p>
        By accessing or using {PRODUCT} (the "Service"), operated by {COMPANY}, you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.
      </p>

      <h2>2. The Service</h2>
      <p>
        {PRODUCT} provides tools for managed service providers and IT teams to map their software stack, track integrations between tools, and manage costs and contracts. Features and pricing may change at our discretion.
      </p>

      <h2>3. Accounts</h2>
      <ul>
        <li>You must provide accurate registration information.</li>
        <li>You are responsible for keeping your password secure.</li>
        <li>You are responsible for all activity that occurs under your account.</li>
        <li>You must be at least 16 years old to use the Service.</li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for any unlawful purpose.</li>
        <li>Attempt to gain unauthorized access to other organizations' data.</li>
        <li>Reverse-engineer, decompile, or attempt to extract source code beyond what is publicly available.</li>
        <li>Use automated means to scrape or stress the Service.</li>
        <li>Submit content that is infringing, defamatory, or malicious.</li>
        <li>Resell or sublicense the Service without our written consent.</li>
      </ul>

      <h2>5. Your content</h2>
      <p>
        You retain all rights to the data you submit ("Your Content"). You grant us a limited license to host, store, and display Your Content as necessary to operate the Service. You are responsible for ensuring you have the right to submit Your Content.
      </p>

      <h2>6. AI features</h2>
      <p>
        {PRODUCT} uses AI providers (OpenAI by default, or providers you configure) to power research, discovery, and document scanning features. AI output may be inaccurate or incomplete; verify before relying on it for important decisions. We do not warrant the accuracy of AI-generated content.
      </p>

      <h2>7. Service availability</h2>
      <p>
        We strive to keep the Service available but do not guarantee uninterrupted access. We may perform maintenance, updates, or feature changes without notice.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, {COMPANY.toUpperCase()} SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY. OUR TOTAL LIABILITY FOR ANY CLAIMS RELATED TO THE SERVICE SHALL NOT EXCEED THE GREATER OF $100 OR THE AMOUNT YOU PAID US IN THE PRECEDING 12 MONTHS.
      </p>

      <h2>10. Termination</h2>
      <p>
        You may delete your account at any time from Settings. We may suspend or terminate your access for violations of these Terms or for any other reason, with or without notice. Upon termination, your right to use the Service ceases immediately.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may modify these Terms at any time. Material changes will be communicated by email or through the Service. Continued use after a change constitutes acceptance.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These Terms are governed by the laws of the United States and the state in which {COMPANY} is registered, without regard to conflict-of-law principles.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </article>
  );
}

export default function Legal() {
  const { doc } = useParams<{ doc: string }>();
  const isPrivacy = doc === 'privacy';

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src={stackseamIcon} alt="StackSeam" className="h-7 w-7" />
            <span className="font-display font-bold">StackSeam</span>
          </Link>
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">
        {isPrivacy ? <PrivacyPolicy /> : <TermsOfService />}
        <div className="mt-8 pt-4 border-t flex gap-4 text-sm text-muted-foreground">
          <Link to="/legal/privacy" className="hover:text-foreground">Privacy Policy</Link>
          <Link to="/legal/terms" className="hover:text-foreground">Terms of Service</Link>
        </div>
      </main>
    </div>
  );
}
