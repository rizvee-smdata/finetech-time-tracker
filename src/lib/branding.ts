// Central branding constants. Override at build time via VITE_APP_NAME /
// VITE_APP_TAGLINE / VITE_APP_LEGAL_ENTITY / VITE_APP_SUPPORT_EMAIL so the
// same code can be white-labelled per-tenant deployment.
const env = import.meta.env;

export const APP_NAME: string = env.VITE_APP_NAME || "Lavisho TT";
export const APP_TAGLINE: string =
  env.VITE_APP_TAGLINE || "The all-in-one CRM built for field sales teams";
export const APP_LEGAL_ENTITY: string =
  env.VITE_APP_LEGAL_ENTITY || APP_NAME;
export const APP_SUPPORT_EMAIL: string =
  env.VITE_APP_SUPPORT_EMAIL || "support@lavishott.cloud";
export const APP_PRIVACY_URL: string = "/privacy";
export const APP_TERMS_URL: string = "/terms";
export const APP_DPA_URL: string = "/dpa";
