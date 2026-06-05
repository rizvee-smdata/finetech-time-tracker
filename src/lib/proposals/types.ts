export type Currency = "BDT" | "USD";

export type ProposalStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "changes_requested"
  | "ready"
  | "sent"
  | "accepted"
  | "rejected";

export type ProposalComment = {
  id: string;
  author: string;
  authorRole: "rep" | "manager";
  sectionId?: string;
  message: string;
  createdAt: string;
  resolved: boolean;
};

export type ProposalTone = "formal" | "consultative" | "technical" | "executive";

export type ProposalLanguage = "english" | "bengali_english_mix";

export type ProposalTemplate =
  | "enterprise_ict"
  | "cybersecurity"
  | "network_infrastructure"
  | "managed_services"
  | "software_solution"
  | "custom";

export type SectionType =
  | "cover_page"
  | "executive_summary"
  | "problem_statement"
  | "proposed_solution"
  | "technical_architecture"
  | "implementation_plan"
  | "pricing_table"
  | "company_profile"
  | "team_credentials"
  | "case_studies"
  | "terms_conditions"
  | "call_to_action";

export type ProposedProduct = {
  id: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  currency: Currency;
  discount: number;
  totalPrice: number;
  implementationDays: number;
};

export type ProposalSection = {
  id: string;
  type: SectionType;
  title: string;
  content: string;
  aiGenerated: boolean;
  edited: boolean;
  locked: boolean;
  order: number;
};

export type ProposalMetadata = {
  validUntil: string;
  preparedBy: string;
  approvedBy?: string;
  referenceNumber: string;
  confidentiality: "public" | "confidential" | "strictly_confidential";
};

export type ProposalVersion = {
  version: number;
  createdAt: string;
  sections: ProposalSection[];
  changeNote: string;
};

export type PricingMode = "fixed" | "time_materials" | "subscription";

export type Proposal = {
  id: string;
  title: string;
  dealId?: string;
  clientName: string;
  clientCompany: string;
  clientIndustry: string;
  decisionMakerName?: string;
  decisionMakerTitle?: string;
  clientWebsite?: string;
  clientPainPoints: string[];
  previousContext?: string;
  competitors: string[];
  proposedProducts: ProposedProduct[];
  pricingMode: PricingMode;
  showPricing: "yes" | "no" | "summary";
  template: ProposalTemplate;
  tone: ProposalTone;
  language: ProposalLanguage;
  additionalInstructions?: string;
  sections: ProposalSection[];
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
  version: number;
  history: ProposalVersion[];
  metadata: ProposalMetadata;
  proposalStrengths?: string[];
  executiveOneLiner?: string;
  sentAt?: string;
  decidedAt?: string;
};

export type TemplateBlock = {
  id: string;
  title: string;
  category: string;
  content: string;
  builtIn?: boolean;
};

export type WizardDraft = {
  step: number;
  data: Partial<Proposal>;
  updatedAt: string;
};
