import { createFileRoute, Link } from "@tanstack/react-router";
import { APP_NAME, APP_LEGAL_ENTITY, APP_SUPPORT_EMAIL } from "@/lib/branding";

export const Route = createFileRoute("/dpa")({
  head: () => ({
    meta: [
      { title: `Data Processing Addendum — ${APP_NAME}` },
      { name: "description", content: `Data Processing Addendum for ${APP_NAME}.` },
    ],
  }),
  component: DpaPage,
});

function DpaPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 prose prose-slate">
      <p><Link to="/" className="text-sm text-muted-foreground">← Back home</Link></p>
      <h1>Data Processing Addendum (DPA)</h1>
      <p className="text-sm text-muted-foreground">Last updated: {new Date().toISOString().slice(0, 10)}</p>

      <p>This DPA forms part of the agreement between {APP_LEGAL_ENTITY} ("Processor") and the customer
      ("Controller") for the {APP_NAME} service.</p>

      <h2>1. Subject matter</h2>
      <p>Processor processes Customer Personal Data on behalf of the Controller solely to provide the Service.</p>

      <h2>2. Duration</h2>
      <p>For the term of the Controller's subscription plus 30 days for export.</p>

      <h2>3. Categories of data</h2>
      <p>Business contacts (name, email, phone, company), sales activity, geolocation from GPS check-ins,
      and any other content the Controller uploads.</p>

      <h2>4. Subprocessors</h2>
      <ul>
        <li>Cloud hosting provider (application runtime and database)</li>
        <li>Transactional email provider</li>
        <li>AI providers (for optional features like drafting and summarization)</li>
        <li>Payment provider (for billing only)</li>
      </ul>
      <p>Current subprocessor list is available on request. Controller will be notified of material changes.</p>

      <h2>5. Security</h2>
      <p>Encryption in transit (TLS) and at rest, row-level tenant isolation, least-privilege service roles,
      audit logs, regular backups.</p>

      <h2>6. Data subject requests</h2>
      <p>Processor will assist Controller in responding to data-subject rights requests within reasonable
      timeframes.</p>

      <h2>7. Deletion</h2>
      <p>On termination, Processor deletes Customer Data within 30 days unless retention is required by law.</p>

      <h2>8. International transfers</h2>
      <p>Where personal data is transferred across borders, appropriate safeguards (SCCs or equivalent) apply.</p>

      <h2>9. Contact</h2>
      <p>DPA execution requests: <a href={`mailto:${APP_SUPPORT_EMAIL}`}>{APP_SUPPORT_EMAIL}</a>.</p>

      <p className="text-xs text-muted-foreground">This is a template. Have your counsel review before relying on it.</p>
    </div>
  );
}
