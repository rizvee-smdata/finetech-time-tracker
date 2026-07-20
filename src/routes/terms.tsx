import { createFileRoute, Link } from "@tanstack/react-router";
import { APP_NAME, APP_LEGAL_ENTITY, APP_SUPPORT_EMAIL } from "@/lib/branding";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: `Terms of Service — ${APP_NAME}` },
      { name: "description", content: `Terms of Service for ${APP_NAME}.` },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 prose prose-slate">
      <p><Link to="/" className="text-sm text-muted-foreground">← Back home</Link></p>
      <h1>Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Last updated: {new Date().toISOString().slice(0, 10)}</p>

      <p>These Terms of Service ("Terms") govern your access to and use of {APP_NAME} (the "Service"),
      operated by {APP_LEGAL_ENTITY}. By creating an account or using the Service, you agree to these Terms.</p>

      <h2>1. Accounts and workspaces</h2>
      <p>You are responsible for maintaining the confidentiality of your credentials and for all activity
      that occurs under your account. Each workspace ("Company") is administered by its designated admins.</p>

      <h2>2. Acceptable use</h2>
      <p>You will not misuse the Service, attempt to disrupt or gain unauthorized access, upload malicious
      content, or use it in violation of law.</p>

      <h2>3. Subscription and trial</h2>
      <p>Trial workspaces expire 7 days after approval. Paid plans are billed per the invoice or subscription
      you accept. Fees are non-refundable except where required by law.</p>

      <h2>4. Data ownership</h2>
      <p>You retain ownership of Customer Data you upload. We process it solely to provide the Service, as
      described in our <Link to="/privacy">Privacy Policy</Link> and <Link to="/dpa">Data Processing Addendum</Link>.</p>

      <h2>5. Service availability</h2>
      <p>We aim for high availability but do not guarantee uninterrupted access. Scheduled maintenance may occur.</p>

      <h2>6. Termination</h2>
      <p>You may cancel at any time. We may suspend or terminate access for breach of these Terms. Upon
      termination, you may export your data for 30 days, after which it may be deleted.</p>

      <h2>7. Warranties and liability</h2>
      <p>THE SERVICE IS PROVIDED "AS IS". TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES
      AND OUR AGGREGATE LIABILITY IS LIMITED TO FEES PAID IN THE PRIOR 12 MONTHS.</p>

      <h2>8. Changes</h2>
      <p>We may update these Terms; material changes will be notified via email or in-app.</p>

      <h2>9. Contact</h2>
      <p>Questions? Email <a href={`mailto:${APP_SUPPORT_EMAIL}`}>{APP_SUPPORT_EMAIL}</a>.</p>

      <p className="text-xs text-muted-foreground">This is a template. Have your counsel review before relying on it.</p>
    </div>
  );
}
