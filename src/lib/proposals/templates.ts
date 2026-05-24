import type { ProposalTemplate, SectionType, TemplateBlock } from "./types";

export const TEMPLATE_META: Record<
  ProposalTemplate,
  { label: string; icon: string; bestFor: string; typicalPages: string; sections: SectionType[] }
> = {
  enterprise_ict: {
    label: "Enterprise ICT Solution",
    icon: "🏢",
    bestFor: "Large enterprise & government clients",
    typicalPages: "12-18 pages",
    sections: [
      "cover_page",
      "executive_summary",
      "problem_statement",
      "proposed_solution",
      "technical_architecture",
      "implementation_plan",
      "pricing_table",
      "company_profile",
      "team_credentials",
      "case_studies",
      "terms_conditions",
      "call_to_action",
    ],
  },
  cybersecurity: {
    label: "Cybersecurity Proposal",
    icon: "🔒",
    bestFor: "Banks, fintech, regulated industries",
    typicalPages: "10-14 pages",
    sections: [
      "cover_page",
      "executive_summary",
      "problem_statement",
      "proposed_solution",
      "technical_architecture",
      "implementation_plan",
      "pricing_table",
      "company_profile",
      "case_studies",
      "call_to_action",
    ],
  },
  network_infrastructure: {
    label: "Network Infrastructure",
    icon: "🌐",
    bestFor: "Telcos, ISPs, large campuses",
    typicalPages: "10-15 pages",
    sections: [
      "cover_page",
      "executive_summary",
      "proposed_solution",
      "technical_architecture",
      "implementation_plan",
      "pricing_table",
      "company_profile",
      "terms_conditions",
      "call_to_action",
    ],
  },
  managed_services: {
    label: "Managed Services",
    icon: "🛠️",
    bestFor: "Long-term operational engagements",
    typicalPages: "8-12 pages",
    sections: [
      "cover_page",
      "executive_summary",
      "proposed_solution",
      "implementation_plan",
      "pricing_table",
      "company_profile",
      "team_credentials",
      "terms_conditions",
      "call_to_action",
    ],
  },
  software_solution: {
    label: "Software Solution",
    icon: "💻",
    bestFor: "Custom software & platform deals",
    typicalPages: "8-12 pages",
    sections: [
      "cover_page",
      "executive_summary",
      "problem_statement",
      "proposed_solution",
      "implementation_plan",
      "pricing_table",
      "company_profile",
      "case_studies",
      "call_to_action",
    ],
  },
  custom: {
    label: "Custom",
    icon: "✏️",
    bestFor: "Start from a blank structure",
    typicalPages: "Flexible",
    sections: [
      "cover_page",
      "executive_summary",
      "proposed_solution",
      "pricing_table",
      "call_to_action",
    ],
  },
};

export const SECTION_LABELS: Record<SectionType, string> = {
  cover_page: "Cover Page",
  executive_summary: "Executive Summary",
  problem_statement: "Problem Statement",
  proposed_solution: "Proposed Solution",
  technical_architecture: "Technical Architecture",
  implementation_plan: "Implementation Plan",
  pricing_table: "Pricing Table",
  company_profile: "Company Profile",
  team_credentials: "Team & Credentials",
  case_studies: "Case Studies",
  terms_conditions: "Terms & Conditions",
  call_to_action: "Call to Action",
};

export const LOCKED_SECTIONS: SectionType[] = [
  "executive_summary",
  "pricing_table",
  "call_to_action",
];

export const TONE_META: Record<
  string,
  { label: string; icon: string; description: string }
> = {
  formal: {
    label: "Formal",
    icon: "👔",
    description: "Government and large enterprise clients",
  },
  consultative: {
    label: "Consultative",
    icon: "🤝",
    description: "Mid-market, relationship-focused",
  },
  technical: {
    label: "Technical",
    icon: "⚙️",
    description: "IT managers and technical evaluators",
  },
  executive: {
    label: "Executive",
    icon: "👑",
    description: "C-suite, board presentations",
  },
};

export const INDUSTRIES = [
  "Banking",
  "Telecom",
  "Healthcare",
  "Government",
  "Manufacturing",
  "Retail",
  "NGO",
  "Other",
];

export const DEFAULT_BLOCKS: TemplateBlock[] = [
  {
    id: "blk_company_short",
    title: "Company Overview — Short",
    category: "Company Profile",
    builtIn: true,
    content:
      "<p>SmartData Limited is a Bangladesh-based ICT solutions company delivering enterprise infrastructure, cybersecurity, and managed services to leading banks, telecoms, and government agencies.</p>",
  },
  {
    id: "blk_company_medium",
    title: "Company Overview — Medium",
    category: "Company Profile",
    builtIn: true,
    content:
      "<p>SmartData Limited is a trusted ICT systems integrator headquartered in Dhaka, with a delivery footprint across Bangladesh's regulated sectors. We design, deploy, and operate mission-critical infrastructure, cybersecurity, and data platforms for enterprises that cannot afford downtime. Our engineers hold OEM-level certifications and operate a 24×7 NOC/SOC capability.</p>",
  },
  {
    id: "blk_partners",
    title: "Partner Credentials",
    category: "Credentials",
    builtIn: true,
    content:
      "<p><strong>Strategic Technology Partners:</strong></p><ul><li>Rubrik — Cyber Resilience &amp; Data Security</li><li>HivePro — Threat Exposure Management</li><li>Gambit Cyber — Offensive Security</li><li>LinkShadow — NDR &amp; Zero Trust</li><li>Gurucul — Next-gen SIEM &amp; UEBA</li><li>Adaptiva — Endpoint Management at Scale</li><li>DEEPX — Edge AI Acceleration</li></ul>",
  },
  {
    id: "blk_bd_context",
    title: "Bangladesh Market Context",
    category: "Context",
    builtIn: true,
    content:
      "<p>Bangladesh's enterprise market faces a unique combination of rapid digital adoption, evolving regulatory mandates from Bangladesh Bank and BTRC, and a shortage of specialized cybersecurity skills. Local presence, BDT-denominated commercials, and on-shore support are critical success factors that SmartData is built to deliver.</p>",
  },
  {
    id: "blk_methodology",
    title: "Implementation Methodology",
    category: "Delivery",
    builtIn: true,
    content:
      "<p>Our delivery follows a five-phase methodology — Discover, Design, Deploy, Operate, Optimize — with clearly defined entry/exit criteria, joint sign-offs, and weekly steering reviews. Each phase is owned by a named PM and backed by OEM-certified engineers.</p>",
  },
  {
    id: "blk_support_sla",
    title: "Support & SLA Terms",
    category: "Support",
    builtIn: true,
    content:
      "<p><strong>Support Tier:</strong> 24×7×365 with 15-minute response for P1 incidents, 1-hour for P2, and 4-hour for P3. Backed by an on-shore L3 team and direct OEM TAC escalation paths.</p>",
  },
  {
    id: "blk_terms",
    title: "Standard Terms & Conditions",
    category: "Legal",
    builtIn: true,
    content:
      "<p>Pricing is valid for 30 days from the date of this proposal. Payment terms: 40% on PO, 40% on delivery, 20% on UAT sign-off. Taxes and duties extra at applicable rates. All deliverables are governed by SmartData's Master Services Agreement.</p>",
  },
];
