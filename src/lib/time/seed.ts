import type { TimeEntry, TimeCategory, ProjectBudget } from "./types";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

type DealRef = { id: string; clientName: string; clientCompany: string; title: string };

const TEMPLATES: Array<{ desc: (d: DealRef) => string; cat: TimeCategory; billable: boolean; minMin: number; maxMin: number; tags: string[] }> = [
  { desc: (d) => `Reviewing ${d.clientCompany} RFP requirements`, cat: "Pre-Sales", billable: true, minMin: 45, maxMin: 90, tags: ["rfp", "review"] },
  { desc: (d) => `Drafting proposal for ${d.title}`, cat: "Proposal Writing", billable: true, minMin: 90, maxMin: 180, tags: ["proposal"] },
  { desc: (d) => `Call with ${d.clientName} (${d.clientCompany})`, cat: "Client Meeting", billable: true, minMin: 30, maxMin: 60, tags: ["call"] },
  { desc: () => "Weekly team sync", cat: "Internal Meeting", billable: false, minMin: 30, maxMin: 60, tags: ["internal"] },
  { desc: () => "Pipeline review with sales lead", cat: "Business Development", billable: false, minMin: 30, maxMin: 60, tags: ["pipeline"] },
  { desc: (d) => `Technical demo for ${d.clientCompany}`, cat: "Technical Demo", billable: true, minMin: 60, maxMin: 120, tags: ["demo"] },
  { desc: (d) => `Follow-up email to ${d.clientName}`, cat: "Follow-up", billable: true, minMin: 15, maxMin: 30, tags: ["email"] },
  { desc: () => "Expense reports and timesheets", cat: "Admin", billable: false, minMin: 20, maxMin: 45, tags: ["admin"] },
  { desc: () => "Market research on competitor pricing", cat: "Research", billable: false, minMin: 45, maxMin: 90, tags: ["research"] },
  { desc: () => "Call with Rubrik partner team", cat: "Partner Management", billable: false, minMin: 30, maxMin: 60, tags: ["partner"] },
];

const WORKING_HOURS = [9, 10, 11, 13, 14, 15, 16, 17];

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function seedTimeEntries(deals: DealRef[]): TimeEntry[] {
  if (deals.length === 0) return [];
  const entries: TimeEntry[] = [];
  const now = Date.now();
  let count = 0;
  for (let d = 13; d >= 0 && count < 45; d--) {
    const dayDate = new Date(now - d * 86400000);
    const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
    const entriesToday = isWeekend ? rand(0, 2) : rand(3, 5);
    let hourCursor = 0;
    for (let i = 0; i < entriesToday && count < 45; i++) {
      const tpl = TEMPLATES[rand(0, TEMPLATES.length - 1)];
      const deal = deals[rand(0, deals.length - 1)];
      const startHour = WORKING_HOURS[Math.min(hourCursor, WORKING_HOURS.length - 1)];
      hourCursor++;
      const start = new Date(dayDate);
      start.setHours(startHour, rand(0, 45), 0, 0);
      const dur = rand(tpl.minMin, tpl.maxMin);
      const end = new Date(start.getTime() + dur * 60000);
      const linkDeal = tpl.cat === "Internal Meeting" || tpl.cat === "Admin" || tpl.cat === "Research" || tpl.cat === "Partner Management"
        ? undefined
        : deal;
      const desc = tpl.desc(deal);
      entries.push({
        id: uid(),
        description: desc,
        rawDescription: desc,
        dealId: linkDeal?.id,
        clientName: linkDeal?.clientName,
        clientCompany: linkDeal?.clientCompany,
        category: tpl.cat,
        billable: tpl.billable,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        duration: dur,
        aiClassified: true,
        tags: tpl.tags,
      });
      count++;
    }
  }
  return entries;
}

export function seedBudgets(deals: DealRef[]): ProjectBudget[] {
  return deals.slice(0, 5).map((d, i) => ({
    dealId: d.id,
    budgetedHours: [40, 50, 60, 35, 45][i] ?? 40,
    warningThreshold: 75,
  }));
}
