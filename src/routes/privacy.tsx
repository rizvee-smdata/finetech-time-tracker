import { createFileRoute, Link } from "@tanstack/react-router";
import { APP_NAME, APP_LEGAL_ENTITY, APP_SUPPORT_EMAIL } from "@/lib/branding";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: `Privacy Policy — ${APP_NAME}` },
      { name: "description", content: `How ${APP_NAME} collects and uses your data.` },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 prose prose-slate">
      <p><Link to="/" className="text-sm text-muted-foreground">← Back home</Link></p>
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: {new Date().toISOString().slice(0, 10)}</p>

      <p>{APP_LEGAL_ENTITY} ("we", "us") operates {APP_NAME}. This policy explains what data we collect,
      how we use it, and your rights.</p>

      <h2>1. Data we collect</h2>
      <ul>
        <li><strong>Account data:</strong> name, work email, company, role.</li>
        <li><strong>Customer Data:</strong> information you enter into the CRM about your leads, customers, deals, visits and tasks.</li>
        <li><strong>Usage data:</strong> pages viewed, feature interactions, error logs (for reliability).</li>
        <li><strong>Location:</strong> when you use GPS check-in, we store the coordinates and any selfie you provide.</li>
      </ul>

      <h2>2. How we use it</h2>
      <p>To operate the Service, authenticate you, provide support, prevent abuse, and improve reliability.</p>

      <h2>3. Sharing</h2>
      <p>We do not sell your data. We share it only with subprocessors necessary to run the Service
      (hosting, email delivery, AI providers) under confidentiality obligations. See our
      <Link to="/dpa"> Data Processing Addendum</Link>.</p>

      <h2>4. Retention</h2>
      <p>We keep Customer Data for as long as your workspace is active, plus 30 days after termination to
      allow export. Audit logs and backups may be retained longer for security.</p>

      <h2>5. Your rights</h2>
      <p>Depending on your jurisdiction, you may request access, correction, export, or deletion of your
      personal data. Workspace admins can export or delete their workspace's data from Settings.</p>

      <h2>6. Security</h2>
      <p>Data is encrypted in transit and at rest. Row-level access controls scope every tenant's data.</p>

      <h2>7. Contact</h2>
      <p>Data requests: <a href={`mailto:${APP_SUPPORT_EMAIL}`}>{APP_SUPPORT_EMAIL}</a>.</p>

      <p className="text-xs text-muted-foreground">This is a template. Have your counsel review before relying on it.</p>
    </div>
  );
}
