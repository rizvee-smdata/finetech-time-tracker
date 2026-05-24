import type {
  Proposal,
  ProposalSection,
  ProposedProduct,
  SectionType,
} from "./types";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function mkSection(
  type: SectionType,
  title: string,
  content: string,
  order: number,
  locked = false,
): ProposalSection {
  return {
    id: uid(),
    type,
    title,
    content,
    aiGenerated: true,
    edited: false,
    locked,
    order,
  };
}

function product(
  name: string,
  description: string,
  qty: number,
  unitPrice: number,
  discount: number,
  days: number,
): ProposedProduct {
  const gross = qty * unitPrice;
  const total = gross - (gross * discount) / 100;
  return {
    id: uid(),
    name,
    description,
    quantity: qty,
    unitPrice,
    currency: "BDT",
    discount,
    totalPrice: total,
    implementationDays: days,
  };
}

export function seedProposals(): Proposal[] {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  const addDays = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return iso(d);
  };

  const jamuna: Proposal = {
    id: uid(),
    title: "Network Access Control Solution for Jamuna Bank",
    clientName: "Md. Rakib Hasan",
    clientCompany: "Jamuna Bank PLC",
    clientIndustry: "Banking",
    decisionMakerName: "Md. Rakib Hasan",
    decisionMakerTitle: "Head of IT Security",
    clientPainPoints: [
      "Unmanaged endpoints on core network",
      "Bangladesh Bank ICT guideline compliance",
      "BYOD policy enforcement",
    ],
    competitors: ["Cisco ISE", "Aruba ClearPass"],
    proposedProducts: [
      product("NAC Software License (5000 endpoints)", "Enterprise NAC platform license, 3-year term", 1, 3200000, 5, 0),
      product("Implementation Services", "Design, deployment, integration with AD/DHCP", 1, 900000, 0, 45),
      product("Premium Support (Y1)", "24×7 support with on-site escalation", 1, 400000, 0, 0),
    ],
    pricingMode: "fixed",
    showPricing: "yes",
    template: "enterprise_ict",
    tone: "formal",
    language: "english",
    sections: [
      mkSection("cover_page", "Network Access Control Solution", "<h1>Network Access Control Solution</h1><p><strong>Prepared for:</strong> Jamuna Bank PLC</p><p><strong>Prepared by:</strong> SmartData Limited</p>", 0, true),
      mkSection("executive_summary", "Executive Summary", "<p>Jamuna Bank requires a unified Network Access Control (NAC) platform to enforce identity-based access across 5,000+ endpoints, achieve Bangladesh Bank ICT guideline alignment, and bring BYOD under policy control. SmartData proposes an enterprise NAC deployment delivered in 45 days, with on-shore implementation and 24×7 premium support.</p>", 1, true),
      mkSection("problem_statement", "Problem Statement", "<p>Branches across the country onboard new endpoints faster than the central security team can audit them, leaving an expanding attack surface. Current 802.1X coverage is partial, BYOD is implicitly trusted, and contractor laptops connect without posture checks.</p>", 2),
      mkSection("proposed_solution", "Proposed Solution", "<p>A centrally managed NAC platform with role-based access, posture assessment, and guest portals. Integrates with Jamuna Bank's existing AD, DHCP and SIEM, enforcing dynamic VLAN assignment and quarantine for non-compliant devices.</p>", 3),
      mkSection("technical_architecture", "Technical Architecture", "<p>Active-active NAC appliances at DC and DR, RADIUS clustering, integration with Active Directory and Jamuna Bank's existing Fortinet edge. Posture agents on managed endpoints; agentless profiling for IoT.</p>", 4),
      mkSection("implementation_plan", "Implementation Plan", "<p>45-day phased rollout: Week 1 — Discovery; Weeks 2-3 — Design &amp; PoC; Weeks 4-5 — Pilot at HO; Week 6 — Branch rollout; Week 7 — UAT and handover.</p>", 5),
      mkSection("pricing_table", "Commercial Proposal", "<p>See pricing table.</p>", 6, true),
      mkSection("call_to_action", "Next Steps", "<p>We propose a 30-minute technical alignment workshop next week to finalize scope. Please countersign this proposal to initiate the PO process.</p>", 7, true),
    ],
    status: "sent",
    createdAt: addDays(-21),
    updatedAt: addDays(-3),
    sentAt: addDays(-3),
    version: 2,
    history: [],
    metadata: {
      validUntil: addDays(30),
      preparedBy: "Tanvir Ahmed",
      referenceNumber: "SDL-2026-0042",
      confidentiality: "confidential",
    },
    additionalInstructions: "Emphasize Bangladesh Bank ICT guideline alignment.",
    executiveOneLiner: "Bring every endpoint under policy in 45 days — without disrupting branch operations.",
    proposalStrengths: ["On-shore L3 support", "Pre-built BB ICT compliance mapping", "Bundled premium support"],
  };

  const square: Proposal = {
    id: uid(),
    title: "Endpoint Security Platform for Square Pharmaceuticals",
    clientName: "Nusrat Jahan",
    clientCompany: "Square Pharmaceuticals PLC",
    clientIndustry: "Manufacturing",
    decisionMakerName: "Nusrat Jahan",
    decisionMakerTitle: "CISO",
    clientPainPoints: ["Ransomware exposure on OT-adjacent endpoints", "Lack of EDR telemetry", "GxP audit findings"],
    competitors: ["CrowdStrike", "SentinelOne"],
    proposedProducts: [
      product("EDR Platform License (2500 endpoints)", "Next-gen EDR with managed detection", 1, 2200000, 10, 0),
      product("Professional Services", "Deployment, tuning, playbook engineering", 1, 700000, 0, 30),
    ],
    pricingMode: "subscription",
    showPricing: "yes",
    template: "cybersecurity",
    tone: "consultative",
    language: "english",
    sections: [
      mkSection("cover_page", "Endpoint Security Platform", "<h1>Endpoint Security Platform</h1><p><strong>Prepared for:</strong> Square Pharmaceuticals PLC</p>", 0, true),
      mkSection("executive_summary", "Executive Summary", "<p>Square Pharma needs measurable ransomware risk reduction across 2,500 endpoints with auditable telemetry for GxP. We propose a managed EDR rollout with 30-day onboarding and joint SOC playbooks.</p>", 1, true),
      mkSection("problem_statement", "Problem Statement", "<p>Recent audit findings flagged absence of behavioral detection and limited forensic visibility. OT-adjacent Windows hosts are particularly exposed.</p>", 2),
      mkSection("proposed_solution", "Proposed Solution", "<p>Deploy a next-gen EDR platform with managed detection, tuned for Square's manufacturing workflows. SmartData provides L1-L2 monitoring with escalation to the in-house SOC.</p>", 3),
      mkSection("implementation_plan", "Implementation Plan", "<p>30-day onboarding: Discovery, agent rollout in three waves, detection tuning, and joint runbook handover.</p>", 4),
      mkSection("pricing_table", "Commercial Proposal", "<p>See pricing table.</p>", 5, true),
      mkSection("call_to_action", "Next Steps", "<p>Schedule a technical workshop with Square's SOC team to finalize detection priorities.</p>", 6, true),
    ],
    status: "draft",
    createdAt: addDays(-7),
    updatedAt: addDays(-1),
    version: 1,
    history: [],
    metadata: {
      validUntil: addDays(30),
      preparedBy: "Tanvir Ahmed",
      referenceNumber: "SDL-2026-0051",
      confidentiality: "confidential",
    },
  };

  const bb: Proposal = {
    id: uid(),
    title: "Enterprise WAF Solution for Bangladesh Bank",
    clientName: "Procurement Committee",
    clientCompany: "Bangladesh Bank",
    clientIndustry: "Government",
    decisionMakerName: "Dr. Aminul Islam",
    decisionMakerTitle: "Executive Director, ICT",
    clientPainPoints: ["L7 attack volume against citizen portals", "Hardware EoL", "Need for in-country support"],
    competitors: ["F5", "Imperva"],
    proposedProducts: [
      product("WAF Software License", "Enterprise WAF, 3-year subscription", 1, 2800000, 0, 0),
      product("WAF Appliance HA Pair", "Active-passive hardware pair, DC + DR", 2, 1100000, 0, 0),
      product("Implementation Services", "Migration from legacy, policy tuning, OWASP rule baseline", 1, 600000, 0, 60),
      product("Annual Support Y1", "24×7 premium support with on-site engineer", 1, 400000, 0, 0),
    ],
    pricingMode: "fixed",
    showPricing: "yes",
    template: "cybersecurity",
    tone: "formal",
    language: "english",
    sections: [
      mkSection("cover_page", "Enterprise WAF Solution", "<h1>Enterprise WAF Solution</h1><p><strong>Prepared for:</strong> Bangladesh Bank</p>", 0, true),
      mkSection("executive_summary", "Executive Summary", "<p>Bangladesh Bank requires a modern Web Application Firewall to protect citizen-facing portals from rising L7 attack volume, replace EoL hardware, and ensure in-country support. SmartData proposes a fully redundant WAF deployment at DC and DR, delivered in 60 days.</p>", 1, true),
      mkSection("problem_statement", "Problem Statement", "<p>Legacy WAF appliances are end-of-life with no vendor support pathway. Recent traffic analysis shows a 3× year-over-year increase in OWASP Top-10 attempts against the e-services portal.</p>", 2),
      mkSection("proposed_solution", "Proposed Solution", "<p>Active-passive WAF pair at each site, centrally managed, with OWASP CRS baseline plus Bangladesh Bank custom policies. Includes bot management, API protection, and DDoS mitigation hooks.</p>", 3),
      mkSection("technical_architecture", "Technical Architecture", "<p>Inline deployment behind the perimeter, integrated with existing load balancers, SIEM forwarding to Splunk, and HSM-backed TLS termination.</p>", 4),
      mkSection("implementation_plan", "Implementation Plan", "<p>60-day rollout including parallel-run with legacy WAF, policy tuning, and joint cut-over weekend.</p>", 5),
      mkSection("pricing_table", "Commercial Proposal", "<p>See pricing table.</p>", 6, true),
      mkSection("company_profile", "About SmartData", "<p>SmartData Limited is a trusted partner to Bangladesh's regulated sector with on-shore engineering and 24×7 support.</p>", 7),
      mkSection("call_to_action", "Next Steps", "<p>We request a technical clarification meeting with the ICT Department within the validity window.</p>", 8, true),
    ],
    status: "ready",
    createdAt: addDays(-14),
    updatedAt: addDays(-2),
    version: 3,
    history: [],
    metadata: {
      validUntil: addDays(30),
      preparedBy: "Tanvir Ahmed",
      approvedBy: "Country Head",
      referenceNumber: "SDL-2026-0028",
      confidentiality: "strictly_confidential",
    },
    executiveOneLiner: "A fully redundant, in-country-supported WAF — live in 60 days.",
    proposalStrengths: ["On-shore L3", "HSM-integrated", "Parallel-run cutover"],
  };

  return [jamuna, square, bb];
}
