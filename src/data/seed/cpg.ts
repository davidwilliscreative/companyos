import type { Account, Action, ConnectorStatus, Contract, Dataset, EntityMapping, Expense, Invoice, Milestone, Organization, Person, Project, RetailLaunch, Task, TimeOff } from "@/domain/types";
import { comp, contractorCost, fixedInvoice, generatePayments, generateTimeEntries, normalizeLoads, rate, resetInvoiceCounter, retainerInvoices, src, thread, tmInvoices } from "./helpers";

/**
 * CPG branding profile: "Shelfmark Studio", a 21-person independent branding and packaging agency
 * for food, beverage and supplement brands. Modelled on what agencies like this do (brand strategy,
 * creative, packaging and production design, digital), with fictional company, client and people
 * names and no real client data.
 *
 * What makes it different from the general agency profile: work runs back from retailer shelf dates.
 * Every packaging launch has a printer deadline (shelf date minus print lead time), SKU counts drive
 * production-design load, and claims or regulatory approval on the client side is the usual blocker.
 *
 * Scenarios:
 *  1. Satisfied client, unprofitable project ........ Summit Creamery Co-op (38 + 24 SKU refresh, absorbed butter line)
 *  2. Unhappy client, invoices current .............. Gold Hollow Distilling (label rounds, feedback delays)
 *  3. Profitable account with credible expansion .... Fizzwell Beverage Co. (DTC site, trade-show booth)
 *  4. Launch waiting on client claims approval ...... Harvest Table Foods (Target & Kroger shelf date at risk)
 *  5. Retainer with scope creep ..................... Peak Theory Nutrition (Amazon content, sell sheets, SKU adaptations)
 *  6. Renewal risk across several conversations ..... Northfork Hard Seltzer (new parent company, agency RFP)
 *  7. Overloaded team member across projects ........ Tess Abbott, Production Design Lead
 *  8. Serious issue that has been resolved .......... Crisp Mountain Snacks (wrong UPC caught at press check)
 *  9. Stale / insufficient information .............. Juniper Lane Gin
 *
 * Department head example: Hugo Silva, Head of Design (Zoe, Marco, Bea and the Juno Reyes contractor).
 */

const ORG = "org_shelfmark";

export function buildCpg(): Dataset {
  resetInvoiceCounter(2210);
  const org: Organization = {
    id: ORG,
    name: "Shelfmark Studio",
    profileId: "cpg_branding",
    reportingCurrency: "USD",
    demoDate: "2026-10-05",
    dataStart: "2026-04-01",
    annualWorkingHours: 1800,
    hoursPerWeek: 40,
    openingCash: { date: "2026-10-05", amount: 612_000, currency: "USD", source: src("accounting", "bank-balance") },
    overheadMonthly: [
      { label: "Studio rent & facilities", amount: 21_000 },
      { label: "Software, fonts & image libraries", amount: 7_200 },
      { label: "Insurance, legal & admin", amount: 8_000 },
    ],
    defaultTargetMargin: 0.45,
    billableUtilizationTarget: 0.75,
    serviceCatalog: [
      { id: "svc_strategy", name: "Brand strategy & positioning", keywords: ["strategy", "positioning", "architecture", "naming", "consumer research"] },
      { id: "svc_newbrand", name: "New brand creation", keywords: ["new brand", "naming", "identity", "logo"] },
      { id: "svc_pack", name: "Packaging design & rebrand", keywords: ["packaging", "rebrand", "label", "bottle", "can", "bag", "carton"] },
      { id: "svc_production", name: "Production design & SKU rollout", keywords: ["sku", "mechanicals", "line extension", "flavor", "prepress", "variety pack"] },
      { id: "svc_digital", name: "Digital experiences & DTC websites", keywords: ["website", "dtc", "e-commerce", "site", "shopify"] },
      { id: "svc_retail", name: "Retail sell-in & trade show", keywords: ["sell sheet", "trade show", "expo", "booth", "retail sell-in", "shelf talker"] },
    ],
    demoPersonas: { executive: "p_maya", finance: "p_eli", account_owner: "p_jess", department_head: "p_hugo", admin: "p_wren" },
    departments: [{ name: "Design", headId: "p_hugo" }],
  };

  const person = (id: string, name: string, title: string, role: string, department: string, startDate = "2023-02-06", type: Person["type"] = "employee", fte = 1): Person => ({
    id,
    orgId: ORG,
    name,
    title,
    role,
    department,
    type,
    fte,
    startDate,
    email: `${name.split(" ")[0].toLowerCase()}@shelfmark.example`,
  });

  const people: Person[] = [
    person("p_maya", "Maya Torres", "Founder & Chief Creative Officer", "Executive", "Leadership", "2014-05-01"),
    person("p_eli", "Eli Brandt", "Director of Finance & Operations", "Finance", "Operations", "2020-03-02"),
    person("p_jess", "Jess Okoro", "Group Account Director", "Account management", "Client Services", "2019-08-05"),
    person("p_carter", "Carter Nguyen", "Account Director", "Account management", "Client Services", "2021-04-12"),
    person("p_lena", "Lena Fischer", "Account Manager", "Account management", "Client Services", "2024-02-05"),
    person("p_noah", "Noah Kim", "Strategy Director", "Strategist", "Strategy", "2020-10-05"),
    person("p_amara", "Amara Jones", "Brand Strategist", "Strategist", "Strategy", "2023-06-12"),
    person("p_hugo", "Hugo Silva", "Head of Design", "Department head", "Design", "2018-09-03"),
    person("p_zoe", "Zoe Park", "Senior Packaging Designer", "Designer", "Design", "2021-01-11"),
    person("p_marco", "Marco Bellini", "Packaging Designer", "Designer", "Design", "2023-09-04"),
    person("p_bea", "Bea Laurent", "Senior Copywriter", "Copywriter", "Design", "2022-03-07"),
    person("p_tess", "Tess Abbott", "Production Design Lead", "Production artist", "Production", "2019-11-04"),
    person("p_ray", "Ray Dominguez", "Production Artist", "Production artist", "Production", "2026-07-13"),
    person("p_sam", "Sam Whitley", "Digital Lead", "Developer", "Digital", "2021-07-19"),
    person("p_kai", "Kai Morgan", "Web Developer", "Developer", "Digital", "2024-05-06"),
    person("p_olive", "Olive Grant", "Senior Project Manager", "Project manager", "Delivery", "2020-06-01"),
    person("p_dev", "Dev Malhotra", "Project Manager", "Project manager", "Delivery", "2023-01-09"),
    person("p_wren", "Wren Castillo", "Studio Systems & Operations Manager", "Operations", "Operations", "2022-08-15"),
    { ...person("c_juno", "Juno Reyes", "Freelance Illustrator", "Designer", "Design", "2026-04-06", "contractor", 0.5), email: "juno@junoreyes.example" },
    { ...person("c_ansel", "Ansel Render Co.", "3D render & product photography partner", "Designer", "Production", "2026-04-01", "contractor", 0.5), email: "studio@anselrender.example" },
    { ...person("c_peak", "Peakline Prepress", "Prepress & color separation partner", "Production artist", "Production", "2026-04-01", "contractor", 0.5), email: "jobs@peaklineprepress.example" },
  ];

  const compensation = [
    comp(ORG, "p_maya", "2026-01-01", 220_000, 40_000),
    comp(ORG, "p_eli", "2026-01-01", 148_000, 27_000),
    comp(ORG, "p_jess", "2026-01-01", 150_000, 28_000),
    comp(ORG, "p_carter", "2026-01-01", 132_000, 24_500),
    comp(ORG, "p_lena", "2026-01-01", 92_000, 17_500),
    comp(ORG, "p_noah", "2026-01-01", 145_000, 27_000),
    comp(ORG, "p_amara", "2026-01-01", 98_000, 18_500),
    comp(ORG, "p_hugo", "2026-01-01", 155_000, 29_000),
    comp(ORG, "p_zoe", "2026-01-01", 118_000, 22_000),
    comp(ORG, "p_marco", "2026-01-01", 86_000, 16_500),
    comp(ORG, "p_bea", "2026-01-01", 102_000, 19_000),
    comp(ORG, "p_tess", "2026-01-01", 108_000, 20_500),
    comp(ORG, "p_ray", "2026-07-13", 72_000, 14_000),
    comp(ORG, "p_sam", "2026-01-01", 128_000, 24_000),
    comp(ORG, "p_kai", "2026-01-01", 104_000, 19_500),
    comp(ORG, "p_olive", "2026-01-01", 108_000, 20_500),
    comp(ORG, "p_dev", "2026-01-01", 94_000, 18_000),
    comp(ORG, "p_wren", "2026-01-01", 88_000, 16_500),
    contractorCost(ORG, "c_juno", "2026-04-06", 85),
    contractorCost(ORG, "c_ansel", "2026-04-01", 110),
    contractorCost(ORG, "c_peak", "2026-04-01", 70),
  ];

  const billRates = [
    rate(ORG, "p_jess", "2026-01-01", 185),
    rate(ORG, "p_carter", "2026-01-01", 175),
    rate(ORG, "p_lena", "2026-01-01", 140),
    rate(ORG, "p_noah", "2026-01-01", 210),
    rate(ORG, "p_amara", "2026-01-01", 160),
    rate(ORG, "p_hugo", "2026-01-01", 210),
    rate(ORG, "p_zoe", "2026-01-01", 175),
    rate(ORG, "p_marco", "2026-01-01", 145),
    rate(ORG, "p_bea", "2026-01-01", 160),
    rate(ORG, "p_tess", "2026-01-01", 140),
    rate(ORG, "p_ray", "2026-07-13", 115),
    rate(ORG, "p_sam", "2026-01-01", 175),
    rate(ORG, "p_kai", "2026-01-01", 150),
    rate(ORG, "p_olive", "2026-01-01", 140),
    rate(ORG, "p_dev", "2026-01-01", 135),
    rate(ORG, "c_juno", "2026-04-06", 150),
    rate(ORG, "c_ansel", "2026-04-01", 190),
    rate(ORG, "c_peak", "2026-04-01", 120),
  ];

  const timeOff: TimeOff[] = [
    { id: "to_zoe_aug", personId: "p_zoe", start: "2026-08-17", end: "2026-08-21", hours: 40 },
    { id: "to_marco_jul", personId: "p_marco", start: "2026-07-06", end: "2026-07-17", hours: 80 },
    { id: "to_olive_sep", personId: "p_olive", start: "2026-09-08", end: "2026-09-11", hours: 32 },
    { id: "to_tess_oct", personId: "p_tess", start: "2026-10-26", end: "2026-10-30", hours: 40 },
  ];

  const contact = (name: string, title: string, domain: string, primary = false) => ({ name, title, email: `${name.split(" ")[0].toLowerCase()}@${domain}`, primary });
  const account = (a: Omit<Account, "orgId" | "kind" | "status"> & Partial<Pick<Account, "status">>): Account => ({ orgId: ORG, kind: "client", status: "active", ...a });

  const accounts: Account[] = [
    account({ id: "a_summit", name: "Summit Creamery Co-op", aliases: ["summit", "summit creamery", "summit co-op"], industry: "Dairy (farmer-owned cooperative)", segment: "Food", ownerId: "p_jess", since: "2025-10-06", contacts: [contact("Karen Lindgren", "VP Marketing", "summitcreamery.example", true), contact("Tom Becker", "Packaging Operations Manager", "summitcreamery.example")], services: ["Brand strategy & positioning", "Packaging design & rebrand", "Production design & SKU rollout"] }),
    account({ id: "a_goldhollow", name: "Gold Hollow Distilling", aliases: ["gold hollow", "goldhollow", "gold hollow bourbon"], industry: "Spirits (craft bourbon)", segment: "Beverage", ownerId: "p_carter", since: "2026-04-20", contacts: [contact("Wes Calloway", "Founder & Master Distiller", "goldhollow.example", true), contact("Dana Pruitt", "Brand Manager", "goldhollow.example")], services: ["New brand creation", "Packaging design & rebrand"] }),
    account({ id: "a_fizzwell", name: "Fizzwell Beverage Co.", aliases: ["fizzwell", "fizz well"], industry: "Functional beverage (prebiotic soda)", segment: "Beverage", ownerId: "p_jess", since: "2025-06-02", contacts: [contact("Priya Raman", "Chief Marketing Officer", "fizzwell.example", true), contact("Leo Ashford", "Brand Manager", "fizzwell.example")], services: ["Packaging design & rebrand", "Production design & SKU rollout"] }),
    account({ id: "a_harvest", name: "Harvest Table Foods", aliases: ["harvest table", "harvest"], industry: "Frozen food", segment: "Food", ownerId: "p_carter", since: "2026-05-18", contacts: [contact("Monica Reyes", "Director of Brand", "harvesttable.example", true), contact("Accounts Payable", "Finance", "harvesttable.example")], services: ["Packaging design & rebrand", "Production design & SKU rollout"] }),
    account({ id: "a_peaktheory", name: "Peak Theory Nutrition", aliases: ["peak theory", "peaktheory"], industry: "Supplements (collagen)", segment: "Supplement", ownerId: "p_lena", since: "2026-02-23", contacts: [contact("Jordan Ellis", "Head of Marketing", "peaktheory.example", true)], services: ["Production design & SKU rollout", "Retail sell-in & trade show"] }),
    account({ id: "a_northfork", name: "Northfork Hard Seltzer", aliases: ["northfork", "north fork"], industry: "Hard seltzer", segment: "Beverage", ownerId: "p_jess", since: "2024-11-04", contacts: [contact("Alyssa Grant", "Brand Director", "northforkseltzer.example", true), contact("Ben Ortiz", "Procurement Manager, Cascadia Beverage Group", "cascadiabev.example")], services: ["Packaging design & rebrand", "Production design & SKU rollout"] }),
    account({ id: "a_crisp", name: "Crisp Mountain Snacks", aliases: ["crisp mountain", "crisp"], industry: "Snacks (kettle chips)", segment: "Food", ownerId: "p_jess", since: "2026-03-30", contacts: [contact("Hank Sorensen", "VP Operations", "crispmountain.example", true), contact("Mia Torres", "Brand Manager", "crispmountain.example")], services: ["Packaging design & rebrand", "Production design & SKU rollout"] }),
    account({ id: "a_juniper", name: "Juniper Lane Gin", aliases: ["juniper lane", "juniper"], industry: "Spirits (gin)", segment: "Beverage", ownerId: "p_lena", since: "2026-07-06", contacts: [contact("Ari Holm", "Co-founder", "juniperlane.example", true)], services: ["Packaging design & rebrand"] }),
    account({ id: "a_oattheory", name: "Oat Theory", aliases: ["oat theory", "oattheory"], industry: "Non-dairy (oat milk)", segment: "Beverage", ownerId: "p_lena", status: "onboarding", since: "2026-08-31", contacts: [contact("Sasha Patel", "Founder & CEO", "oattheory.example", true)], services: ["New brand creation"] }),
  ];

  const P = (p: Partial<Project> & Pick<Project, "id" | "name" | "billing" | "ownerId" | "startDate" | "originalEndDate" | "assignments" | "budgetHours" | "remainingHoursEstimate">): Project => ({
    orgId: ORG,
    kind: p.billing === "internal" ? "internal" : "client",
    status: "active",
    currentEndDate: p.originalEndDate,
    remainingExpenseEstimate: 0,
    scopeChanges: [],
    dependsOn: [],
    description: "",
    targetMargin: p.billing === "internal" ? undefined : 0.45,
    estimateUpdatedOn: "2026-10-02",
    estimateSource: src("clickup", "estimates"),
    ...p,
  });
  const as = (personId: string, hoursPerWeek: number, from: string, to: string, billable = true) => ({ personId, hoursPerWeek, from, to, billable });

  const projects: Project[] = [
    P({
      id: "pr_summit_refresh", accountId: "a_summit", contractId: "ct_summit_refresh", name: "Summit Creamery brand & packaging refresh", billing: "fixed_fee", ownerId: "p_olive",
      startDate: "2026-04-06", originalEndDate: "2026-11-20", currentEndDate: "2026-12-18", budgetHours: 1400, remainingHoursEstimate: 380, remainingExpenseEstimate: 4500,
      description: "Brand architecture and packaging system for the co-op's dairy line: 38 fluid milk and cream SKUs in wave 1, 24 yogurt and butter SKUs in wave 2.",
      scopeChanges: [
        { id: "sc_summit_1", date: "2026-07-27", description: "Cultured butter line (14 SKUs) added to wave 2, absorbed to protect the relationship", hours: 160, billable: false, approved: true },
        { id: "sc_summit_2", date: "2026-09-30", description: "Holiday eggnog limited edition label (not yet priced)", hours: 36, billable: false, approved: false },
      ],
      assignments: [
        as("p_zoe", 14, "2026-04-06", "2026-08-31"), as("p_zoe", 8, "2026-09-01", "2026-12-18"),
        as("p_marco", 12, "2026-04-06", "2026-12-18"), as("p_tess", 10, "2026-06-01", "2026-12-18"),
        as("p_noah", 8, "2026-04-06", "2026-05-29"), as("p_amara", 8, "2026-04-06", "2026-06-26"),
        as("p_olive", 6, "2026-04-06", "2026-12-18"), as("c_ansel", 6, "2026-07-06", "2026-11-27"), as("c_peak", 6, "2026-08-03", "2026-12-18"),
        as("p_jess", 3, "2026-04-06", "2026-12-18", false),
      ],
    }),
    P({
      id: "pr_gold_launch", accountId: "a_goldhollow", contractId: "ct_gold_launch", name: "Gold Hollow bourbon brand launch", billing: "fixed_fee", ownerId: "p_dev",
      startDate: "2026-05-04", originalEndDate: "2026-11-27", currentEndDate: "2026-12-11", budgetHours: 900, remainingHoursEstimate: 300, remainingExpenseEstimate: 6500,
      description: "Naming, identity, bottle, label and gift box for a small-batch bourbon going into state distribution.",
      assignments: [as("p_zoe", 10, "2026-05-04", "2026-12-11"), as("p_marco", 8, "2026-05-04", "2026-12-11"), as("p_bea", 6, "2026-05-04", "2026-09-25"), as("p_noah", 6, "2026-05-04", "2026-06-26"), as("c_juno", 8, "2026-06-01", "2026-10-30"), as("p_tess", 6, "2026-09-07", "2026-12-11"), as("p_dev", 6, "2026-05-04", "2026-12-11"), as("p_carter", 2, "2026-05-04", "2026-12-11", false)],
    }),
    P({
      id: "pr_fizz_flavors", accountId: "a_fizzwell", contractId: "ct_fizz_flavors", name: "Fizzwell flavor extension (3 SKUs)", billing: "fixed_fee", ownerId: "p_dev",
      startDate: "2026-07-13", originalEndDate: "2026-11-06", budgetHours: 380, remainingHoursEstimate: 90, remainingExpenseEstimate: 1200,
      description: "Three new flavors on the existing can system: blood orange, yuzu ginger and black cherry.",
      assignments: [as("p_marco", 8, "2026-07-13", "2026-10-30"), as("p_tess", 8, "2026-08-17", "2026-11-06"), as("p_bea", 3, "2026-07-13", "2026-09-25"), as("p_dev", 3, "2026-07-13", "2026-11-06")],
    }),
    P({
      id: "pr_fizz_ret", accountId: "a_fizzwell", contractId: "ct_fizz_ret", name: "Fizzwell brand retainer", billing: "retainer", ownerId: "p_jess",
      startDate: "2026-02-02", originalEndDate: "2027-01-29", budgetHours: 600, remainingHoursEstimate: 200,
      description: "Ongoing brand guardianship: retailer sell sheets, social templates, seasonal packaging. 50 hours included per month.",
      assignments: [as("p_zoe", 3, "2026-02-02", "2027-01-29"), as("p_bea", 3, "2026-02-02", "2027-01-29"), as("p_amara", 2, "2026-02-02", "2027-01-29"), as("p_jess", 2, "2026-02-02", "2027-01-29", false)],
    }),
    P({
      id: "pr_harvest_bowls", accountId: "a_harvest", contractId: "ct_harvest_bowls", name: "Harvest Table protein bowls launch", billing: "fixed_fee", ownerId: "p_olive",
      startDate: "2026-06-01", originalEndDate: "2026-11-20", currentEndDate: "2026-12-04", budgetHours: 640, remainingHoursEstimate: 170, remainingExpenseEstimate: 3500,
      description: "New frozen protein bowl range for a Target and Kroger shelf reset: carton design, nutrition panels and claims for 12 SKUs.",
      assignments: [as("p_zoe", 6, "2026-06-01", "2026-10-30"), as("p_marco", 6, "2026-06-01", "2026-11-20"), as("p_tess", 10, "2026-08-03", "2026-12-04"), as("p_bea", 4, "2026-06-01", "2026-10-30"), as("p_olive", 4, "2026-06-01", "2026-12-04"), as("c_ansel", 6, "2026-07-06", "2026-09-04")],
    }),
    P({
      id: "pr_peak_ret", accountId: "a_peaktheory", contractId: "ct_peak_ret", name: "Peak Theory design retainer", billing: "retainer", ownerId: "p_lena",
      startDate: "2026-03-02", originalEndDate: "2027-02-26", budgetHours: 600, remainingHoursEstimate: 380,
      description: "Monthly packaging and retail design support. 50 hours included per month; extra work is billable only with a signed change order.",
      assignments: [as("p_marco", 4, "2026-03-02", "2027-02-26"), as("p_tess", 4, "2026-03-02", "2027-02-26"), as("p_bea", 2, "2026-03-02", "2027-02-26"), as("c_juno", 2, "2026-06-01", "2027-02-26"), as("p_lena", 2, "2026-03-02", "2027-02-26", false)],
    }),
    P({
      id: "pr_north_ret", accountId: "a_northfork", contractId: "ct_north_ret", name: "Northfork brand retainer FY26", billing: "retainer", ownerId: "p_jess",
      startDate: "2025-12-01", originalEndDate: "2026-11-30", budgetHours: 840, remainingHoursEstimate: 130,
      description: "Always-on packaging, seasonal variety packs and retail displays. 70 hours included per month. Renewal decision due by Oct 31 (30-day notice).",
      assignments: [as("p_zoe", 4, "2025-12-01", "2026-11-30"), as("p_marco", 4, "2025-12-01", "2026-11-30"), as("p_tess", 4, "2025-12-01", "2026-11-30"), as("p_bea", 2, "2025-12-01", "2026-11-30"), as("p_jess", 2, "2025-12-01", "2026-11-30", false)],
    }),
    P({
      id: "pr_north_variety", accountId: "a_northfork", contractId: "ct_north_variety", name: "Northfork summer variety pack", billing: "fixed_fee", ownerId: "p_dev",
      startDate: "2026-04-13", originalEndDate: "2026-07-31", status: "completed", completedOn: "2026-07-31", budgetHours: 260, remainingHoursEstimate: 0,
      description: "12-can variety pack and shipper for the summer season.",
      assignments: [as("p_marco", 8, "2026-04-13", "2026-07-31"), as("p_tess", 6, "2026-05-04", "2026-07-31"), as("p_dev", 2, "2026-04-13", "2026-07-31")],
    }),
    P({
      id: "pr_crisp_redesign", accountId: "a_crisp", contractId: "ct_crisp_redesign", name: "Crisp Mountain bag redesign", billing: "fixed_fee", ownerId: "p_olive",
      startDate: "2026-04-13", originalEndDate: "2026-07-31", currentEndDate: "2026-09-25", status: "completed", completedOn: "2026-09-25", budgetHours: 700, remainingHoursEstimate: 0,
      description: "Redesign of the kettle chip range: 9 flavors in three bag sizes, plus club-store cases.",
      assignments: [as("p_zoe", 8, "2026-04-13", "2026-07-31"), as("p_marco", 6, "2026-04-13", "2026-08-28"), as("p_tess", 8, "2026-05-18", "2026-09-25"), as("p_olive", 4, "2026-04-13", "2026-09-25"), as("c_peak", 4, "2026-06-01", "2026-09-25")],
    }),
    P({
      id: "pr_crisp_support", accountId: "a_crisp", contractId: "ct_crisp_support", name: "Crisp Mountain production support", billing: "retainer", ownerId: "p_jess",
      startDate: "2026-08-03", originalEndDate: "2027-07-30", budgetHours: 240, remainingHoursEstimate: 200,
      description: "Ongoing mechanicals, regulatory updates and printer coordination. 20 hours included per month.",
      assignments: [as("p_ray", 4, "2026-08-03", "2027-07-30"), as("p_tess", 1, "2026-08-03", "2027-07-30")],
    }),
    P({
      id: "pr_juniper_label", accountId: "a_juniper", contractId: "ct_juniper_label", name: "Juniper Lane label refresh", billing: "time_materials", ownerId: "p_lena",
      startDate: "2026-07-13", originalEndDate: "2026-10-23", budgetHours: 220, remainingHoursEstimate: 60, estimateUpdatedOn: "2026-08-21",
      description: "Label refresh for the flagship gin and two seasonal releases. Time records stop after Aug 24; estimate not updated since Aug 21.",
      assignments: [as("c_juno", 6, "2026-07-13", "2026-10-23"), as("p_marco", 6, "2026-07-13", "2026-10-23")],
    }),
    P({
      id: "pr_oat_brand", accountId: "a_oattheory", contractId: "ct_oat_brand", name: "Oat Theory new brand creation", billing: "time_materials", ownerId: "p_lena",
      startDate: "2026-09-07", originalEndDate: "2026-12-18", budgetHours: 420, remainingHoursEstimate: 320,
      description: "Naming, positioning, identity and first carton for a new oat milk brand ahead of a trade-show launch in March.",
      assignments: [as("p_noah", 10, "2026-09-07", "2026-11-13"), as("p_amara", 8, "2026-09-07", "2026-12-18"), as("p_zoe", 4, "2026-09-21", "2026-12-18"), as("p_lena", 3, "2026-09-07", "2026-12-18", false)],
    }),
    P({
      id: "pr_int_prepress", name: "Production templates & prepress checklist", billing: "internal", ownerId: "p_wren", department: "Operations",
      startDate: "2026-06-15", originalEndDate: "2026-11-27", budgetHours: 260, budgetCost: 22_000, remainingHoursEstimate: 110,
      description: "Internal: dieline library, barcode and regulatory checklist, and press-check sign-off workflow (started after the Crisp Mountain UPC incident).",
      assignments: [as("p_wren", 8, "2026-06-15", "2026-11-27", false), as("p_tess", 2, "2026-06-15", "2026-11-27", false), as("p_ray", 2, "2026-07-13", "2026-11-27", false)],
    }),
    P({
      id: "pr_int_cases", name: "Shelfmark website & case studies", billing: "internal", ownerId: "p_maya", department: "Marketing",
      startDate: "2026-08-03", originalEndDate: "2026-10-30", currentEndDate: "2026-12-11", budgetHours: 200, budgetCost: 15_000, remainingHoursEstimate: 120,
      description: "New studio site with launch case studies. Design capacity is shared with client work.",
      assignments: [as("p_sam", 6, "2026-08-03", "2026-12-11", false), as("p_kai", 8, "2026-08-03", "2026-12-11", false), as("p_marco", 2, "2026-08-03", "2026-12-11", false)],
    }),
  ];

  // Tess (production lead) is the deliberately overloaded scenario; account leads are part-time on delivery.
  normalizeLoads(projects, { cap: 35, exclude: ["p_tess", "p_jess", "p_carter", "p_lena"], from: "2026-04-06", to: "2027-01-31" });

  const contract = (c: Omit<Contract, "orgId" | "currency" | "source">): Contract => ({ orgId: ORG, currency: "USD", source: src("sheets", "contracts"), ...c });
  const contracts: Contract[] = [
    contract({ id: "ct_summit_refresh", accountId: "a_summit", name: "Brand & packaging refresh SOW", type: "fixed_fee", startDate: "2026-04-06", endDate: "2026-12-18", fixedFee: 185_000 }),
    contract({ id: "ct_gold_launch", accountId: "a_goldhollow", name: "Bourbon brand launch SOW", type: "fixed_fee", startDate: "2026-05-04", endDate: "2026-12-11", fixedFee: 140_000 }),
    contract({ id: "ct_fizz_flavors", accountId: "a_fizzwell", name: "Flavor extension SOW", type: "fixed_fee", startDate: "2026-07-13", endDate: "2026-11-06", fixedFee: 72_000 }),
    contract({ id: "ct_fizz_ret", accountId: "a_fizzwell", name: "Brand retainer", type: "retainer", startDate: "2026-02-01", endDate: "2027-01-31", renewalDate: "2027-01-31", noticeDays: 60, monthlyFee: 11_000, includedHoursPerMonth: 50 }),
    contract({ id: "ct_harvest_bowls", accountId: "a_harvest", name: "Protein bowls launch SOW", type: "fixed_fee", startDate: "2026-06-01", endDate: "2026-12-04", fixedFee: 118_000 }),
    contract({ id: "ct_peak_ret", accountId: "a_peaktheory", name: "Design retainer", type: "retainer", startDate: "2026-03-01", endDate: "2027-02-28", renewalDate: "2027-02-28", noticeDays: 30, monthlyFee: 7_500, includedHoursPerMonth: 50 }),
    contract({ id: "ct_north_ret", accountId: "a_northfork", name: "Brand retainer FY26", type: "retainer", startDate: "2025-12-01", endDate: "2026-11-30", renewalDate: "2026-11-30", noticeDays: 30, autoRenew: false, monthlyFee: 18_000, includedHoursPerMonth: 70 }),
    contract({ id: "ct_north_variety", accountId: "a_northfork", name: "Summer variety pack SOW", type: "fixed_fee", startDate: "2026-04-13", endDate: "2026-07-31", fixedFee: 46_000 }),
    contract({ id: "ct_crisp_redesign", accountId: "a_crisp", name: "Bag redesign SOW", type: "fixed_fee", startDate: "2026-04-13", endDate: "2026-09-25", fixedFee: 112_000 }),
    contract({ id: "ct_crisp_support", accountId: "a_crisp", name: "Production support retainer", type: "retainer", startDate: "2026-08-01", endDate: "2027-07-31", renewalDate: "2027-07-31", noticeDays: 30, monthlyFee: 4_500, includedHoursPerMonth: 20 }),
    contract({ id: "ct_juniper_label", accountId: "a_juniper", name: "Label refresh SOW", type: "time_materials", startDate: "2026-07-13", endDate: "2026-10-23" }),
    contract({ id: "ct_oat_brand", accountId: "a_oattheory", name: "New brand SOW", type: "time_materials", startDate: "2026-09-07", endDate: "2026-12-18" }),
  ];

  const M = (m: Omit<Milestone, "orgId" | "dueChanges"> & { dueChanges?: Milestone["dueChanges"] }): Milestone => ({ orgId: ORG, dueChanges: [], ...m });
  const milestones: Milestone[] = [
    M({ id: "ms_summit_arch", projectId: "pr_summit_refresh", name: "Brand architecture approved", originalDue: "2026-05-08", completedOn: "2026-05-08", ownerId: "p_noah", billingAmount: 46_250 }),
    M({ id: "ms_summit_design", projectId: "pr_summit_refresh", name: "Packaging design direction approved", originalDue: "2026-06-19", completedOn: "2026-06-26", ownerId: "p_zoe", billingAmount: 46_250 }),
    M({ id: "ms_summit_w1", projectId: "pr_summit_refresh", name: "Wave 1 final art released to print (38 SKUs)", originalDue: "2026-09-11", completedOn: "2026-09-18", ownerId: "p_tess", billingAmount: 37_000 }),
    M({ id: "ms_summit_w2", projectId: "pr_summit_refresh", name: "Wave 2 final art released to print (24 SKUs)", originalDue: "2026-10-30", dueChanges: [{ changedOn: "2026-07-27", newDue: "2026-11-20", reason: "Cultured butter line added to wave 2" }], ownerId: "p_tess", billingAmount: 55_500 }),

    M({ id: "ms_gold_naming", projectId: "pr_gold_launch", name: "Naming & positioning approved", originalDue: "2026-05-29", dueChanges: [{ changedOn: "2026-05-27", newDue: "2026-06-05", reason: "Trademark search came back late" }], completedOn: "2026-06-05", ownerId: "p_noah", billingAmount: 42_000 }),
    M({ id: "ms_gold_label", projectId: "pr_gold_launch", name: "Label & bottle design approved", originalDue: "2026-08-28", dueChanges: [{ changedOn: "2026-08-24", newDue: "2026-09-25", reason: "Second label direction requested" }, { changedOn: "2026-09-23", newDue: "2026-10-16", reason: "Third revision round on the front label" }], ownerId: "p_zoe" }),
    M({ id: "ms_gold_release", projectId: "pr_gold_launch", name: "Label & glass decoration art released", originalDue: "2026-10-16", dueChanges: [{ changedOn: "2026-09-23", newDue: "2026-11-02", reason: "Follows label approval slip" }], ownerId: "p_dev", billingAmount: 56_000 }),

    M({ id: "ms_fizz_concepts", projectId: "pr_fizz_flavors", name: "Flavor designs approved", originalDue: "2026-08-28", completedOn: "2026-08-26", ownerId: "p_marco", billingAmount: 36_000 }),
    M({ id: "ms_fizz_release", projectId: "pr_fizz_flavors", name: "Can art released to printer", originalDue: "2026-10-14", ownerId: "p_tess", billingAmount: 36_000 }),

    M({ id: "ms_harvest_concepts", projectId: "pr_harvest_bowls", name: "Carton concepts approved", originalDue: "2026-07-10", completedOn: "2026-07-10", ownerId: "p_zoe", billingAmount: 35_400 }),
    M({ id: "ms_harvest_claims", projectId: "pr_harvest_bowls", name: "Client regulatory & claims approval", originalDue: "2026-09-04", dueChanges: [{ changedOn: "2026-09-10", newDue: "2026-09-25", reason: "Client regulatory review of the high-protein claim" }, { changedOn: "2026-09-28", newDue: "2026-10-16", reason: "Client regulatory review ongoing" }], ownerId: "p_olive", awaitingClientSince: "2026-09-08", blockedReason: "Awaiting Harvest Table regulatory sign-off on the high-protein claim and nutrition panels" }),
    M({ id: "ms_harvest_release", projectId: "pr_harvest_bowls", name: "Final carton art released to print (12 SKUs)", originalDue: "2026-09-25", dueChanges: [{ changedOn: "2026-09-28", newDue: "2026-11-06", reason: "Held until claims approval" }], ownerId: "p_olive", billingAmount: 47_200 }),

    M({ id: "ms_north_variety", projectId: "pr_north_variety", name: "Variety pack released to print", originalDue: "2026-06-26", completedOn: "2026-06-24", ownerId: "p_tess" }),
    M({ id: "ms_north_rfp", projectId: "pr_north_ret", name: "Agency review pitch submitted (RFP)", originalDue: "2026-10-21", ownerId: "p_jess" }),

    M({ id: "ms_crisp_design", projectId: "pr_crisp_redesign", name: "Bag designs approved", originalDue: "2026-06-12", completedOn: "2026-06-12", ownerId: "p_zoe", billingAmount: 44_800 }),
    M({ id: "ms_crisp_press", projectId: "pr_crisp_redesign", name: "Press check & first run", originalDue: "2026-07-24", dueChanges: [{ changedOn: "2026-07-22", newDue: "2026-09-18", reason: "Reprint after wrong UPC found at press check" }], completedOn: "2026-09-18", ownerId: "p_tess", billingAmount: 33_600 }),

    M({ id: "ms_juniper_concepts", projectId: "pr_juniper_label", name: "Label concepts", originalDue: "2026-08-21", completedOn: "2026-08-21", ownerId: "c_juno" }),
    M({ id: "ms_juniper_final", projectId: "pr_juniper_label", name: "Final label art", originalDue: "2026-10-23", ownerId: "p_marco", blockedReason: "Waiting for the client's TTB label approval details (requested Aug 12)" }),

    M({ id: "ms_oat_naming", projectId: "pr_oat_brand", name: "Naming shortlist", originalDue: "2026-10-02", completedOn: "2026-10-01", ownerId: "p_noah" }),
    M({ id: "ms_oat_identity", projectId: "pr_oat_brand", name: "Identity directions", originalDue: "2026-10-30", ownerId: "p_amara" }),

    M({ id: "ms_prepress_check", projectId: "pr_int_prepress", name: "Barcode & regulatory checklist live", originalDue: "2026-08-14", completedOn: "2026-08-12", ownerId: "p_wren" }),
    M({ id: "ms_prepress_dielines", projectId: "pr_int_prepress", name: "Dieline library", originalDue: "2026-11-27", ownerId: "p_wren" }),
    M({ id: "ms_cases_launch", projectId: "pr_int_cases", name: "Studio site launch", originalDue: "2026-10-30", dueChanges: [{ changedOn: "2026-09-21", newDue: "2026-12-11", reason: "Design time moved to Summit wave 2" }], ownerId: "p_sam" }),
  ];

  const T = (t: Omit<Task, "orgId" | "source" | "dependsOn"> & { dependsOn?: string[] }): Task => ({ orgId: ORG, source: src("clickup", "tasks"), dependsOn: [], ...t });
  const tasks: Task[] = [
    T({ id: "tk_summit_yogurt", projectId: "pr_summit_refresh", milestoneId: "ms_summit_w2", title: "Yogurt cup and multipack mechanicals (10 SKUs)", assigneeId: "p_tess", status: "in_progress", due: "2026-10-23", estimateHours: 60 }),
    T({ id: "tk_summit_butter", projectId: "pr_summit_refresh", milestoneId: "ms_summit_w2", title: "Cultured butter wrapper and carton (14 SKUs)", assigneeId: "p_marco", status: "in_progress", due: "2026-10-30", estimateHours: 70, revisionRounds: 2 }),
    T({ id: "tk_summit_renders", projectId: "pr_summit_refresh", milestoneId: "ms_summit_w2", title: "Wave 2 retailer sell-in renders", assigneeId: "c_ansel", status: "todo", due: "2026-11-06", estimateHours: 24 }),
    T({ id: "tk_summit_w1_proofs", projectId: "pr_summit_refresh", milestoneId: "ms_summit_w1", title: "Wave 1 printer proofs sign-off", assigneeId: "p_tess", status: "done", due: "2026-09-11", completedOn: "2026-09-17", estimateHours: 20 }),
    T({ id: "tk_summit_eggnog", projectId: "pr_summit_refresh", title: "Holiday eggnog label (requested Sep 30, unpriced)", assigneeId: "p_zoe", status: "todo", due: "2026-10-23", estimateHours: 36, blockerNote: "Needs change order decision" }),

    T({ id: "tk_gold_front", projectId: "pr_gold_launch", milestoneId: "ms_gold_label", title: "Front label: final direction", assigneeId: "p_zoe", status: "in_progress", due: "2026-09-25", estimateHours: 40, revisionRounds: 4, blockerNote: "Founder feedback arriving a week or more after each round" }),
    T({ id: "tk_gold_box", projectId: "pr_gold_launch", milestoneId: "ms_gold_label", title: "Gift box structure and finish", assigneeId: "p_marco", status: "in_progress", due: "2026-10-09", estimateHours: 30, revisionRounds: 2 }),
    T({ id: "tk_gold_story", projectId: "pr_gold_launch", milestoneId: "ms_gold_label", title: "Back label story and legal copy", assigneeId: "p_bea", status: "done", due: "2026-09-18", completedOn: "2026-09-22", estimateHours: 16, revisionRounds: 3 }),
    T({ id: "tk_gold_glass", projectId: "pr_gold_launch", milestoneId: "ms_gold_release", title: "Glass decoration separations", assigneeId: "p_tess", status: "todo", due: "2026-10-30", estimateHours: 30, dependsOn: ["tk_gold_front"] }),
    T({ id: "tk_gold_illustration", projectId: "pr_gold_launch", milestoneId: "ms_gold_label", title: "Hollow oak engraving illustration", assigneeId: "c_juno", status: "done", due: "2026-08-21", completedOn: "2026-08-24", estimateHours: 30, revisionRounds: 2 }),

    T({ id: "tk_fizz_cans", projectId: "pr_fizz_flavors", milestoneId: "ms_fizz_release", title: "Can mechanicals for three flavors", assigneeId: "p_tess", status: "in_progress", due: "2026-10-09", estimateHours: 36 }),
    T({ id: "tk_fizz_designs", projectId: "pr_fizz_flavors", milestoneId: "ms_fizz_concepts", title: "Flavor illustration system", assigneeId: "p_marco", status: "done", due: "2026-08-21", completedOn: "2026-08-20", estimateHours: 40, revisionRounds: 1 }),
    T({ id: "tk_fizz_sellsheets", projectId: "pr_fizz_ret", title: "Q4 retailer sell sheets", assigneeId: "p_bea", status: "in_progress", due: "2026-10-14", estimateHours: 12, revisionRounds: 1 }),

    T({ id: "tk_harvest_claims", projectId: "pr_harvest_bowls", milestoneId: "ms_harvest_claims", title: "Client regulatory sign-off on claims and nutrition panels", assigneeId: "p_olive", status: "blocked", due: "2026-09-25", estimateHours: 2, blockerNote: "With Harvest Table regulatory since Sep 8" }),
    T({ id: "tk_harvest_panels", projectId: "pr_harvest_bowls", milestoneId: "ms_harvest_release", title: "Nutrition panel mechanicals (12 SKUs)", assigneeId: "p_tess", status: "todo", due: "2026-10-23", estimateHours: 40, dependsOn: ["tk_harvest_claims"], blockerNote: "Waiting on claims approval" }),
    T({ id: "tk_harvest_cartons", projectId: "pr_harvest_bowls", milestoneId: "ms_harvest_release", title: "Final carton artwork", assigneeId: "p_marco", status: "todo", due: "2026-10-30", estimateHours: 30, dependsOn: ["tk_harvest_claims"] }),
    T({ id: "tk_harvest_kv", projectId: "pr_harvest_bowls", milestoneId: "ms_harvest_concepts", title: "Carton hero photography direction", assigneeId: "p_zoe", status: "done", due: "2026-07-10", completedOn: "2026-07-10", estimateHours: 24, revisionRounds: 2 }),

    T({ id: "tk_peak_amazon", projectId: "pr_peak_ret", title: "Amazon A+ content modules (unplanned request)", assigneeId: "p_marco", status: "done", due: "2026-07-24", completedOn: "2026-07-24", estimateHours: 24, revisionRounds: 1 }),
    T({ id: "tk_peak_sellsheets", projectId: "pr_peak_ret", title: "Retailer sell sheets for six SKUs (unplanned request)", assigneeId: "p_bea", status: "done", due: "2026-08-21", completedOn: "2026-08-20", estimateHours: 16 }),
    T({ id: "tk_peak_adapt", projectId: "pr_peak_ret", title: "Tub label adaptations for new sizes (unplanned request)", assigneeId: "p_tess", status: "in_progress", due: "2026-09-25", estimateHours: 30 }),
    T({ id: "tk_peak_booth", projectId: "pr_peak_ret", title: "Trade-show booth graphics (requested Oct 1)", assigneeId: "p_lena", status: "todo", due: "2026-11-13", estimateHours: 50, blockerNote: "Not covered by retainer; needs scoping" }),

    T({ id: "tk_north_rfp", projectId: "pr_north_ret", milestoneId: "ms_north_rfp", title: "Agency review pitch and credentials", assigneeId: "p_jess", status: "in_progress", due: "2026-10-21", estimateHours: 24 }),
    T({ id: "tk_north_winter", projectId: "pr_north_ret", title: "Winter variety pack design", assigneeId: "p_marco", status: "in_progress", due: "2026-10-16", estimateHours: 28, revisionRounds: 1 }),
    T({ id: "tk_north_cases", projectId: "pr_north_ret", milestoneId: "ms_north_rfp", title: "Shelf-impact case studies for the pitch", assigneeId: "p_zoe", status: "todo", due: "2026-10-16", estimateHours: 14 }),

    T({ id: "tk_crisp_ups", projectId: "pr_crisp_support", title: "Allergen statement update across 9 flavors", assigneeId: "p_ray", status: "in_progress", due: "2026-10-16", estimateHours: 12 }),

    T({ id: "tk_juniper_ttb", projectId: "pr_juniper_label", milestoneId: "ms_juniper_final", title: "Receive TTB label details from client", assigneeId: "p_lena", status: "blocked", due: "2026-08-21", estimateHours: 1, blockerNote: "No response since Aug 12" }),
    T({ id: "tk_juniper_final", projectId: "pr_juniper_label", milestoneId: "ms_juniper_final", title: "Final label artwork", assigneeId: "p_marco", status: "todo", due: "2026-10-16", estimateHours: 30, dependsOn: ["tk_juniper_ttb"] }),

    T({ id: "tk_oat_positioning", projectId: "pr_oat_brand", milestoneId: "ms_oat_identity", title: "Positioning territories", assigneeId: "p_amara", status: "in_progress", due: "2026-10-16", estimateHours: 30 }),
    T({ id: "tk_oat_identity", projectId: "pr_oat_brand", milestoneId: "ms_oat_identity", title: "Identity sketches", assigneeId: "p_zoe", status: "todo", due: "2026-10-28", estimateHours: 24 }),

    T({ id: "tk_prepress_dielines", projectId: "pr_int_prepress", milestoneId: "ms_prepress_dielines", title: "Digitize dieline library", assigneeId: "p_ray", status: "in_progress", due: "2026-11-13", estimateHours: 40 }),
    T({ id: "tk_cases_designs", projectId: "pr_int_cases", milestoneId: "ms_cases_launch", title: "Case study layouts", assigneeId: "p_marco", status: "todo", due: "2026-09-25", estimateHours: 24, blockerNote: "Marco moved to Summit wave 2" }),
  ];

  const timeEntries = generateTimeEntries(org, projects, timeOff, ({ personId, projectId, week, planned }) => {
    // Juniper Lane: timesheets stop after Aug 24 while the project is still active.
    if (projectId === "pr_juniper_label" && week > "2026-08-24") return null;
    let h = planned;
    // Tess works overtime from August across every launch she touches.
    if (personId === "p_tess" && week >= "2026-08-03") h *= 1.15;
    // Summit refresh overruns from July, once the butter line is absorbed.
    if (projectId === "pr_summit_refresh" && week >= "2026-07-27") h *= 1.25;
    // Gold Hollow: extra label rounds.
    if (projectId === "pr_gold_launch" && week >= "2026-08-24") h *= 1.2;
    // Peak Theory: hours creep up with unplanned requests.
    if (projectId === "pr_peak_ret") h *= week >= "2026-09-01" ? 2 : week >= "2026-08-01" ? 1.6 : week >= "2026-07-01" ? 1.35 : 1;
    // Harvest Table: artwork paused while claims sit with the client.
    if (projectId === "pr_harvest_bowls" && week >= "2026-09-14" && personId !== "p_tess") h *= 0.35;
    // Crisp Mountain: reprint recovery after the UPC catch.
    if (projectId === "pr_crisp_redesign" && week >= "2026-07-20" && week <= "2026-08-17") h *= 1.6;
    return h;
  });

  const E = (id: string, projectId: string | undefined, date: string, category: string, description: string, amount: number): Expense => ({ id, orgId: ORG, projectId, date, category, description, amount, currency: "USD", source: src("accounting", "expenses") });
  const expenses: Expense[] = [
    E("ex_summit_research", "pr_summit_refresh", "2026-04-27", "Research", "Shopper intercepts at six grocery stores", 5_800),
    E("ex_summit_proofs", "pr_summit_refresh", "2026-09-08", "Production", "Wave 1 contract proofs (38 SKUs)", 4_200),
    E("ex_gold_mockups", "pr_gold_launch", "2026-08-10", "Production", "Bottle and label prototypes", 3_900),
    E("ex_gold_trademark", "pr_gold_launch", "2026-05-20", "Legal", "Trademark clearance search", 2_400),
    E("ex_fizz_proofs", "pr_fizz_flavors", "2026-09-14", "Production", "Can wrap proofs", 1_300),
    E("ex_harvest_photo", "pr_harvest_bowls", "2026-07-20", "Production", "Food photography and styling", 9_200),
    E("ex_crisp_reprint", "pr_crisp_redesign", "2026-07-24", "Production", "Plate remake after UPC catch (agency share)", 6_200),
    E("ex_crisp_presscheck", "pr_crisp_redesign", "2026-07-22", "Travel", "Press check travel", 1_100),
    E("ex_north_mockups", "pr_north_variety", "2026-06-15", "Production", "Shipper mockups", 1_600),
    E("ex_oat_naming", "pr_oat_brand", "2026-09-21", "Legal", "Naming trademark screen", 1_800),
    E("ex_prepress_saas", "pr_int_prepress", "2026-07-01", "Software", "Barcode verification software (annual)", 2_900),
  ];

  const PFX = "SM";
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
  const invoices: Invoice[] = [];
  invoices.push(fixedInvoice(org, byId.pr_summit_refresh, "m1", "2026-05-08", 46_250, "Brand architecture (25%)", PFX));
  invoices.push(fixedInvoice(org, byId.pr_summit_refresh, "m2", "2026-06-26", 46_250, "Design direction (25%)", PFX));
  invoices.push(fixedInvoice(org, byId.pr_summit_refresh, "m3", "2026-09-18", 37_000, "Wave 1 release (20%)", PFX));
  invoices.push(fixedInvoice(org, byId.pr_gold_launch, "m0", "2026-05-04", 42_000, "Kick-off (30%)", PFX));
  invoices.push(fixedInvoice(org, byId.pr_gold_launch, "m1", "2026-06-05", 42_000, "Naming & positioning (30%)", PFX));
  invoices.push(fixedInvoice(org, byId.pr_fizz_flavors, "m1", "2026-08-26", 36_000, "Flavor designs (50%)", PFX));
  invoices.push(fixedInvoice(org, byId.pr_harvest_bowls, "m0", "2026-06-01", 35_400, "Kick-off (30%)", PFX));
  invoices.push(fixedInvoice(org, byId.pr_harvest_bowls, "m1", "2026-07-10", 35_400, "Carton concepts (30%)", PFX));
  invoices.push(fixedInvoice(org, byId.pr_north_variety, "m1", "2026-04-13", 23_000, "Kick-off (50%)", PFX));
  invoices.push(fixedInvoice(org, byId.pr_north_variety, "m2", "2026-07-31", 23_000, "Release to print (50%)", PFX));
  invoices.push(fixedInvoice(org, byId.pr_crisp_redesign, "m0", "2026-04-13", 33_600, "Kick-off (30%)", PFX));
  invoices.push(fixedInvoice(org, byId.pr_crisp_redesign, "m1", "2026-06-12", 44_800, "Designs approved (40%)", PFX));
  invoices.push(fixedInvoice(org, byId.pr_crisp_redesign, "m2", "2026-09-18", 33_600, "Press check & first run (30%)", PFX));
  invoices.push(...retainerInvoices(org, byId.pr_fizz_ret, 11_000, "2026-02-01", "2027-01-31", PFX));
  invoices.push(...retainerInvoices(org, byId.pr_peak_ret, 7_500, "2026-03-01", "2027-02-28", PFX));
  invoices.push(...retainerInvoices(org, byId.pr_north_ret, 18_000, "2025-12-01", "2026-11-30", PFX));
  invoices.push(...retainerInvoices(org, byId.pr_crisp_support, 4_500, "2026-08-01", "2027-07-31", PFX));
  for (const id of ["pr_juniper_label", "pr_oat_brand"]) invoices.push(...tmInvoices(org, byId[id], timeEntries, billRates, PFX));
  invoices.sort((a, b) => (a.issueDate < b.issueDate ? -1 : 1));

  const payments = generatePayments(
    org,
    invoices,
    { a_summit: -2, a_goldhollow: -1, a_fizzwell: 0, a_harvest: 6, a_peaktheory: 2, a_northfork: 3, a_crisp: 1, a_juniper: 0, a_oattheory: 0 },
    new Set(["inv_pr_harvest_bowls_m1"]),
  );

  // Retail launches: shelf dates set by the retailer, printer lead times set by the converter.
  const L = (l: Omit<RetailLaunch, "orgId" | "source">): RetailLaunch => ({ orgId: ORG, source: src("sheets", "launch-calendar"), ...l });
  const retailLaunches: RetailLaunch[] = [
    L({ id: "lc_harvest_bowls", accountId: "a_harvest", projectId: "pr_harvest_bowls", name: "Harvest Table protein bowls", retailers: ["Target", "Kroger"], skus: 12, shelfDate: "2027-01-11", printLeadWeeks: 10, releaseMilestoneId: "ms_harvest_release", printer: "Ridgeline Folding Cartons" }),
    L({ id: "lc_gold_bourbon", accountId: "a_goldhollow", projectId: "pr_gold_launch", name: "Gold Hollow small-batch bourbon", retailers: ["Total Wine & More", "state distributors"], skus: 2, shelfDate: "2027-02-22", printLeadWeeks: 16, releaseMilestoneId: "ms_gold_release", printer: "Sierra Glass Decorators" }),
    L({ id: "lc_summit_w2", accountId: "a_summit", projectId: "pr_summit_refresh", name: "Summit wave 2: yogurt & cultured butter", retailers: ["Whole Foods Market", "Sprouts"], skus: 24, shelfDate: "2027-02-01", printLeadWeeks: 8, releaseMilestoneId: "ms_summit_w2", printer: "Front Range Flexo" }),
    L({ id: "lc_fizz_flavors", accountId: "a_fizzwell", projectId: "pr_fizz_flavors", name: "Fizzwell winter flavors", retailers: ["Sprouts", "Target"], skus: 3, shelfDate: "2026-12-01", printLeadWeeks: 5, releaseMilestoneId: "ms_fizz_release", printer: "Pacific Can Decorating" }),
    L({ id: "lc_summit_w1", accountId: "a_summit", projectId: "pr_summit_refresh", name: "Summit wave 1: fluid milk & cream", retailers: ["Whole Foods Market", "King Soopers"], skus: 38, shelfDate: "2026-11-16", printLeadWeeks: 8, releaseMilestoneId: "ms_summit_w1", printer: "Front Range Flexo" }),
    L({ id: "lc_north_variety", accountId: "a_northfork", projectId: "pr_north_variety", name: "Northfork summer variety pack", retailers: ["Safeway", "Costco"], skus: 1, shelfDate: "2026-08-17", printLeadWeeks: 7, releaseMilestoneId: "ms_north_variety", printer: "Pacific Can Decorating" }),
  ];

  const threads = [
    thread(ORG, "th_summit_design", { accountId: "a_summit", projectId: "pr_summit_refresh", channel: "email", subject: "Design direction", location: "jess@shelfmark.example" }, [
      ["2026-06-29", "Karen Lindgren", "client", "Our member farmers loved the new design direction. It finally looks like the co-op on shelf, and the barn mark is fantastic."],
      ["2026-06-29T17:00:00Z", "Jess Okoro", "internal", "Thank you Karen. We'll move into wave 1 mechanicals next week."],
    ]),
    thread(ORG, "th_summit_butter", { accountId: "a_summit", projectId: "pr_summit_refresh", channel: "slack", subject: "#ext-summit: cultured butter", location: "#ext-summit" }, [
      ["2026-07-27", "Karen Lindgren", "client", "Thank you so much for folding the cultured butter line into wave 2. The board is thrilled it launches with everything else."],
      ["2026-07-27T16:10:00Z", "Olive Grant", "internal", "Note for the team: the butter line was outside the original scope and we are absorbing about 160 hours as goodwill."],
    ]),
    thread(ORG, "th_summit_w1", { accountId: "a_summit", projectId: "pr_summit_refresh", channel: "email", subject: "Wave 1 is at the printer", location: "jess@shelfmark.example" }, [
      ["2026-09-21", "Tom Becker", "client", "Really pleased with how smooth the wave 1 handoff to Front Range was. Proofs matched and they're on press next week."],
    ]),
    thread(ORG, "th_summit_eggnog", { accountId: "a_summit", projectId: "pr_summit_refresh", channel: "email", subject: "One more label", location: "jess@shelfmark.example" }, [
      ["2026-09-30", "Karen Lindgren", "client", "Love the wave 2 butter cartons. Could you also do a holiday eggnog label? Our sales team just got a regional slot."],
      ["2026-09-30T18:00:00Z", "Jess Okoro", "internal", "Happy to. Let me come back with timing and cost."],
    ]),
    thread(ORG, "th_summit_delivery", { accountId: "a_summit", projectId: "pr_summit_refresh", channel: "slack", subject: "#delivery-summit: wave 2 plan", location: "#delivery-summit" }, [
      ["2026-10-02", "Olive Grant", "internal", "Wave 2 release holds at Nov 20 but only because Tess is working late. We're over budget by about a fifth on this refresh. Client is delighted, so let's price the eggnog label properly."],
    ]),

    thread(ORG, "th_gold_naming", { accountId: "a_goldhollow", projectId: "pr_gold_launch", channel: "email", subject: "Naming presentation moved", location: "carter@shelfmark.example" }, [
      ["2026-05-27", "Wes Calloway", "client", "This is the second time the naming presentation has been moved. I need more reliable communication from the team."],
      ["2026-05-27T19:00:00Z", "Carter Nguyen", "internal", "Understood Wes, and I'm sorry. The trademark search came back late; we'll present on June 5 with clearance done."],
    ]),
    thread(ORG, "th_gold_label", { accountId: "a_goldhollow", projectId: "pr_gold_launch", channel: "email", subject: "Front label round 3", location: "carter@shelfmark.example" }, [
      ["2026-09-08", "Wes Calloway", "client", "We're on the third round of the front label and it still doesn't feel premium enough next to the bottles on a Total Wine shelf. Frustrated, honestly."],
      ["2026-09-08T20:00:00Z", "Hugo Silva", "internal", "Heard. Zoe and I will bring two tighter options to a working session this week instead of another emailed round."],
      ["2026-09-21", "Dana Pruitt", "client", "As I mentioned on the call, the gold foil still reads flat on the samples. Same issues as round two."],
    ]),
    thread(ORG, "th_gold_status", { accountId: "a_goldhollow", projectId: "pr_gold_launch", channel: "email", subject: "Timeline", location: "carter@shelfmark.example" }, [
      ["2026-09-24", "Wes Calloway", "client", "We're losing confidence in the timeline. Sierra needs files in early November for the glass, and it's hard to get a response from the team between sessions."],
      ["2026-09-24T21:00:00Z", "Carter Nguyen", "internal", "Understood. Starting this week Dev will send a written status every Friday and I'll join the Tuesday working session."],
    ]),
    thread(ORG, "th_gold_slack", { accountId: "a_goldhollow", projectId: "pr_gold_launch", channel: "slack", subject: "#ext-goldhollow: status", location: "#ext-goldhollow" }, [
      ["2026-10-02", "Dana Pruitt", "client", "The written status was helpful, thank you. Disappointed the label approval slipped again though."],
    ]),
    thread(ORG, "th_gold_ap", { accountId: "a_goldhollow", channel: "email", subject: "Remittance", location: "accounts@shelfmark.example", tags: ["billing"] }, [
      ["2026-07-06", "Dana Pruitt", "client", "Payment for the naming milestone invoice has been sent. Remittance attached."],
    ]),

    thread(ORG, "th_fizz_flavors", { accountId: "a_fizzwell", projectId: "pr_fizz_flavors", channel: "email", subject: "Flavor designs", location: "jess@shelfmark.example" }, [
      ["2026-08-27", "Leo Ashford", "client", "Great work on the flavor designs. The yuzu can is already the team favorite and Sprouts loved the sell-in renders."],
    ]),
    thread(ORG, "th_fizz_expansion", { accountId: "a_fizzwell", channel: "email", subject: "Next year", location: "jess@shelfmark.example" }, [
      ["2026-09-29", "Priya Raman", "client", "We'd love to talk about a new DTC website for Q1, and we have budget set aside for it. Our Shopify site doesn't match the packaging anymore."],
      ["2026-09-29T16:30:00Z", "Jess Okoro", "internal", "That's great to hear. I'll propose a scoping session."],
    ]),
    thread(ORG, "th_fizz_booth", { accountId: "a_fizzwell", channel: "slack", subject: "#ext-fizzwell: trade show", location: "#ext-fizzwell" }, [
      ["2026-10-01", "Leo Ashford", "client", "Following up on Priya's note: could you help us with a trade show booth for Expo West too? We're also interested in shelf talkers for the Target reset."],
      ["2026-10-01T14:10:00Z", "Jess Okoro", "internal", "Yes. I'll send times for a scoping session the week of Oct 12."],
    ]),

    thread(ORG, "th_harvest_claims", { accountId: "a_harvest", projectId: "pr_harvest_bowls", channel: "email", subject: "Claims & nutrition panels: approval", location: "carter@shelfmark.example" }, [
      ["2026-09-08", "Olive Grant", "internal", "Final carton art, claims sheet and all 12 nutrition panels attached for sign-off."],
      ["2026-09-15", "Monica Reyes", "client", "Thanks. The high-protein claim is still with legal review; our regulatory team should have sign-off next week."],
      ["2026-09-28", "Monica Reyes", "client", "Apologies, we're still waiting on approval from regulatory. Our CFO also said budget is tight this quarter."],
      ["2026-10-01", "Carter Nguyen", "internal", "Gentle nudge: Ridgeline needs final files by Nov 2 for the Jan 11 Target and Kroger reset. Release will need to move to Nov 6 unless we hear back."],
    ]),
    thread(ORG, "th_harvest_ap", { accountId: "a_harvest", channel: "email", subject: "Overdue invoice SM-2218", location: "accounts@shelfmark.example", tags: ["billing"] }, [
      ["2026-09-14", "Eli Brandt", "internal", "Invoice SM-2218 for the carton concepts milestone is now 36 days overdue. Could you confirm a payment date?"],
      ["2026-09-16", "Accounts Payable", "client", "It's pending approval on our side because it's tied to the launch milestone. We'll update you once regulatory signs off."],
    ]),
    thread(ORG, "th_harvest_concepts", { accountId: "a_harvest", projectId: "pr_harvest_bowls", channel: "slack", subject: "#ext-harvest: concepts", location: "#ext-harvest" }, [
      ["2026-07-13", "Monica Reyes", "client", "The carton concepts look fantastic. The bowls finally look premium in the freezer door."],
    ]),

    thread(ORG, "th_peak_amazon", { accountId: "a_peaktheory", projectId: "pr_peak_ret", channel: "slack", subject: "#ext-peaktheory: Amazon", location: "#ext-peaktheory" }, [
      ["2026-07-13", "Jordan Ellis", "client", "Quick addition: could you also put together Amazon A+ content for the collagen line? Should be quick."],
    ]),
    thread(ORG, "th_peak_sellsheets", { accountId: "a_peaktheory", projectId: "pr_peak_ret", channel: "slack", subject: "#ext-peaktheory: sell sheets", location: "#ext-peaktheory" }, [
      ["2026-08-10", "Jordan Ellis", "client", "One more thing: can we add sell sheets for the six SKUs we're pitching to grocery?"],
    ]),
    thread(ORG, "th_peak_sizes", { accountId: "a_peaktheory", projectId: "pr_peak_ret", channel: "email", subject: "New tub sizes", location: "lena@shelfmark.example" }, [
      ["2026-09-07", "Jordan Ellis", "client", "While you're at it, could you also adapt the tub labels for the new travel sizes? Should be small."],
    ]),
    thread(ORG, "th_peak_internal", { accountId: "a_peaktheory", projectId: "pr_peak_ret", channel: "slack", subject: "#delivery-peaktheory: hours", location: "#delivery-peaktheory" }, [
      ["2026-09-25", "Lena Fischer", "internal", "Peak Theory hours are well beyond the retainer: about 90 hours against 50 included in September. We haven't billed any overage and every request has been outside the retainer scope."],
    ]),
    thread(ORG, "th_peak_booth", { accountId: "a_peaktheory", projectId: "pr_peak_ret", channel: "slack", subject: "#ext-peaktheory: booth", location: "#ext-peaktheory" }, [
      ["2026-10-01", "Jordan Ellis", "client", "Love the work so far. Can we add booth graphics for the supplement expo next? Would be great before November."],
    ]),

    thread(ORG, "th_north_parent", { accountId: "a_northfork", channel: "email", subject: "Cascadia integration", location: "jess@shelfmark.example" }, [
      ["2026-08-18", "Alyssa Grant", "client", "Heads up: now that Cascadia Beverage Group owns us, they've asked brands to reduce spend on agencies next year. Budget cuts are likely."],
      ["2026-08-18T18:30:00Z", "Jess Okoro", "internal", "Thanks for the early warning, Alyssa. Happy to help you plan for it."],
    ]),
    thread(ORG, "th_north_procurement", { accountId: "a_northfork", channel: "email", subject: "Procurement review", location: "jess@shelfmark.example" }, [
      ["2026-09-10", "Ben Ortiz", "client", "As part of Cascadia's procurement review, we're required to run an RFP for design services before any renewal."],
    ]),
    thread(ORG, "th_north_rfp", { accountId: "a_northfork", channel: "email", subject: "Agency review", location: "jess@shelfmark.example" }, [
      ["2026-09-23", "Alyssa Grant", "client", "To be transparent, Cascadia is evaluating other agencies, including their roster agency, and considering whether to bring some of this in-house."],
      ["2026-09-23T20:00:00Z", "Jess Okoro", "internal", "Appreciate the candour. We'll put forward a strong proposal."],
    ]),
    thread(ORG, "th_north_notice", { accountId: "a_northfork", channel: "email", subject: "Notice period", location: "jess@shelfmark.example" }, [
      ["2026-10-01", "Alyssa Grant", "client", "Please note the notice period in our agreement: we'll confirm by Oct 31 whether we renew the retainer."],
    ]),
    thread(ORG, "th_north_variety", { accountId: "a_northfork", projectId: "pr_north_variety", channel: "slack", subject: "#ext-northfork: variety pack sell-through", location: "#ext-northfork" }, [
      ["2026-08-31", "Alyssa Grant", "client", "The summer variety pack sold through faster than any pack we've done. Great work on this."],
    ]),

    thread(ORG, "th_crisp_upc", { accountId: "a_crisp", projectId: "pr_crisp_redesign", channel: "email", subject: "URGENT: barcode on press", location: "jess@shelfmark.example" }, [
      ["2026-07-22T13:10:00Z", "Hank Sorensen", "client", "Our press check found the wrong UPC on the sea salt family-size bag. 40,000 bags were about to run. This is unacceptable."],
      ["2026-07-22T13:40:00Z", "Tess Abbott", "internal", "Stopping the run now. Pulling the source files to trace it."],
      ["2026-07-23", "Hank Sorensen", "client", "Still waiting to hear how this happened. Very frustrated, we had a retailer date riding on this."],
      ["2026-07-24", "Tess Abbott", "internal", "Root cause found: the barcode was placed from a superseded spec sheet. Corrected files are with the printer, plates are being remade at our cost, and the run is rebooked."],
      ["2026-07-28", "Hank Sorensen", "client", "Confirmed all working on the new proofs. Thanks for owning it quickly."],
    ]),
    thread(ORG, "th_crisp_pir", { accountId: "a_crisp", projectId: "pr_crisp_redesign", channel: "email", subject: "Post-incident review", location: "jess@shelfmark.example" }, [
      ["2026-08-05", "Jess Okoro", "internal", "Root cause document attached. The issue is closed: every release now goes through a barcode verification scan and a second-person spec check."],
      ["2026-08-06", "Hank Sorensen", "client", "Appreciate the transparency. Happy with the plan."],
    ]),
    thread(ORG, "th_crisp_launch", { accountId: "a_crisp", projectId: "pr_crisp_redesign", channel: "slack", subject: "#ext-crisp: on shelf", location: "#ext-crisp" }, [
      ["2026-09-28", "Mia Torres", "client", "The new bags hit shelves and the launch went smoothly. Our buyers loved the flavor color system."],
    ]),

    thread(ORG, "th_juniper_kickoff", { accountId: "a_juniper", projectId: "pr_juniper_label", channel: "email", subject: "Label kickoff", location: "lena@shelfmark.example" }, [
      ["2026-07-15", "Ari Holm", "client", "Looking forward to the refresh. Brief looks good."],
    ]),
    thread(ORG, "th_juniper_ttb", { accountId: "a_juniper", projectId: "pr_juniper_label", channel: "email", subject: "TTB details", location: "lena@shelfmark.example" }, [
      ["2026-08-12", "Ari Holm", "client", "We'll send the TTB label approval details next week."],
      ["2026-08-12T17:00:00Z", "Lena Fischer", "internal", "Thanks Ari, we'll keep the concepts moving in the meantime."],
    ]),

    thread(ORG, "th_oat_kickoff", { accountId: "a_oattheory", projectId: "pr_oat_brand", channel: "email", subject: "Brand kickoff", location: "lena@shelfmark.example" }, [
      ["2026-09-09", "Sasha Patel", "client", "Excited to start. We've got our trade-show slot confirmed for March."],
      ["2026-10-01", "Sasha Patel", "client", "Really pleased with the naming shortlist. It's exactly what we needed. We'd love to talk about our website after this phase."],
    ]),

    // Design feedback that names people, for the department view. Dated no later than each account's latest client message.
    thread(ORG, "th_gold_box", { accountId: "a_goldhollow", projectId: "pr_gold_launch", channel: "email", subject: "Gift box", location: "carter@shelfmark.example" }, [
      ["2026-09-21", "Dana Pruitt", "client", "Marco's gift box structure is lovely and the retailers we showed it to loved it. Keep the spot UV."],
    ]),
    thread(ORG, "th_gold_story", { accountId: "a_goldhollow", projectId: "pr_gold_launch", channel: "email", subject: "Back label copy", location: "carter@shelfmark.example" }, [
      ["2026-09-15", "Wes Calloway", "client", "Bea's back label story needed another round for the legal statements. Can we get the TTB requirements checked before copy comes to us?"],
      ["2026-09-15T18:00:00Z", "Bea Laurent", "internal", "Understood. I'll run every draft past the TTB checklist first."],
      ["2026-09-21", "Wes Calloway", "client", "The revised back label from Bea came through clean. Much better."],
    ]),
    thread(ORG, "th_summit_wave1_design", { accountId: "a_summit", projectId: "pr_summit_refresh", channel: "slack", subject: "#ext-summit: wave 1 designs", location: "#ext-summit" }, [
      ["2026-09-21", "Tom Becker", "client", "Zoe's wave 1 system made the printer's job easy. Not a single color correction on 38 SKUs."],
    ]),
    thread(ORG, "th_peak_amazon_copy", { accountId: "a_peaktheory", projectId: "pr_peak_ret", channel: "slack", subject: "#ext-peaktheory: Amazon modules", location: "#ext-peaktheory" }, [
      ["2026-07-24", "Jordan Ellis", "client", "Fast turnaround from Marco on the Amazon modules. Spot on for the brand."],
    ]),
    thread(ORG, "th_gold_illustration", { accountId: "a_goldhollow", projectId: "pr_gold_launch", channel: "slack", subject: "#ext-goldhollow: illustration", location: "#ext-goldhollow" }, [
      ["2026-08-26", "Wes Calloway", "client", "Juno's engraving of the hollow oak is the strongest thing on the label. It took a couple of rounds but it was worth it."],
    ]),
    thread(ORG, "th_design_load", { accountId: "a_summit", projectId: "pr_summit_refresh", channel: "slack", subject: "#delivery-summit: design load", location: "#delivery-summit" }, [
      ["2026-10-01T16:00:00Z", "Hugo Silva", "internal", "Marco is carrying Summit butter cartons, Harvest cartons, the Northfork winter pack and the studio case studies. I'll protect Summit and Harvest first and move the case studies."],
    ]),
  ];

  const A = (a: Omit<Action, "orgId" | "comments" | "createdAt" | "origin"> & Partial<Pick<Action, "comments" | "createdAt" | "origin">>): Action => ({ orgId: ORG, comments: [], createdAt: "2026-09-20T10:00:00Z", origin: "seed", ...a });
  const actions: Action[] = [
    A({ id: "act_gold_reset", title: "Replace emailed label rounds with weekly working sessions at Gold Hollow", description: "Agree one decision-maker, a written status every Friday and a feedback turnaround of two working days.", ownerId: "p_carter", dueDate: "2026-10-09", status: "in_progress", severity: "high", impact: "Protects a new client showing repeated dissatisfaction", accountId: "a_goldhollow", createdBy: "p_maya", links: [{ type: "account", id: "a_goldhollow" }, { type: "thread", id: "th_gold_status" }], comments: [{ id: "cm_g1", authorId: "p_carter", at: "2026-09-25T09:00:00Z", body: "Friday status started Sep 25; first working session booked." }] }),
    A({ id: "act_harvest_chase", title: "Escalate Harvest Table claims approval to the Director of Brand", description: "Ask for a decision date; explain the printer deadline for the Jan 11 reset.", ownerId: "p_olive", dueDate: "2026-10-02", status: "open", severity: "high", impact: "Unblocks the Target & Kroger launch and an overdue invoice", accountId: "a_harvest", createdBy: "p_carter", links: [{ type: "milestone", id: "ms_harvest_claims" }, { type: "invoice", id: "inv_pr_harvest_bowls_m1" }] }),
    A({ id: "act_tess_rebalance", title: "Rebalance Tess Abbott's production load", description: "Move Peak Theory adaptations and Crisp support to Ray and Peakline Prepress.", ownerId: "p_olive", dueDate: "2026-10-09", status: "open", severity: "high", impact: "Protects the Summit wave 2 and Harvest release dates", createdBy: "p_maya", links: [{ type: "person", id: "p_tess" }, { type: "task", id: "tk_harvest_panels" }] }),
    A({ id: "act_crisp_pir", title: "Run Crisp Mountain post-incident review", description: "Share root cause and the barcode verification step.", ownerId: "p_jess", dueDate: "2026-08-07", status: "done", severity: "high", impact: "Restored client confidence after the UPC catch", accountId: "a_crisp", createdBy: "p_maya", createdAt: "2026-07-24T10:00:00Z", links: [{ type: "thread", id: "th_crisp_pir" }] }),
  ];

  const connectors: ConnectorStatus[] = [
    {
      id: "con_asana", orgId: ORG, provider: "Asana", kind: "project_management", mode: "simulated", state: "healthy",
      lastSuccessfulSync: "2026-10-05T06:00:00Z", lastAttempt: "2026-10-05T06:00:00Z",
      scopes: [{ scope: "Read projects, tasks & time tracking", granted: true }, { scope: "Write tasks", granted: false, note: "Not requested: OpsInstinct is read-only" }],
      included: ["Client Work portfolio", "Studio Ops portfolio"], excluded: [{ name: "People team", reason: "Excluded by administrator" }],
      failures: [], authoritativeFor: ["Projects", "Milestones", "Tasks", "Time entries"],
    },
    {
      id: "con_gmail", orgId: ORG, provider: "Google Workspace Gmail", kind: "communications", mode: "simulated", state: "healthy",
      lastSuccessfulSync: "2026-10-05T05:30:00Z", lastAttempt: "2026-10-05T05:30:00Z",
      scopes: [{ scope: "gmail.readonly (authorized mailboxes only)", granted: true }],
      included: ["jess@shelfmark.example", "carter@shelfmark.example", "lena@shelfmark.example", "accounts@shelfmark.example"],
      excluded: [{ name: "maya@shelfmark.example", reason: "Executive mailbox not authorized for analysis" }, { name: "Labels: Personal, Legal-privileged", reason: "Label exclusion" }],
      failures: [], authoritativeFor: ["Client email threads"],
    },
    {
      id: "con_slack", orgId: ORG, provider: "Slack", kind: "communications", mode: "simulated", state: "degraded",
      lastSuccessfulSync: "2026-10-05T05:45:00Z", lastAttempt: "2026-10-05T05:45:00Z",
      scopes: [{ scope: "channels:history (explicitly added channels)", granted: true }, { scope: "Direct messages", granted: false, note: "Never requested" }],
      included: ["#ext-summit", "#ext-goldhollow", "#ext-fizzwell", "#ext-harvest", "#ext-peaktheory", "#ext-northfork", "#ext-crisp", "#delivery-summit", "#delivery-peaktheory"],
      excluded: [{ name: "#leadership", reason: "Not authorized for analysis" }],
      failures: [{ at: "2026-10-05T05:45:00Z", message: "Slack Connect channel #ext-juniper: app not added by the client's workspace. No messages ingested since Aug 10.", recordRef: "#ext-juniper" }],
      authoritativeFor: ["Slack threads"],
    },
    {
      id: "con_accounting", orgId: ORG, provider: "Accounting provider (to be selected)", kind: "finance", mode: "simulated", state: "healthy",
      lastSuccessfulSync: "2026-10-05T04:00:00Z", lastAttempt: "2026-10-05T04:00:00Z",
      scopes: [{ scope: "Read invoices, payments, bank balance", granted: true }],
      included: ["Accounts receivable", "Bank feed (operating account)"], excluded: [{ name: "Payroll journals", reason: "Compensation sourced from restricted Sheets dataset" }],
      failures: [], authoritativeFor: ["Invoices", "Payments", "Bank balance"],
    },
    {
      id: "con_sheets", orgId: ORG, provider: "Google Sheets", kind: "spreadsheet", mode: "simulated", state: "stale",
      lastSuccessfulSync: "2026-09-01T09:00:00Z", lastAttempt: "2026-09-01T09:00:00Z",
      scopes: [{ scope: "drive.file read-only (selected spreadsheets)", granted: true }],
      included: ["Shelfmark Finance Workbook", "Compensation 2026 (restricted)", "Retail launch calendar"], excluded: [],
      failures: [], authoritativeFor: ["Compensation & employer costs", "Billable rates", "Contracts", "Retail launch calendar (shelf dates, print lead times)"],
    },
    { id: "con_crm", orgId: ORG, provider: "CRM (not selected)", kind: "crm", mode: "simulated", state: "not_configured", scopes: [], included: [], excluded: [], failures: [], authoritativeFor: ["Pipeline (future)"] },
  ];

  const mappings: EntityMapping[] = [
    { id: "map_as_summit", orgId: ORG, connectorId: "con_asana", externalName: "Summit Creamery / Refresh 2026", externalId: "as_118", suggestedAccountId: "a_summit", suggestedProjectId: "pr_summit_refresh", confidence: "high", status: "confirmed", reason: "Exact name match, confirmed by Wren Castillo" },
    { id: "map_as_harvest", orgId: ORG, connectorId: "con_asana", externalName: "HTF / Protein Bowls", externalId: "as_131", suggestedAccountId: "a_harvest", suggestedProjectId: "pr_harvest_bowls", confidence: "high", status: "confirmed", reason: "Alias match (HTF)" },
    { id: "map_as_oat", orgId: ORG, connectorId: "con_asana", externalName: "OT / new brand", externalId: "as_140", suggestedAccountId: "a_oattheory", suggestedProjectId: "pr_oat_brand", confidence: "medium", status: "needs_review", reason: "Ambiguous: 'OT' also matches an archived prospect 'Orchard Tea'" },
    { id: "map_slack_juniper", orgId: ORG, connectorId: "con_slack", externalName: "#ext-juniper", externalId: "C07JUNIPER", suggestedAccountId: "a_juniper", confidence: "high", status: "needs_review", reason: "Channel name matches, but the app is not a member so no history is available" },
    { id: "map_gmail_peakline", orgId: ORG, connectorId: "con_gmail", externalName: "peaklineprepress.example (domain)", externalId: "dom_peakline", confidence: "low", status: "needs_review", reason: "Supplier domain, not a client. Suggest excluding from client analysis." },
  ];

  return {
    org,
    businessUnits: [],
    people,
    compensation,
    billRates,
    timeOff,
    accounts,
    contracts,
    projects,
    milestones,
    tasks,
    timeEntries,
    expenses,
    invoices,
    payments,
    subscriptions: [],
    mediaFlights: [],
    retailLaunches,
    threads,
    actions,
    connectors,
    mappings,
    opportunitySeeds: {
      sig_a_fizzwell_expansion_interest: { estimatedValue: 95_000, estimatedBy: "p_jess", nextStep: "Run DTC site and trade-show scoping session week of Oct 12" },
    },
  };
}
