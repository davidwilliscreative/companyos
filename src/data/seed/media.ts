import type { Account, Action, ConnectorStatus, Contract, Dataset, EntityMapping, Expense, ISODate, Invoice, MediaFlight, Milestone, Organization, Person, Project, Task, TimeOff } from "@/domain/types";
import { addDays, daysBetween, maxDate, minDate, mondayOf, mondaysBetween } from "@/lib/dates";
import { comp, contractorCost, fixedInvoice, generatePayments, generateTimeEntries, hashString, lastCompleteWeek, mulberry32, normalizeLoads, rate, resetInvoiceCounter, retainerInvoices, src, thread, tmInvoices } from "./helpers";

/**
 * Media profile: "Tempo Collective", a 20-person digital-first media, data and content company.
 * Modelled on what media and marketing-services companies like this do (paid media planning and
 * buying across search, social, programmatic, CTV and retail media; measurement; a studio producing
 * content at scale; AI-assisted content operations), with fictional company, client and people names
 * and no real client data.
 *
 * What makes it different from the general agency profile: the agency is paid fees (media management
 * retainers, studio and measurement projects) while it spends the client's money. Each client's media
 * plan is a set of flights with a budget, platform-reported weekly spend and a KPI target, so pacing
 * (over- or under-spend) and KPI performance are first-class risks next to margin and delivery.
 *
 * Scenarios:
 *  1. Satisfied client, unprofitable project ........ Solstice Hotels (content studio for 40 properties)
 *  2. Unhappy client, invoices current .............. Bloomfield Home (Meta ROAS below target, Pinterest underpacing)
 *  3. Profitable account with credible expansion .... Arcwave Mobile (MMM and CTV scale-up)
 *  4. Launch waiting on client approval ............. Kinetic Footwear (hero film held; launch flights underpacing)
 *  5. Retainer with scope creep ..................... Crestline Bank (ad hoc reporting; LinkedIn overpacing)
 *  6. Renewal risk across several conversations ..... Hearthstone Foods (retail media going in-house, RFP)
 *  7. Overloaded team member across projects ........ Kara Singh, Senior Paid Social Manager
 *  8. Serious issue that has been resolved .......... Voltra EV (conversion tracking broke after a site migration)
 *  9. Stale / insufficient information .............. Northstar Pet (platform access lost, no spend data since August)
 *
 * Department head example: Luis Ferreira, Head of Paid Media (Kara, Jonah, Inês and Tyler).
 */

const ORG = "org_tempo";

export function buildMedia(): Dataset {
  resetInvoiceCounter(5400);
  const org: Organization = {
    id: ORG,
    name: "Tempo Collective",
    profileId: "media",
    reportingCurrency: "USD",
    demoDate: "2026-10-05",
    dataStart: "2026-04-01",
    annualWorkingHours: 1800,
    hoursPerWeek: 40,
    openingCash: { date: "2026-10-05", amount: 948_000, currency: "USD", source: src("accounting", "bank-balance") },
    overheadMonthly: [
      { label: "Offices & facilities", amount: 26_000 },
      { label: "Ad tech, data & software", amount: 18_500 },
      { label: "Insurance, legal & admin", amount: 9_500 },
    ],
    defaultTargetMargin: 0.4,
    billableUtilizationTarget: 0.78,
    serviceCatalog: [
      { id: "svc_paid", name: "Paid media planning & buying", keywords: ["paid social", "search", "media plan", "always-on", "performance media"] },
      { id: "svc_ctv", name: "Programmatic & CTV", keywords: ["ctv", "connected tv", "programmatic", "streaming"] },
      { id: "svc_retail", name: "Retail media", keywords: ["retail media", "amazon ads", "walmart connect", "instacart"] },
      { id: "svc_measure", name: "Measurement & marketing mix modeling", keywords: ["marketing mix", "mmm", "incrementality", "measurement", "attribution", "dashboard"] },
      { id: "svc_studio", name: "Studio: content at scale", keywords: ["content", "cut-downs", "creative versions", "localization", "studio"] },
      { id: "svc_orchestration", name: "AI-assisted content operations", keywords: ["content supply chain", "versioning", "automation", "ai"] },
    ],
    demoPersonas: { executive: "p_ava", finance: "p_rafael", account_owner: "p_nadia", department_head: "p_luis", admin: "p_ezra" },
    departments: [{ name: "Paid Media", headId: "p_luis" }],
  };

  const person = (id: string, name: string, title: string, role: string, department: string, startDate = "2022-03-07", type: Person["type"] = "employee", fte = 1): Person => ({
    id,
    orgId: ORG,
    name,
    title,
    role,
    department,
    type,
    fte,
    startDate,
    email: `${name.split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}@tempo.example`,
  });

  const people: Person[] = [
    person("p_ava", "Ava Lindqvist", "Chief Executive Officer", "Executive", "Leadership", "2017-02-01"),
    person("p_rafael", "Rafael Ortiz", "Finance Director", "Finance", "Operations", "2020-05-04"),
    person("p_nadia", "Nadia Haddad", "Client Partner", "Account management", "Client Services", "2019-09-02"),
    person("p_owen", "Owen Price", "Client Partner", "Account management", "Client Services", "2021-01-18"),
    person("p_mei", "Mei Tanaka", "Account Director", "Account management", "Client Services", "2022-06-06"),
    person("p_luis", "Luis Ferreira", "Head of Paid Media", "Department head", "Paid Media", "2018-11-05"),
    person("p_kara", "Kara Singh", "Senior Paid Social Manager", "Media buyer", "Paid Media", "2021-03-01"),
    person("p_jonah", "Jonah Weiss", "Search & Shopping Manager", "Media buyer", "Paid Media", "2022-08-15"),
    person("p_ines", "Inês Costa", "Programmatic & CTV Trader", "Media buyer", "Paid Media", "2023-04-03"),
    person("p_tyler", "Tyler Brooks", "Media Planner", "Media planner", "Paid Media", "2024-07-08"),
    person("p_sana", "Sana Mirza", "Head of Measurement", "Analyst", "Data & Measurement", "2020-10-12"),
    person("p_felipe", "Felipe Rocha", "Data Analyst", "Analyst", "Data & Measurement", "2024-02-12"),
    person("p_hana", "Hana Ito", "Studio Lead", "Producer", "Studio", "2019-04-01"),
    person("p_drew", "Drew Collins", "Motion Designer", "Designer", "Studio", "2023-01-09"),
    person("p_fern", "Fern Adeyemi", "Content Producer", "Producer", "Studio", "2023-10-02"),
    person("p_max", "Max Becker", "Marketing Technologist", "Developer", "Technology", "2022-01-10"),
    person("p_claire", "Claire Moss", "Program Director", "Project manager", "Delivery", "2020-02-03"),
    person("p_ezra", "Ezra Hale", "Platform & Systems Administrator", "Operations", "Operations", "2021-09-13"),
    { ...person("c_loop", "Loopframe Studio", "Localization partner (EU)", "Producer", "Studio", "2026-04-01", "contractor", 0.5), email: "hello@loopframe.example" },
    { ...person("c_rio", "Rio Santos", "Freelance Video Editor", "Designer", "Studio", "2026-06-01", "contractor", 0.5), email: "rio@riosantos.example" },
  ];

  const compensation = [
    comp(ORG, "p_ava", "2026-01-01", 240_000, 42_000),
    comp(ORG, "p_rafael", "2026-01-01", 165_000, 30_000),
    comp(ORG, "p_nadia", "2026-01-01", 168_000, 31_000),
    comp(ORG, "p_owen", "2026-01-01", 160_000, 29_500),
    comp(ORG, "p_mei", "2026-01-01", 130_000, 24_000),
    comp(ORG, "p_luis", "2026-01-01", 172_000, 32_000),
    comp(ORG, "p_kara", "2026-01-01", 118_000, 22_000),
    comp(ORG, "p_jonah", "2026-01-01", 108_000, 20_500),
    comp(ORG, "p_ines", "2026-01-01", 112_000, 21_000),
    comp(ORG, "p_tyler", "2026-01-01", 84_000, 16_000),
    comp(ORG, "p_sana", "2026-01-01", 158_000, 29_000),
    comp(ORG, "p_felipe", "2026-01-01", 96_000, 18_000),
    comp(ORG, "p_hana", "2026-01-01", 138_000, 25_500),
    comp(ORG, "p_drew", "2026-01-01", 98_000, 18_500),
    comp(ORG, "p_fern", "2026-01-01", 86_000, 16_500),
    comp(ORG, "p_max", "2026-01-01", 142_000, 26_500),
    comp(ORG, "p_claire", "2026-01-01", 128_000, 24_000),
    comp(ORG, "p_ezra", "2026-01-01", 102_000, 19_000),
    contractorCost(ORG, "c_loop", "2026-04-01", 70, "EUR"),
    contractorCost(ORG, "c_rio", "2026-06-01", 85),
  ];

  const billRates = [
    rate(ORG, "p_nadia", "2026-01-01", 240),
    rate(ORG, "p_owen", "2026-01-01", 230),
    rate(ORG, "p_mei", "2026-01-01", 190),
    rate(ORG, "p_luis", "2026-01-01", 240),
    rate(ORG, "p_kara", "2026-01-01", 185),
    rate(ORG, "p_jonah", "2026-01-01", 175),
    rate(ORG, "p_ines", "2026-01-01", 180),
    rate(ORG, "p_tyler", "2026-01-01", 145),
    rate(ORG, "p_sana", "2026-01-01", 250),
    rate(ORG, "p_felipe", "2026-01-01", 160),
    rate(ORG, "p_hana", "2026-01-01", 195),
    rate(ORG, "p_drew", "2026-01-01", 160),
    rate(ORG, "p_fern", "2026-01-01", 145),
    rate(ORG, "p_max", "2026-01-01", 210),
    rate(ORG, "p_claire", "2026-01-01", 175),
    rate(ORG, "c_loop", "2026-04-01", 130),
    rate(ORG, "c_rio", "2026-06-01", 150),
  ];

  const timeOff: TimeOff[] = [
    { id: "to_jonah_aug", personId: "p_jonah", start: "2026-08-10", end: "2026-08-14", hours: 40 },
    { id: "to_drew_jul", personId: "p_drew", start: "2026-07-20", end: "2026-07-31", hours: 80 },
    { id: "to_sana_sep", personId: "p_sana", start: "2026-09-14", end: "2026-09-18", hours: 40 },
    { id: "to_kara_oct", personId: "p_kara", start: "2026-10-19", end: "2026-10-23", hours: 40 },
  ];

  const contact = (name: string, title: string, domain: string, primary = false) => ({ name, title, email: `${name.split(" ")[0].toLowerCase()}@${domain}`, primary });
  const account = (a: Omit<Account, "orgId" | "kind" | "status"> & Partial<Pick<Account, "status">>): Account => ({ orgId: ORG, kind: "client", status: "active", ...a });

  const accounts: Account[] = [
    account({ id: "a_arcwave", name: "Arcwave Mobile", aliases: ["arcwave", "arc wave"], industry: "Telecommunications", ownerId: "p_nadia", since: "2024-01-08", contacts: [contact("Simone Hart", "VP Growth Marketing", "arcwave.example", true), contact("Derek Moy", "Head of Analytics", "arcwave.example")], services: ["Paid media planning & buying", "Programmatic & CTV"] }),
    account({ id: "a_solstice", name: "Solstice Hotels & Resorts", aliases: ["solstice", "solstice hotels"], industry: "Travel & hospitality", ownerId: "p_owen", since: "2025-09-01", contacts: [contact("Elena Marsh", "Chief Marketing Officer", "solsticehotels.example", true), contact("Paolo Vega", "Digital Director", "solsticehotels.example")], services: ["Studio: content at scale", "Paid media planning & buying"] }),
    account({ id: "a_bloomfield", name: "Bloomfield Home", aliases: ["bloomfield", "bloomfield home"], industry: "DTC home goods", ownerId: "p_nadia", since: "2025-11-03", contacts: [contact("Grace Whitman", "Head of Growth", "bloomfieldhome.example", true), contact("Accounts Payable", "Finance", "bloomfieldhome.example")], services: ["Paid media planning & buying"] }),
    account({ id: "a_kinetic", name: "Kinetic Footwear", aliases: ["kinetic", "kinetic footwear"], industry: "Sportswear", ownerId: "p_owen", since: "2026-06-15", contacts: [contact("Marcus Bell", "Global Brand Director", "kineticfootwear.example", true), contact("Ana Ruiz", "Legal Counsel", "kineticfootwear.example")], services: ["Studio: content at scale", "Paid media planning & buying"] }),
    account({ id: "a_crestline", name: "Crestline Bank", aliases: ["crestline", "crestline bank"], industry: "Financial services", ownerId: "p_mei", since: "2025-04-07", contacts: [contact("Robert Chen", "Director of Acquisition Marketing", "crestlinebank.example", true)], services: ["Paid media planning & buying", "Measurement & marketing mix modeling"] }),
    account({ id: "a_hearthstone", name: "Hearthstone Foods", aliases: ["hearthstone", "hearthstone foods"], industry: "Packaged food", ownerId: "p_mei", since: "2024-12-02", contacts: [contact("Laura Kim", "Director of Commerce Marketing", "hearthstonefoods.example", true), contact("Victor Hale", "Procurement Lead", "hearthstonefoods.example")], services: ["Retail media"] }),
    account({ id: "a_voltra", name: "Voltra EV", aliases: ["voltra", "voltra ev"], industry: "Automotive (electric vehicles)", ownerId: "p_nadia", since: "2026-03-02", contacts: [contact("Jamie Okafor", "Head of Digital", "voltra.example", true)], services: ["Paid media planning & buying"] }),
    account({ id: "a_northstar", name: "Northstar Pet", aliases: ["northstar", "north star pet"], industry: "Pet food", ownerId: "p_mei", since: "2026-06-29", contacts: [contact("Chris Dunn", "Marketing Manager", "northstarpet.example", true)], services: ["Paid media planning & buying"] }),
    account({ id: "a_greenline", name: "Greenline Grocery", aliases: ["greenline"], industry: "Grocery retail", ownerId: "p_mei", status: "onboarding", since: "2026-09-14", contacts: [contact("Tara Singh", "VP Marketing", "greenlinegrocery.example", true)], services: ["Retail media"] }),
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
    targetMargin: p.billing === "internal" ? undefined : 0.4,
    estimateUpdatedOn: "2026-10-02",
    estimateSource: src("clickup", "estimates"),
    ...p,
  });
  const as = (personId: string, hoursPerWeek: number, from: string, to: string, billable = true) => ({ personId, hoursPerWeek, from, to, billable });

  const projects: Project[] = [
    P({
      id: "pr_arc_media", accountId: "a_arcwave", contractId: "ct_arc_media", name: "Arcwave always-on performance media", billing: "retainer", ownerId: "p_nadia",
      startDate: "2026-01-05", originalEndDate: "2026-12-31", budgetHours: 3000, remainingHoursEstimate: 760,
      description: "Search, paid social and CTV planning, buying and optimization for subscriber acquisition. Media billed at cost outside the fee; 250 hours included per month.",
      assignments: [as("p_jonah", 14, "2026-01-05", "2026-12-31"), as("p_kara", 10, "2026-01-05", "2026-12-31"), as("p_ines", 8, "2026-01-05", "2026-12-31"), as("p_tyler", 8, "2026-01-05", "2026-12-31"), as("p_felipe", 8, "2026-01-05", "2026-12-31"), as("p_luis", 4, "2026-01-05", "2026-12-31"), as("p_nadia", 3, "2026-01-05", "2026-12-31", false)],
    }),
    P({
      id: "pr_sol_studio", accountId: "a_solstice", contractId: "ct_sol_studio", name: "Solstice content studio: 40-property asset library", billing: "fixed_fee", ownerId: "p_claire",
      startDate: "2026-04-13", originalEndDate: "2026-09-25", currentEndDate: "2026-11-13", budgetHours: 1200, remainingHoursEstimate: 320, remainingExpenseEstimate: 6000,
      description: "Shoot direction, edit and versioning of a reusable asset library across 40 properties, cut for every placement in the media plan.",
      scopeChanges: [{ id: "sc_sol_1", date: "2026-07-13", description: "Localization into four languages for European properties, absorbed as goodwill", hours: 180, billable: false, approved: true }],
      assignments: [as("p_hana", 12, "2026-04-13", "2026-11-13"), as("p_drew", 16, "2026-04-13", "2026-11-13"), as("p_fern", 14, "2026-04-13", "2026-11-13"), as("c_loop", 10, "2026-07-13", "2026-11-13"), as("c_rio", 10, "2026-06-01", "2026-10-30"), as("p_claire", 6, "2026-04-13", "2026-11-13"), as("p_owen", 2, "2026-04-13", "2026-11-13", false)],
    }),
    P({
      id: "pr_sol_media", accountId: "a_solstice", contractId: "ct_sol_media", name: "Solstice paid media", billing: "retainer", ownerId: "p_owen",
      startDate: "2026-07-01", originalEndDate: "2027-06-30", budgetHours: 1200, remainingHoursEstimate: 900,
      description: "Paid social and programmatic for direct bookings. 100 hours included per month.",
      assignments: [as("p_kara", 6, "2026-07-01", "2027-06-30"), as("p_ines", 6, "2026-07-01", "2027-06-30"), as("p_tyler", 4, "2026-07-01", "2027-06-30"), as("p_owen", 2, "2026-07-01", "2027-06-30", false)],
    }),
    P({
      id: "pr_bloom_media", accountId: "a_bloomfield", contractId: "ct_bloom_media", name: "Bloomfield performance media", billing: "retainer", ownerId: "p_nadia",
      startDate: "2026-01-05", originalEndDate: "2026-12-31", budgetHours: 1440, remainingHoursEstimate: 360,
      description: "Paid social, Pinterest and Google Shopping for DTC revenue. 120 hours included per month.",
      assignments: [as("p_kara", 10, "2026-01-05", "2026-12-31"), as("p_jonah", 6, "2026-01-05", "2026-12-31"), as("p_felipe", 4, "2026-01-05", "2026-12-31"), as("p_drew", 3, "2026-01-05", "2026-12-31"), as("p_nadia", 2, "2026-01-05", "2026-12-31", false)],
    }),
    P({
      id: "pr_kin_launch", accountId: "a_kinetic", contractId: "ct_kin_launch", name: "Kinetic Velo runner launch: film, cut-downs & media", billing: "fixed_fee", ownerId: "p_claire",
      startDate: "2026-07-20", originalEndDate: "2026-11-27", currentEndDate: "2026-12-18", budgetHours: 1100, remainingHoursEstimate: 420, remainingExpenseEstimate: 9000,
      description: "Hero film, 60 social cut-downs and the launch media plan on TikTok, YouTube and programmatic video.",
      assignments: [as("p_hana", 8, "2026-07-20", "2026-12-18"), as("p_drew", 10, "2026-07-20", "2026-12-18"), as("c_rio", 8, "2026-07-20", "2026-12-18"), as("p_kara", 8, "2026-08-31", "2026-12-18"), as("p_ines", 6, "2026-08-31", "2026-12-18"), as("p_tyler", 6, "2026-07-20", "2026-10-30"), as("p_claire", 6, "2026-07-20", "2026-12-18"), as("p_owen", 2, "2026-07-20", "2026-12-18", false)],
    }),
    P({
      id: "pr_crest_ret", accountId: "a_crestline", contractId: "ct_crest_ret", name: "Crestline acquisition media & reporting", billing: "retainer", ownerId: "p_mei",
      startDate: "2026-04-01", originalEndDate: "2027-03-31", budgetHours: 1200, remainingHoursEstimate: 600,
      description: "Search and LinkedIn for account acquisition plus monthly reporting. 100 hours included per month; extra analysis is billable only with written approval.",
      assignments: [as("p_jonah", 6, "2026-04-01", "2027-03-31"), as("p_kara", 4, "2026-04-01", "2027-03-31"), as("p_felipe", 6, "2026-04-01", "2027-03-31"), as("p_sana", 3, "2026-07-01", "2027-03-31"), as("p_mei", 2, "2026-04-01", "2027-03-31", false)],
    }),
    P({
      id: "pr_hearth_retail", accountId: "a_hearthstone", contractId: "ct_hearth_retail", name: "Hearthstone retail media FY26", billing: "retainer", ownerId: "p_mei",
      startDate: "2025-12-01", originalEndDate: "2026-11-30", budgetHours: 1320, remainingHoursEstimate: 200,
      description: "Amazon Ads and Walmart Connect for the snack and frozen ranges. 110 hours included per month. Renewal decision due by Oct 31 (30-day notice).",
      assignments: [as("p_jonah", 8, "2025-12-01", "2026-11-30"), as("p_ines", 6, "2025-12-01", "2026-11-30"), as("p_felipe", 4, "2025-12-01", "2026-11-30"), as("p_tyler", 4, "2025-12-01", "2026-11-30"), as("p_mei", 2, "2025-12-01", "2026-11-30", false)],
    }),
    P({
      id: "pr_voltra_media", accountId: "a_voltra", contractId: "ct_voltra_media", name: "Voltra test-drive acquisition media", billing: "retainer", ownerId: "p_nadia",
      startDate: "2026-03-02", originalEndDate: "2027-02-26", budgetHours: 960, remainingHoursEstimate: 520,
      description: "Paid social and search driving test-drive bookings. 80 hours included per month.",
      assignments: [as("p_kara", 6, "2026-03-02", "2027-02-26"), as("p_jonah", 5, "2026-03-02", "2027-02-26"), as("p_max", 3, "2026-03-02", "2027-02-26"), as("p_nadia", 1, "2026-03-02", "2027-02-26", false)],
    }),
    P({
      id: "pr_northstar_media", accountId: "a_northstar", contractId: "ct_northstar_media", name: "Northstar Pet paid social", billing: "time_materials", ownerId: "p_mei",
      startDate: "2026-07-06", originalEndDate: "2026-12-18", budgetHours: 360, remainingHoursEstimate: 150, estimateUpdatedOn: "2026-08-21",
      description: "Paid social for the new grain-free range. Time records stop after Aug 24 and platform access was lost on Aug 23.",
      assignments: [as("p_kara", 4, "2026-07-06", "2026-12-18"), as("p_tyler", 4, "2026-07-06", "2026-12-18")],
    }),
    P({
      id: "pr_green_pilot", accountId: "a_greenline", contractId: "ct_green_pilot", name: "Greenline retail media pilot", billing: "time_materials", ownerId: "p_mei",
      startDate: "2026-09-14", originalEndDate: "2026-12-18", budgetHours: 300, remainingHoursEstimate: 250,
      description: "Retail media network audit and a first Instacart flight for private-label produce.",
      assignments: [as("p_ines", 6, "2026-09-14", "2026-12-18"), as("p_sana", 4, "2026-09-14", "2026-11-13"), as("p_mei", 2, "2026-09-14", "2026-12-18", false)],
    }),
    P({
      id: "pr_int_flow", name: "AI-assisted versioning workflow", billing: "internal", ownerId: "p_max", department: "Technology",
      startDate: "2026-06-01", originalEndDate: "2026-11-27", budgetHours: 420, budgetCost: 38_000, remainingHoursEstimate: 160,
      description: "Internal: automated cut-down and localization versioning in the studio pipeline (simulated, no AI service connected in this demo).",
      assignments: [as("p_max", 14, "2026-06-01", "2026-11-27", false), as("p_hana", 2, "2026-06-01", "2026-11-27", false)],
    }),
    P({
      id: "pr_int_mmm", name: "Measurement playbook & MMM toolkit", billing: "internal", ownerId: "p_sana", department: "Data & Measurement",
      startDate: "2026-07-06", originalEndDate: "2026-10-30", currentEndDate: "2026-12-11", budgetHours: 240, budgetCost: 24_000, remainingHoursEstimate: 120,
      description: "Reusable marketing mix model and incrementality test design for new-business pitches.",
      assignments: [as("p_sana", 6, "2026-07-06", "2026-12-11", false), as("p_felipe", 4, "2026-07-06", "2026-12-11", false)],
    }),
  ];

  normalizeLoads(projects, { cap: 35, exclude: ["p_kara", "p_nadia", "p_owen", "p_mei"], from: "2026-04-06", to: "2027-01-31" });

  const contract = (c: Omit<Contract, "orgId" | "currency" | "source">): Contract => ({ orgId: ORG, currency: "USD", source: src("sheets", "contracts"), ...c });
  const contracts: Contract[] = [
    contract({ id: "ct_arc_media", accountId: "a_arcwave", name: "Media management agreement 2026", type: "retainer", startDate: "2026-01-01", endDate: "2026-12-31", renewalDate: "2026-12-31", noticeDays: 60, monthlyFee: 48_000, includedHoursPerMonth: 250 }),
    contract({ id: "ct_sol_studio", accountId: "a_solstice", name: "Content studio SOW", type: "fixed_fee", startDate: "2026-04-13", endDate: "2026-11-13", fixedFee: 165_000 }),
    contract({ id: "ct_sol_media", accountId: "a_solstice", name: "Paid media agreement", type: "retainer", startDate: "2026-07-01", endDate: "2027-06-30", renewalDate: "2027-06-30", noticeDays: 60, monthlyFee: 19_000, includedHoursPerMonth: 100 }),
    contract({ id: "ct_bloom_media", accountId: "a_bloomfield", name: "Performance media agreement", type: "retainer", startDate: "2026-01-01", endDate: "2026-12-31", renewalDate: "2026-12-31", noticeDays: 60, monthlyFee: 24_000, includedHoursPerMonth: 120 }),
    contract({ id: "ct_kin_launch", accountId: "a_kinetic", name: "Velo launch SOW", type: "fixed_fee", startDate: "2026-07-20", endDate: "2026-12-18", fixedFee: 235_000 }),
    contract({ id: "ct_crest_ret", accountId: "a_crestline", name: "Acquisition media agreement", type: "retainer", startDate: "2026-04-01", endDate: "2027-03-31", renewalDate: "2027-03-31", noticeDays: 60, monthlyFee: 13_500, includedHoursPerMonth: 100 }),
    contract({ id: "ct_hearth_retail", accountId: "a_hearthstone", name: "Retail media agreement FY26", type: "retainer", startDate: "2025-12-01", endDate: "2026-11-30", renewalDate: "2026-11-30", noticeDays: 30, autoRenew: false, monthlyFee: 22_000, includedHoursPerMonth: 110 }),
    contract({ id: "ct_voltra_media", accountId: "a_voltra", name: "Acquisition media agreement", type: "retainer", startDate: "2026-03-01", endDate: "2027-02-28", renewalDate: "2027-02-28", noticeDays: 30, monthlyFee: 15_000, includedHoursPerMonth: 80 }),
    contract({ id: "ct_northstar_media", accountId: "a_northstar", name: "Paid social SOW", type: "time_materials", startDate: "2026-07-06", endDate: "2026-12-18" }),
    contract({ id: "ct_green_pilot", accountId: "a_greenline", name: "Retail media pilot SOW", type: "time_materials", startDate: "2026-09-14", endDate: "2026-12-18" }),
  ];

  const M = (m: Omit<Milestone, "orgId" | "dueChanges"> & { dueChanges?: Milestone["dueChanges"] }): Milestone => ({ orgId: ORG, dueChanges: [], ...m });
  const milestones: Milestone[] = [
    M({ id: "ms_arc_q4plan", projectId: "pr_arc_media", name: "Q4 media plan & CTV test approved", originalDue: "2026-09-18", completedOn: "2026-09-17", ownerId: "p_tyler" }),
    M({ id: "ms_arc_qbr", projectId: "pr_arc_media", name: "Q3 business review", originalDue: "2026-10-15", ownerId: "p_nadia" }),

    M({ id: "ms_sol_shoot", projectId: "pr_sol_studio", name: "Property shoots complete (40)", originalDue: "2026-06-26", dueChanges: [{ changedOn: "2026-06-15", newDue: "2026-07-10", reason: "Weather on coastal shoots" }], completedOn: "2026-07-10", ownerId: "p_hana", billingAmount: 66_000 }),
    M({ id: "ms_sol_library", projectId: "pr_sol_studio", name: "Asset library delivered (all placements)", originalDue: "2026-09-25", dueChanges: [{ changedOn: "2026-07-13", newDue: "2026-10-23", reason: "Four-language localization added" }, { changedOn: "2026-10-01", newDue: "2026-11-13", reason: "Studio capacity on the Kinetic launch" }], ownerId: "p_hana", billingAmount: 66_000 }),

    M({ id: "ms_bloom_q3review", projectId: "pr_bloom_media", name: "Q3 performance review", originalDue: "2026-10-09", ownerId: "p_nadia" }),
    M({ id: "ms_bloom_test", projectId: "pr_bloom_media", name: "Creative & audience test plan", originalDue: "2026-09-18", dueChanges: [{ changedOn: "2026-09-16", newDue: "2026-10-02", reason: "Rescheduled" }], completedOn: "2026-10-02", ownerId: "p_kara" }),

    M({ id: "ms_kin_strategy", projectId: "pr_kin_launch", name: "Launch strategy & media plan", originalDue: "2026-08-14", completedOn: "2026-08-14", ownerId: "p_tyler", billingAmount: 70_500 }),
    M({ id: "ms_kin_film", projectId: "pr_kin_launch", name: "Hero film & cut-downs approved", originalDue: "2026-09-04", dueChanges: [{ changedOn: "2026-09-11", newDue: "2026-09-25", reason: "Client legal review of athlete likeness rights" }, { changedOn: "2026-09-28", newDue: "2026-10-12", reason: "Client legal review ongoing" }], ownerId: "p_hana", awaitingClientSince: "2026-09-04", blockedReason: "Awaiting Kinetic legal sign-off on athlete likeness rights for the hero film" }),
    M({ id: "ms_kin_live", projectId: "pr_kin_launch", name: "Full launch flight live", originalDue: "2026-09-14", dueChanges: [{ changedOn: "2026-09-11", newDue: "2026-10-19", reason: "Held pending film approval; teaser only" }], ownerId: "p_claire", billingAmount: 94_000 }),

    M({ id: "ms_crest_dash", projectId: "pr_crest_ret", name: "Monthly reporting dashboard", originalDue: "2026-06-26", completedOn: "2026-06-30", ownerId: "p_felipe" }),

    M({ id: "ms_hearth_rfp", projectId: "pr_hearth_retail", name: "Retail media review pitch submitted (RFP)", originalDue: "2026-10-20", ownerId: "p_mei" }),

    M({ id: "ms_voltra_fix", projectId: "pr_voltra_media", name: "Conversion tracking restored & verified", originalDue: "2026-09-11", completedOn: "2026-09-11", ownerId: "p_max" }),

    M({ id: "ms_northstar_q4", projectId: "pr_northstar_media", name: "Q4 creative refresh live", originalDue: "2026-10-09", ownerId: "p_mei", blockedReason: "Business manager access revoked on the client side (Aug 23)" }),

    M({ id: "ms_green_audit", projectId: "pr_green_pilot", name: "Retail media network audit", originalDue: "2026-10-09", ownerId: "p_ines" }),
    M({ id: "ms_green_live", projectId: "pr_green_pilot", name: "Instacart pilot flight live", originalDue: "2026-10-19", ownerId: "p_ines" }),

    M({ id: "ms_flow_beta", projectId: "pr_int_flow", name: "Versioning beta in studio", originalDue: "2026-09-25", completedOn: "2026-09-30", ownerId: "p_max" }),
    M({ id: "ms_mmm_toolkit", projectId: "pr_int_mmm", name: "MMM toolkit v1", originalDue: "2026-10-30", dueChanges: [{ changedOn: "2026-09-21", newDue: "2026-12-11", reason: "Sana's time moved to client reporting" }], ownerId: "p_sana" }),
  ];

  const T = (t: Omit<Task, "orgId" | "source" | "dependsOn"> & { dependsOn?: string[] }): Task => ({ orgId: ORG, source: src("clickup", "tasks"), dependsOn: [], ...t });
  const tasks: Task[] = [
    T({ id: "tk_arc_ctv", projectId: "pr_arc_media", title: "CTV test: build audiences and creative rotation", assigneeId: "p_ines", status: "done", due: "2026-09-30", completedOn: "2026-09-30", estimateHours: 20 }),
    T({ id: "tk_arc_qbr", projectId: "pr_arc_media", milestoneId: "ms_arc_qbr", title: "Q3 business review deck", assigneeId: "p_felipe", status: "in_progress", due: "2026-10-13", estimateHours: 16 }),
    T({ id: "tk_arc_social", projectId: "pr_arc_media", title: "Q4 paid social creative refresh", assigneeId: "p_kara", status: "in_progress", due: "2026-10-09", estimateHours: 14 }),

    T({ id: "tk_sol_edits", projectId: "pr_sol_studio", milestoneId: "ms_sol_library", title: "Final edits: 40 property films", assigneeId: "p_drew", status: "in_progress", due: "2026-10-30", estimateHours: 120, revisionRounds: 2 }),
    T({ id: "tk_sol_localize", projectId: "pr_sol_studio", milestoneId: "ms_sol_library", title: "Localization into four languages", assigneeId: "c_loop", status: "in_progress", due: "2026-11-06", estimateHours: 80 }),
    T({ id: "tk_sol_social", projectId: "pr_sol_media", title: "Autumn escapes paid social launch", assigneeId: "p_kara", status: "done", due: "2026-09-04", completedOn: "2026-09-04", estimateHours: 12 }),

    T({ id: "tk_bloom_audit", projectId: "pr_bloom_media", title: "Meta account audit after ROAS decline", assigneeId: "p_kara", status: "in_progress", due: "2026-09-25", estimateHours: 16, blockerNote: "Kara is split across five clients" }),
    T({ id: "tk_bloom_creative", projectId: "pr_bloom_media", milestoneId: "ms_bloom_test", title: "New UGC creative variants for Meta", assigneeId: "p_drew", status: "done", due: "2026-09-25", completedOn: "2026-10-01", estimateHours: 18, revisionRounds: 3 }),
    T({ id: "tk_bloom_pinterest", projectId: "pr_bloom_media", title: "Pinterest catalog feed fix", assigneeId: "p_jonah", status: "todo", due: "2026-10-09", estimateHours: 8 }),
    T({ id: "tk_bloom_review", projectId: "pr_bloom_media", milestoneId: "ms_bloom_q3review", title: "Q3 performance review deck", assigneeId: "p_felipe", status: "in_progress", due: "2026-10-08", estimateHours: 12 }),

    T({ id: "tk_kin_legal", projectId: "pr_kin_launch", milestoneId: "ms_kin_film", title: "Client legal sign-off on athlete likeness", assigneeId: "p_claire", status: "blocked", due: "2026-09-25", estimateHours: 2, blockerNote: "With Kinetic legal since Sep 4" }),
    T({ id: "tk_kin_cutdowns", projectId: "pr_kin_launch", milestoneId: "ms_kin_live", title: "60 social cut-downs from the hero film", assigneeId: "p_drew", status: "todo", due: "2026-10-16", estimateHours: 60, dependsOn: ["tk_kin_legal"] }),
    T({ id: "tk_kin_trafficking", projectId: "pr_kin_launch", milestoneId: "ms_kin_live", title: "Traffic launch creative to TikTok and YouTube", assigneeId: "p_kara", status: "todo", due: "2026-10-16", estimateHours: 10, dependsOn: ["tk_kin_cutdowns"] }),
    T({ id: "tk_kin_film", projectId: "pr_kin_launch", milestoneId: "ms_kin_film", title: "Hero film edit", assigneeId: "p_hana", status: "done", due: "2026-09-04", completedOn: "2026-09-04", estimateHours: 60, revisionRounds: 3 }),

    T({ id: "tk_crest_adhoc1", projectId: "pr_crest_ret", title: "Branch-level lead analysis (unplanned request)", assigneeId: "p_felipe", status: "done", due: "2026-07-24", completedOn: "2026-07-24", estimateHours: 16 }),
    T({ id: "tk_crest_adhoc2", projectId: "pr_crest_ret", title: "Board-ready attribution deck (unplanned request)", assigneeId: "p_sana", status: "done", due: "2026-08-28", completedOn: "2026-08-27", estimateHours: 24 }),
    T({ id: "tk_crest_adhoc3", projectId: "pr_crest_ret", title: "Competitor spend tracker (unplanned request)", assigneeId: "p_felipe", status: "in_progress", due: "2026-09-25", estimateHours: 20 }),
    T({ id: "tk_crest_linkedin", projectId: "pr_crest_ret", title: "Reset LinkedIn daily caps after bid change", assigneeId: "p_kara", status: "todo", due: "2026-10-06", estimateHours: 3 }),
    T({ id: "tk_crest_mmm", projectId: "pr_crest_ret", title: "Mini marketing mix model (requested Oct 1)", assigneeId: "p_mei", status: "todo", due: "2026-11-13", estimateHours: 60, blockerNote: "Not covered by retainer; needs scoping" }),

    T({ id: "tk_hearth_rfp", projectId: "pr_hearth_retail", milestoneId: "ms_hearth_rfp", title: "RFP response and in-housing support option", assigneeId: "p_mei", status: "in_progress", due: "2026-10-20", estimateHours: 24 }),
    T({ id: "tk_hearth_holiday", projectId: "pr_hearth_retail", title: "Holiday Amazon sponsored brand campaigns", assigneeId: "p_jonah", status: "in_progress", due: "2026-10-16", estimateHours: 18 }),

    T({ id: "tk_voltra_pixel", projectId: "pr_voltra_media", milestoneId: "ms_voltra_fix", title: "Re-install conversion API after site migration", assigneeId: "p_max", status: "done", due: "2026-09-11", completedOn: "2026-09-11", estimateHours: 10 }),

    T({ id: "tk_northstar_access", projectId: "pr_northstar_media", milestoneId: "ms_northstar_q4", title: "Restore business manager access", assigneeId: "p_mei", status: "blocked", due: "2026-08-28", estimateHours: 1, blockerNote: "No response since Aug 14" }),
    T({ id: "tk_northstar_creative", projectId: "pr_northstar_media", milestoneId: "ms_northstar_q4", title: "Q4 grain-free creative refresh", assigneeId: "p_kara", status: "todo", due: "2026-10-09", estimateHours: 16, dependsOn: ["tk_northstar_access"] }),

    T({ id: "tk_green_audit", projectId: "pr_green_pilot", milestoneId: "ms_green_audit", title: "Retail media network audit", assigneeId: "p_ines", status: "in_progress", due: "2026-10-09", estimateHours: 30 }),

    T({ id: "tk_flow_beta", projectId: "pr_int_flow", milestoneId: "ms_flow_beta", title: "Versioning templates for 9:16 and 1:1", assigneeId: "p_max", status: "done", due: "2026-09-25", completedOn: "2026-09-30", estimateHours: 40 }),
    T({ id: "tk_mmm_toolkit", projectId: "pr_int_mmm", milestoneId: "ms_mmm_toolkit", title: "MMM priors library", assigneeId: "p_felipe", status: "todo", due: "2026-10-30", estimateHours: 30, blockerNote: "Felipe moved to Crestline reporting" }),
  ];

  const timeEntries = generateTimeEntries(org, projects, timeOff, ({ personId, projectId, week, planned }) => {
    // Northstar: time records stop after Aug 24.
    if (projectId === "pr_northstar_media" && week > "2026-08-24") return null;
    let h = planned;
    // Kara works overtime from August across every client she buys for.
    if (personId === "p_kara" && week >= "2026-08-03") h *= 1.18;
    // Solstice studio overruns once localization is absorbed.
    if (projectId === "pr_sol_studio" && week >= "2026-07-13") h *= 1.25;
    // Crestline: hours creep up with ad hoc analysis.
    if (projectId === "pr_crest_ret") h *= week >= "2026-09-01" ? 1.9 : week >= "2026-08-01" ? 1.55 : week >= "2026-07-01" ? 1.3 : 1;
    // Kinetic: studio waiting on legal from mid-September.
    if (projectId === "pr_kin_launch" && week >= "2026-09-14" && personId !== "p_kara") h *= 0.4;
    // Voltra: the tracking outage week.
    if (projectId === "pr_voltra_media" && week === "2026-09-07") h *= 1.8;
    // Bloomfield: extra optimization effort as ROAS falls.
    if (projectId === "pr_bloom_media" && week >= "2026-09-01") h *= 1.2;
    return h;
  });

  const E = (id: string, projectId: string | undefined, date: string, category: string, description: string, amount: number, currency: Expense["currency"] = "USD"): Expense => ({ id, orgId: ORG, projectId, date, category, description, amount, currency, source: src("accounting", "expenses") });
  const expenses: Expense[] = [
    E("ex_sol_crew", "pr_sol_studio", "2026-06-15", "Production", "Location crews for property shoots", 18_500),
    E("ex_sol_travel", "pr_sol_studio", "2026-06-22", "Travel", "Shoot travel (12 properties)", 9_400),
    E("ex_sol_music", "pr_sol_studio", "2026-08-10", "Licences", "Music licences", 2_800),
    E("ex_kin_shoot", "pr_kin_launch", "2026-08-24", "Production", "Hero film shoot day", 24_000),
    E("ex_kin_talent", "pr_kin_launch", "2026-08-24", "Production", "Talent and wardrobe", 6_500),
    E("ex_arc_tools", "pr_arc_media", "2026-07-01", "Software", "Bid management seat (annual, client-dedicated)", 6_000),
    E("ex_crest_data", "pr_crest_ret", "2026-08-03", "Data", "Competitive spend data licence", 3_200),
    E("ex_loop_aug", "pr_sol_studio", "2026-08-31", "Contractor", "Loopframe subtitle QA (EUR)", 2_100, "EUR"),
    E("ex_flow_compute", "pr_int_flow", "2026-08-01", "Software", "Render and storage (simulated workflow)", 2_400),
  ];

  const PFX = "TC";
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
  const invoices: Invoice[] = [];
  invoices.push(fixedInvoice(org, byId.pr_sol_studio, "m0", "2026-04-13", 33_000, "Kick-off (20%)", PFX));
  invoices.push(fixedInvoice(org, byId.pr_sol_studio, "m1", "2026-07-10", 66_000, "Shoots complete (40%)", PFX));
  invoices.push(fixedInvoice(org, byId.pr_kin_launch, "m0", "2026-07-20", 70_500, "Kick-off (30%)", PFX));
  invoices.push(fixedInvoice(org, byId.pr_kin_launch, "m1", "2026-08-14", 70_500, "Strategy & media plan (30%)", PFX));
  invoices.push(...retainerInvoices(org, byId.pr_arc_media, 48_000, "2026-01-01", "2026-12-31", PFX));
  invoices.push(...retainerInvoices(org, byId.pr_sol_media, 19_000, "2026-07-01", "2027-06-30", PFX));
  invoices.push(...retainerInvoices(org, byId.pr_bloom_media, 24_000, "2026-01-01", "2026-12-31", PFX));
  invoices.push(...retainerInvoices(org, byId.pr_crest_ret, 13_500, "2026-04-01", "2027-03-31", PFX));
  invoices.push(...retainerInvoices(org, byId.pr_hearth_retail, 22_000, "2025-12-01", "2026-11-30", PFX));
  invoices.push(...retainerInvoices(org, byId.pr_voltra_media, 15_000, "2026-03-01", "2027-02-28", PFX));
  for (const id of ["pr_northstar_media", "pr_green_pilot"]) invoices.push(...tmInvoices(org, byId[id], timeEntries, billRates, PFX));
  invoices.sort((a, b) => (a.issueDate < b.issueDate ? -1 : 1));

  const payments = generatePayments(
    org,
    invoices,
    { a_arcwave: 0, a_solstice: -3, a_bloomfield: -2, a_kinetic: 4, a_crestline: 1, a_hearthstone: 2, a_voltra: 0, a_northstar: 5, a_greenline: 0 },
    new Set(["inv_pr_kin_launch_m1"]),
  );

  // ---- Media plans: platform-reported weekly delivery (simulated) ----
  const lastWeek = lastCompleteWeek(org);
  const flight = (spec: Omit<MediaFlight, "orgId" | "currency" | "weeks" | "source"> & { pace?: (week: ISODate) => number; kpiActual: (week: ISODate) => number; aov?: number; reportedUntil?: ISODate }): MediaFlight => {
    const { pace, kpiActual, aov = 140, reportedUntil, ...f } = spec;
    const total = daysBetween(f.start, f.end) + 1;
    const weeks: MediaFlight["weeks"] = [];
    const until = minDate(reportedUntil ?? lastWeek, f.end);
    for (const week of mondaysBetween(mondayOf(f.start), until)) {
      const days = daysBetween(maxDate(week, f.start), minDate(addDays(week, 6), f.end)) + 1;
      if (days <= 0) continue;
      const jitter = 0.96 + mulberry32(hashString(`${f.id}:${week}`))() * 0.08;
      const spend = Math.round(((f.budget * days) / total) * (pace?.(week) ?? 1) * jitter);
      const k = kpiActual(week) * (0.97 + mulberry32(hashString(`${f.id}:k:${week}`))() * 0.06);
      const conversions = f.kpi.metric === "CPA" ? Math.round(spend / k) : Math.round((spend * k) / aov);
      const revenue = f.kpi.metric === "ROAS" ? Math.round(spend * k) : 0;
      weeks.push({ week, spend, conversions, revenue });
    }
    return { ...f, orgId: ORG, currency: "USD", weeks, source: src("accounting", "ad-platform-reporting") };
  };
  const ramp = (from: ISODate, a: number, b: number) => (w: ISODate) => (w >= from ? b : a);

  const mediaFlights: MediaFlight[] = [
    flight({ id: "mf_arc_search", accountId: "a_arcwave", projectId: "pr_arc_media", channel: "Search", platform: "Google Ads", objective: "New subscriber sign-ups", start: "2026-07-01", end: "2026-12-31", budget: 1_500_000, kpi: { metric: "CPA", target: 45 }, ownerId: "p_jonah", kpiActual: () => 41.5 }),
    flight({ id: "mf_arc_social", accountId: "a_arcwave", projectId: "pr_arc_media", channel: "Paid social", platform: "Meta", objective: "New subscriber sign-ups", start: "2026-07-01", end: "2026-12-31", budget: 900_000, kpi: { metric: "CPA", target: 55 }, ownerId: "p_kara", kpiActual: ramp("2026-09-01", 54, 51) }),
    flight({ id: "mf_arc_ctv", accountId: "a_arcwave", projectId: "pr_arc_media", channel: "Connected TV", platform: "Programmatic (DSP)", objective: "Reach in test markets", start: "2026-10-01", end: "2026-12-31", budget: 300_000, kpi: { metric: "CPA", target: 120 }, ownerId: "p_ines", kpiActual: () => 116, note: "Geo holdout test; incrementality read due in December" }),

    flight({ id: "mf_sol_social", accountId: "a_solstice", projectId: "pr_sol_media", channel: "Paid social", platform: "Meta", objective: "Direct bookings", start: "2026-07-01", end: "2026-12-31", budget: 480_000, kpi: { metric: "ROAS", target: 6 }, ownerId: "p_kara", kpiActual: () => 6.9, aov: 620 }),
    flight({ id: "mf_sol_prog", accountId: "a_solstice", projectId: "pr_sol_media", channel: "Display & video", platform: "Programmatic (DSP)", objective: "Direct bookings", start: "2026-08-03", end: "2026-12-31", budget: 200_000, kpi: { metric: "ROAS", target: 4 }, ownerId: "p_ines", kpiActual: () => 4.2, aov: 620 }),

    flight({ id: "mf_bloom_meta", accountId: "a_bloomfield", projectId: "pr_bloom_media", channel: "Paid social", platform: "Meta Advantage+", objective: "DTC revenue", start: "2026-07-01", end: "2026-12-31", budget: 600_000, kpi: { metric: "ROAS", target: 3.2 }, ownerId: "p_kara", kpiActual: (w) => (w >= "2026-09-07" ? 2.35 : w >= "2026-08-17" ? 2.8 : 3.3), aov: 260 }),
    flight({ id: "mf_bloom_pin", accountId: "a_bloomfield", projectId: "pr_bloom_media", channel: "Paid social", platform: "Pinterest", objective: "DTC revenue", start: "2026-08-03", end: "2026-12-31", budget: 150_000, kpi: { metric: "ROAS", target: 2.5 }, ownerId: "p_kara", pace: ramp("2026-08-31", 0.7, 0.45), kpiActual: () => 2.6, aov: 260, note: "Catalog feed errors are limiting eligible products" }),
    flight({ id: "mf_bloom_shop", accountId: "a_bloomfield", projectId: "pr_bloom_media", channel: "Shopping", platform: "Google Ads", objective: "DTC revenue", start: "2026-07-01", end: "2026-12-31", budget: 420_000, kpi: { metric: "ROAS", target: 3 }, ownerId: "p_jonah", kpiActual: () => 3.45, aov: 260 }),

    flight({ id: "mf_kin_tiktok", accountId: "a_kinetic", projectId: "pr_kin_launch", channel: "Short-form video", platform: "TikTok", objective: "Launch awareness and pre-orders", start: "2026-09-14", end: "2026-11-29", budget: 380_000, kpi: { metric: "CPA", target: 38 }, ownerId: "p_kara", pace: () => 0.16, kpiActual: () => 44, note: "Only the teaser is live while the hero film waits on client legal approval" }),
    flight({ id: "mf_kin_youtube", accountId: "a_kinetic", projectId: "pr_kin_launch", channel: "Online video", platform: "YouTube", objective: "Launch awareness and pre-orders", start: "2026-09-14", end: "2026-11-29", budget: 250_000, kpi: { metric: "CPA", target: 52 }, ownerId: "p_ines", pace: () => 0.12, kpiActual: () => 57, note: "Held until the hero film is approved" }),

    flight({ id: "mf_crest_search", accountId: "a_crestline", projectId: "pr_crest_ret", channel: "Search", platform: "Google Ads", objective: "Checking account applications", start: "2026-07-01", end: "2026-12-31", budget: 360_000, kpi: { metric: "CPA", target: 140 }, ownerId: "p_jonah", kpiActual: () => 132 }),
    flight({ id: "mf_crest_linkedin", accountId: "a_crestline", projectId: "pr_crest_ret", channel: "Paid social", platform: "LinkedIn", objective: "Business banking leads", start: "2026-07-01", end: "2026-12-31", budget: 180_000, kpi: { metric: "CPA", target: 260 }, ownerId: "p_kara", pace: ramp("2026-09-07", 1, 1.55), kpiActual: ramp("2026-09-07", 250, 285), note: "Client's in-house team raised bids on Sep 7 without changing daily caps" }),

    flight({ id: "mf_hearth_amazon", accountId: "a_hearthstone", projectId: "pr_hearth_retail", channel: "Retail media", platform: "Amazon Ads", objective: "Retail sales", start: "2026-07-01", end: "2026-12-31", budget: 700_000, kpi: { metric: "ROAS", target: 4 }, ownerId: "p_jonah", kpiActual: () => 4.3, aov: 32 }),
    flight({ id: "mf_hearth_walmart", accountId: "a_hearthstone", projectId: "pr_hearth_retail", channel: "Retail media", platform: "Walmart Connect", objective: "Retail sales", start: "2026-07-01", end: "2026-12-31", budget: 350_000, kpi: { metric: "ROAS", target: 3 }, ownerId: "p_ines", kpiActual: () => 3.05, aov: 28 }),

    flight({ id: "mf_voltra_meta", accountId: "a_voltra", projectId: "pr_voltra_media", channel: "Paid social", platform: "Meta", objective: "Test-drive bookings", start: "2026-08-03", end: "2026-12-31", budget: 400_000, kpi: { metric: "CPA", target: 85 }, ownerId: "p_kara", pace: (w) => (w === "2026-09-07" ? 1.45 : w > "2026-09-07" ? 0.97 : 1), kpiActual: (w) => (w === "2026-09-07" ? 140 : 80), note: "Tracking broke Sep 8–11 after the client's site migration; bidding overspent that week and has been corrected" }),
    flight({ id: "mf_voltra_search", accountId: "a_voltra", projectId: "pr_voltra_media", channel: "Search", platform: "Google Ads", objective: "Test-drive bookings", start: "2026-08-03", end: "2026-12-31", budget: 300_000, kpi: { metric: "CPA", target: 70 }, ownerId: "p_jonah", kpiActual: () => 66 }),

    flight({ id: "mf_northstar_meta", accountId: "a_northstar", projectId: "pr_northstar_media", channel: "Paid social", platform: "Meta", objective: "Online orders", start: "2026-07-06", end: "2026-12-18", budget: 240_000, kpi: { metric: "CPA", target: 30 }, ownerId: "p_kara", kpiActual: () => 31, reportedUntil: "2026-08-17", note: "Business manager access revoked on Aug 23; spend continues on the client's card without reporting to us" }),

    flight({ id: "mf_green_instacart", accountId: "a_greenline", projectId: "pr_green_pilot", channel: "Retail media", platform: "Instacart Ads", objective: "Private-label produce sales", start: "2026-10-19", end: "2026-12-18", budget: 120_000, kpi: { metric: "ROAS", target: 3.5 }, ownerId: "p_ines", kpiActual: () => 3.5, aov: 45 }),
  ];

  const threads = [
    thread(ORG, "th_arc_q3", { accountId: "a_arcwave", projectId: "pr_arc_media", channel: "email", subject: "Q3 results", location: "nadia@tempo.example" }, [
      ["2026-09-24", "Simone Hart", "client", "Great work on Q3. Search CPA beat target every month and the social refresh is clearly working."],
    ]),
    thread(ORG, "th_arc_mmm", { accountId: "a_arcwave", channel: "email", subject: "2027 planning", location: "nadia@tempo.example" }, [
      ["2026-09-30", "Derek Moy", "client", "We'd love to talk about a marketing mix model and incrementality testing in Q1; we have budget set aside for it. Finance wants proof before 2027 planning."],
      ["2026-09-30T16:30:00Z", "Nadia Haddad", "internal", "That's great. Sana and I will propose a scoping session."],
    ]),
    thread(ORG, "th_arc_ctv", { accountId: "a_arcwave", channel: "slack", subject: "#ext-arcwave: CTV", location: "#ext-arcwave" }, [
      ["2026-10-02", "Simone Hart", "client", "Following up on Derek's note: could you help us with scaling connected TV nationally if the test reads well? We're also interested in a measurement dashboard our finance team can use."],
      ["2026-10-02T14:10:00Z", "Nadia Haddad", "internal", "Yes. I'll send times for a session the week of Oct 12."],
    ]),

    thread(ORG, "th_sol_shoots", { accountId: "a_solstice", projectId: "pr_sol_studio", channel: "email", subject: "Property films", location: "owen@tempo.example" }, [
      ["2026-07-14", "Elena Marsh", "client", "Really pleased with the first property films. The team loved how every cut already fits the media plan."],
    ]),
    thread(ORG, "th_sol_local", { accountId: "a_solstice", projectId: "pr_sol_studio", channel: "slack", subject: "#ext-solstice: localization", location: "#ext-solstice" }, [
      ["2026-07-13", "Paolo Vega", "client", "Thank you so much for adding the four-language versions. It's a big deal for our European properties."],
      ["2026-07-13T16:05:00Z", "Claire Moss", "internal", "Glad it helps. Note for the team: localization was outside the original scope and we are absorbing about 180 hours as goodwill."],
    ]),
    thread(ORG, "th_sol_delivery", { accountId: "a_solstice", projectId: "pr_sol_studio", channel: "slack", subject: "#delivery-solstice: library plan", location: "#delivery-solstice" }, [
      ["2026-10-01", "Claire Moss", "internal", "Library delivery moves to Nov 13; the studio is stretched with the Kinetic launch. We're over budget by roughly a fifth on this one."],
    ]),
    thread(ORG, "th_sol_media", { accountId: "a_solstice", projectId: "pr_sol_media", channel: "email", subject: "Autumn bookings", location: "owen@tempo.example" }, [
      ["2026-09-29", "Elena Marsh", "client", "Autumn bookings from paid social are well ahead of last year. Fantastic results."],
    ]),

    thread(ORG, "th_bloom_roas", { accountId: "a_bloomfield", projectId: "pr_bloom_media", channel: "email", subject: "Meta performance", location: "nadia@tempo.example" }, [
      ["2026-08-26", "Grace Whitman", "client", "Meta ROAS has dropped for the third week running. We're disappointed nobody flagged it before we saw it in Shopify."],
      ["2026-08-26T19:10:00Z", "Nadia Haddad", "internal", "You're right, and I'm sorry. Kara will audit the account this week and we'll send a written readout."],
    ]),
    thread(ORG, "th_bloom_audit", { accountId: "a_bloomfield", projectId: "pr_bloom_media", channel: "email", subject: "Audit follow-up", location: "nadia@tempo.example" }, [
      ["2026-09-15", "Grace Whitman", "client", "We're still seeing the same ROAS problems we raised in August. Frustrated the audit hasn't landed yet."],
      ["2026-09-15T20:00:00Z", "Luis Ferreira", "internal", "Understood. I'm taking this personally: audit readout and test plan by Oct 2."],
      ["2026-09-24", "Grace Whitman", "client", "As I mentioned, Pinterest is barely spending either. This needs to be sorted before Black Friday."],
    ]),
    thread(ORG, "th_bloom_status", { accountId: "a_bloomfield", projectId: "pr_bloom_media", channel: "slack", subject: "#ext-bloomfield: test plan", location: "#ext-bloomfield" }, [
      ["2026-10-02", "Grace Whitman", "client", "The test plan was helpful, thank you. But we're losing confidence that we'll hit our Q4 revenue number."],
    ]),
    thread(ORG, "th_bloom_ap", { accountId: "a_bloomfield", channel: "email", subject: "Remittance advice", location: "accounts@tempo.example", tags: ["billing"] }, [
      ["2026-10-01", "Accounts Payable", "client", "Payment for the September fee invoice has been sent. Remittance attached."],
    ]),

    thread(ORG, "th_kin_legal", { accountId: "a_kinetic", projectId: "pr_kin_launch", channel: "email", subject: "Hero film: approval", location: "owen@tempo.example" }, [
      ["2026-09-04", "Claire Moss", "internal", "Final hero film and cut-down plan attached for sign-off."],
      ["2026-09-11", "Marcus Bell", "client", "Thanks. It's still with legal review on the athlete likeness rights; we should have sign-off next week."],
      ["2026-09-28", "Marcus Bell", "client", "Apologies, we're still waiting on approval from legal. Our CFO also flagged that budget is tight this quarter."],
      ["2026-10-01", "Owen Price", "internal", "Gentle nudge: only the teaser is live, so TikTok and YouTube are badly underspent. The full launch flight will need to move to Oct 19."],
    ]),
    thread(ORG, "th_kin_ap", { accountId: "a_kinetic", channel: "email", subject: "Overdue invoice TC-5404", location: "accounts@tempo.example", tags: ["billing"] }, [
      ["2026-09-21", "Rafael Ortiz", "internal", "Invoice TC-5404 for the strategy and media plan milestone is now 8 days overdue. Could you confirm a payment date?"],
      ["2026-09-23", "Ana Ruiz", "client", "It's pending approval on our side because it's tied to the launch. We'll update you once the film is approved."],
    ]),
    thread(ORG, "th_kin_strategy", { accountId: "a_kinetic", projectId: "pr_kin_launch", channel: "slack", subject: "#ext-kinetic: strategy", location: "#ext-kinetic" }, [
      ["2026-08-17", "Marcus Bell", "client", "The launch strategy is exactly what we needed. Really pleased with the plan."],
    ]),

    thread(ORG, "th_crest_adhoc1", { accountId: "a_crestline", projectId: "pr_crest_ret", channel: "slack", subject: "#ext-crestline: branch analysis", location: "#ext-crestline" }, [
      ["2026-07-13", "Robert Chen", "client", "Quick addition: could you also break leads down by branch? Should be quick."],
    ]),
    thread(ORG, "th_crest_adhoc2", { accountId: "a_crestline", projectId: "pr_crest_ret", channel: "slack", subject: "#ext-crestline: board deck", location: "#ext-crestline" }, [
      ["2026-08-10", "Robert Chen", "client", "One more thing: can we add an attribution deck for the board meeting?"],
    ]),
    thread(ORG, "th_crest_adhoc3", { accountId: "a_crestline", projectId: "pr_crest_ret", channel: "email", subject: "Competitor tracker", location: "mei@tempo.example" }, [
      ["2026-09-08", "Robert Chen", "client", "While you're at it, could you also track competitor spend monthly? Should be small."],
    ]),
    thread(ORG, "th_crest_internal", { accountId: "a_crestline", projectId: "pr_crest_ret", channel: "slack", subject: "#delivery-crestline: hours", location: "#delivery-crestline" }, [
      ["2026-09-25", "Mei Tanaka", "internal", "Crestline hours are well beyond the retainer: about 170 hours against 100 included in September. We haven't billed any overage and every request has been outside the retainer scope. LinkedIn is also overspending since their team raised bids."],
    ]),
    thread(ORG, "th_crest_mmm", { accountId: "a_crestline", projectId: "pr_crest_ret", channel: "slack", subject: "#ext-crestline: MMM", location: "#ext-crestline" }, [
      ["2026-10-01", "Robert Chen", "client", "Love the reporting so far. Can we add a mini marketing mix model next? Would be great before budget season."],
    ]),

    thread(ORG, "th_hearth_budget", { accountId: "a_hearthstone", channel: "email", subject: "2027 planning", location: "mei@tempo.example" }, [
      ["2026-08-20", "Laura Kim", "client", "Heads up: leadership has asked us to reduce spend on agency fees next year. Budget cuts are likely across commerce marketing."],
      ["2026-08-20T18:30:00Z", "Mei Tanaka", "internal", "Thanks for the early warning, Laura. Happy to help you plan for it."],
    ]),
    thread(ORG, "th_hearth_procurement", { accountId: "a_hearthstone", channel: "email", subject: "Procurement review", location: "mei@tempo.example" }, [
      ["2026-09-12", "Victor Hale", "client", "As part of our procurement review, we're required to run an RFP for retail media services before any renewal."],
    ]),
    thread(ORG, "th_hearth_rfp", { accountId: "a_hearthstone", channel: "email", subject: "RFP timeline", location: "mei@tempo.example" }, [
      ["2026-09-24", "Laura Kim", "client", "To be transparent, we're evaluating other agencies in the RFP, and considering whether to bring some of this in-house now that Amazon has a self-serve team on our side."],
      ["2026-09-24T20:00:00Z", "Mei Tanaka", "internal", "Appreciate the candour. We'll put forward a strong proposal, including a hybrid option."],
    ]),
    thread(ORG, "th_hearth_notice", { accountId: "a_hearthstone", channel: "email", subject: "Renewal notice period", location: "mei@tempo.example" }, [
      ["2026-10-01", "Laura Kim", "client", "Please note the notice period in our agreement: we'll confirm by Oct 31 whether we renew."],
    ]),
    thread(ORG, "th_hearth_results", { accountId: "a_hearthstone", projectId: "pr_hearth_retail", channel: "slack", subject: "#ext-hearthstone: Prime Day", location: "#ext-hearthstone" }, [
      ["2026-09-17", "Laura Kim", "client", "Prime Day results came in really well. Great work on the sponsored brand campaigns."],
    ]),

    thread(ORG, "th_voltra_tracking", { accountId: "a_voltra", projectId: "pr_voltra_media", channel: "email", subject: "URGENT: conversions missing", location: "nadia@tempo.example" }, [
      ["2026-09-08T14:10:00Z", "Jamie Okafor", "client", "Test-drive bookings in Meta dropped to zero this morning but our CRM shows normal volume. Spend is climbing. This is unacceptable."],
      ["2026-09-08T14:40:00Z", "Max Becker", "internal", "Investigating now. Capping budgets while we trace it."],
      ["2026-09-09", "Jamie Okafor", "client", "Still seeing no conversions reported. Very frustrated, we had a regional launch running."],
      ["2026-09-11", "Max Becker", "internal", "Root cause identified: the site migration removed the conversion API tag. It's fixed now, bidding has re-learned and we're monitoring daily."],
      ["2026-09-12", "Jamie Okafor", "client", "Confirmed all working on our side. Thanks for sorting it quickly in the end."],
    ]),
    thread(ORG, "th_voltra_pir", { accountId: "a_voltra", projectId: "pr_voltra_media", channel: "email", subject: "Post-incident review", location: "nadia@tempo.example" }, [
      ["2026-09-18", "Nadia Haddad", "internal", "Root cause document attached. The issue is closed: we now monitor conversion volume against the CRM daily and alert on drops over 30%."],
      ["2026-09-19", "Jamie Okafor", "client", "Appreciate the transparency. Happy with the plan."],
    ]),
    thread(ORG, "th_voltra_results", { accountId: "a_voltra", projectId: "pr_voltra_media", channel: "slack", subject: "#ext-voltra: September", location: "#ext-voltra" }, [
      ["2026-09-30", "Jamie Okafor", "client", "September came in under CPA target despite the outage. Impressed with how fast it recovered."],
    ]),

    thread(ORG, "th_northstar_kickoff", { accountId: "a_northstar", projectId: "pr_northstar_media", channel: "email", subject: "Kickoff", location: "mei@tempo.example" }, [
      ["2026-07-08", "Chris Dunn", "client", "Looking forward to the launch. Plan looks good."],
    ]),
    thread(ORG, "th_northstar_access", { accountId: "a_northstar", projectId: "pr_northstar_media", channel: "email", subject: "Business manager access", location: "mei@tempo.example" }, [
      ["2026-08-14", "Chris Dunn", "client", "We're reorganizing our ad accounts; we'll re-share access next week."],
      ["2026-08-14T17:00:00Z", "Mei Tanaka", "internal", "Thanks Chris, we'll keep the Q4 creative moving in the meantime."],
    ]),

    thread(ORG, "th_green_kickoff", { accountId: "a_greenline", projectId: "pr_green_pilot", channel: "email", subject: "Pilot kickoff", location: "mei@tempo.example" }, [
      ["2026-09-16", "Tara Singh", "client", "Excited to start. The produce team is ready for the audit."],
      ["2026-10-01", "Tara Singh", "client", "Really pleased with the audit so far. We'd love to talk about our own retail media network after this phase."],
    ]),

    // Paid media feedback that names people, for the department view. Dated no later than each account's latest client message.
    thread(ORG, "th_bloom_kara", { accountId: "a_bloomfield", projectId: "pr_bloom_media", channel: "email", subject: "Audit readout", location: "nadia@tempo.example" }, [
      ["2026-09-24", "Grace Whitman", "client", "Kara's audit readout was thorough, but it arrived three weeks after we asked. Can we get a weekly written update from her until ROAS recovers?"],
      ["2026-09-24T18:00:00Z", "Kara Singh", "internal", "Understood. Weekly written update every Thursday starting this week."],
    ]),
    thread(ORG, "th_hearth_jonah", { accountId: "a_hearthstone", projectId: "pr_hearth_retail", channel: "slack", subject: "#ext-hearthstone: sponsored brands", location: "#ext-hearthstone" }, [
      ["2026-09-17", "Laura Kim", "client", "Jonah's Prime Day bidding was spot on. Best ROAS we've had on Amazon."],
    ]),
    thread(ORG, "th_arc_ines", { accountId: "a_arcwave", projectId: "pr_arc_media", channel: "slack", subject: "#ext-arcwave: CTV test", location: "#ext-arcwave" }, [
      ["2026-09-24", "Derek Moy", "client", "Inês set up the CTV holdout design exactly the way our analytics team asked. Nice work."],
    ]),
    thread(ORG, "th_crest_kara", { accountId: "a_crestline", projectId: "pr_crest_ret", channel: "email", subject: "LinkedIn spend", location: "mei@tempo.example" }, [
      ["2026-09-28", "Robert Chen", "client", "LinkedIn is spending faster than planned. Kara flagged it, but we need the caps fixed before month end."],
    ]),
    thread(ORG, "th_media_load", { accountId: "a_bloomfield", projectId: "pr_bloom_media", channel: "slack", subject: "#delivery-bloomfield: buyer load", location: "#delivery-bloomfield" }, [
      ["2026-10-01T16:00:00Z", "Luis Ferreira", "internal", "Kara is carrying Arcwave social, Bloomfield, the Kinetic launch, Crestline LinkedIn and Voltra. I'll move Voltra and Solstice social to Tyler with Jonah's support."],
    ]),
  ];

  const A = (a: Omit<Action, "orgId" | "comments" | "createdAt" | "origin"> & Partial<Pick<Action, "comments" | "createdAt" | "origin">>): Action => ({ orgId: ORG, comments: [], createdAt: "2026-09-20T10:00:00Z", origin: "seed", ...a });
  const actions: Action[] = [
    A({ id: "act_bloom_recovery", title: "Agree a Q4 ROAS recovery plan with Bloomfield's Head of Growth", description: "Weekly written update, creative and audience tests, and a decision on moving Pinterest budget to Shopping.", ownerId: "p_nadia", dueDate: "2026-10-09", status: "in_progress", severity: "high", impact: "Protects a client relationship showing repeated dissatisfaction", accountId: "a_bloomfield", createdBy: "p_ava", links: [{ type: "account", id: "a_bloomfield" }, { type: "thread", id: "th_bloom_status" }], comments: [{ id: "cm_b1", authorId: "p_nadia", at: "2026-10-02T09:00:00Z", body: "Test plan shared Oct 2; weekly update starts Thursday." }] }),
    A({ id: "act_kin_chase", title: "Escalate Kinetic legal approval with the Global Brand Director", description: "Ask for a decision date; explain the unspent launch budget and the Oct 19 flight date.", ownerId: "p_claire", dueDate: "2026-10-02", status: "open", severity: "high", impact: "Unblocks the launch flight and an overdue invoice", accountId: "a_kinetic", createdBy: "p_owen", links: [{ type: "milestone", id: "ms_kin_film" }, { type: "invoice", id: "inv_pr_kin_launch_m1" }] }),
    A({ id: "act_kara_rebalance", title: "Rebalance Kara Singh's client load", description: "Move Voltra and Solstice paid social to Tyler, with Jonah as backup.", ownerId: "p_luis", dueDate: "2026-10-09", status: "open", severity: "high", impact: "Unblocks the Kinetic launch trafficking and the Bloomfield recovery", createdBy: "p_ava", links: [{ type: "person", id: "p_kara" }, { type: "task", id: "tk_kin_trafficking" }] }),
    A({ id: "act_voltra_pir", title: "Run Voltra post-incident review", description: "Share root cause and the new conversion monitoring.", ownerId: "p_nadia", dueDate: "2026-09-18", status: "done", severity: "high", impact: "Restored client confidence after the tracking outage", accountId: "a_voltra", createdBy: "p_ava", createdAt: "2026-09-12T10:00:00Z", links: [{ type: "thread", id: "th_voltra_pir" }] }),
  ];

  const connectors: ConnectorStatus[] = [
    {
      id: "con_clickup", orgId: ORG, provider: "ClickUp", kind: "project_management", mode: "simulated", state: "healthy",
      lastSuccessfulSync: "2026-10-05T06:00:00Z", lastAttempt: "2026-10-05T06:00:00Z",
      scopes: [{ scope: "Read spaces, tasks & time tracking", granted: true }, { scope: "Write tasks", granted: false, note: "Not requested: OpsInstinct is read-only" }],
      included: ["Client Delivery space", "Studio space", "Internal Ops space"], excluded: [{ name: "People & HR space", reason: "Excluded by administrator" }],
      failures: [], authoritativeFor: ["Projects", "Milestones", "Tasks", "Time entries"],
    },
    {
      id: "con_adplatforms", orgId: ORG, provider: "Ad platform reporting (Google, Meta, TikTok, LinkedIn, Pinterest, DSP, retail media)", kind: "advertising", mode: "simulated", state: "degraded",
      lastSuccessfulSync: "2026-10-05T03:00:00Z", lastAttempt: "2026-10-05T03:00:00Z",
      scopes: [{ scope: "Read campaign spend & conversions (reporting only)", granted: true }, { scope: "Edit campaigns or budgets", granted: false, note: "Not requested: OpsInstinct never changes live media" }],
      included: ["17 client ad accounts"], excluded: [{ name: "Client-owned accounts we don't manage", reason: "Out of scope" }],
      failures: [{ at: "2026-10-05T03:00:00Z", message: "Meta business manager for Northstar Pet: access revoked by the client on Aug 23. No spend reported since Aug 23.", recordRef: "act_northstar_meta" }],
      authoritativeFor: ["Media spend", "Conversions and revenue by flight"],
    },
    {
      id: "con_gmail", orgId: ORG, provider: "Google Workspace Gmail", kind: "communications", mode: "simulated", state: "healthy",
      lastSuccessfulSync: "2026-10-05T05:30:00Z", lastAttempt: "2026-10-05T05:30:00Z",
      scopes: [{ scope: "gmail.readonly (authorized mailboxes only)", granted: true }],
      included: ["nadia@tempo.example", "owen@tempo.example", "mei@tempo.example", "accounts@tempo.example"],
      excluded: [{ name: "ava@tempo.example", reason: "Executive mailbox not authorized for analysis" }, { name: "Labels: Personal, Legal-privileged", reason: "Label exclusion" }],
      failures: [], authoritativeFor: ["Client email threads"],
    },
    {
      id: "con_slack", orgId: ORG, provider: "Slack", kind: "communications", mode: "simulated", state: "healthy",
      lastSuccessfulSync: "2026-10-05T05:45:00Z", lastAttempt: "2026-10-05T05:45:00Z",
      scopes: [{ scope: "channels:history (explicitly added channels)", granted: true }, { scope: "Direct messages", granted: false, note: "Never requested" }],
      included: ["#ext-arcwave", "#ext-solstice", "#ext-bloomfield", "#ext-kinetic", "#ext-crestline", "#ext-hearthstone", "#ext-voltra", "#delivery-solstice", "#delivery-crestline", "#delivery-bloomfield"],
      excluded: [{ name: "#leadership", reason: "Not authorized for analysis" }],
      failures: [], authoritativeFor: ["Slack threads"],
    },
    {
      id: "con_accounting", orgId: ORG, provider: "Accounting provider (to be selected)", kind: "finance", mode: "simulated", state: "stale",
      lastSuccessfulSync: "2026-10-04T23:00:00Z", lastAttempt: "2026-10-05T07:00:00Z",
      scopes: [{ scope: "Read invoices, payments, bank balance", granted: true }],
      included: ["Accounts receivable", "Bank feed (operating account)"], excluded: [{ name: "Media pass-through ledger", reason: "Client media is billed at cost and kept out of agency revenue" }],
      failures: [{ at: "2026-10-05T07:00:00Z", message: "Morning sync timed out after 3 retries; using last successful sync from Oct 4, 23:00." }],
      authoritativeFor: ["Invoices", "Payments", "Bank balance"],
    },
    {
      id: "con_sheets", orgId: ORG, provider: "Google Sheets", kind: "spreadsheet", mode: "simulated", state: "healthy",
      lastSuccessfulSync: "2026-10-02T09:00:00Z", lastAttempt: "2026-10-02T09:00:00Z",
      scopes: [{ scope: "drive.file read-only (selected spreadsheets)", granted: true }],
      included: ["Tempo Finance Workbook", "Compensation 2026 (restricted)", "Media plans 2026"], excluded: [],
      failures: [], authoritativeFor: ["Compensation & employer costs", "Billable rates", "Contracts", "Media plan budgets and KPI targets"],
    },
  ];

  const mappings: EntityMapping[] = [
    { id: "map_cu_arcwave", orgId: ORG, connectorId: "con_clickup", externalName: "Arcwave / Always-on 2026", externalId: "cu_212", suggestedAccountId: "a_arcwave", suggestedProjectId: "pr_arc_media", confidence: "high", status: "confirmed", reason: "Exact name match, confirmed by Ezra Hale" },
    { id: "map_ads_bloom", orgId: ORG, connectorId: "con_adplatforms", externalName: "BLMFLD_US_Prospecting", externalId: "act_88213", suggestedAccountId: "a_bloomfield", suggestedProjectId: "pr_bloom_media", confidence: "high", status: "confirmed", reason: "Ad account naming convention match" },
    { id: "map_ads_green", orgId: ORG, connectorId: "con_adplatforms", externalName: "GL Produce Pilot", externalId: "ic_4410", suggestedAccountId: "a_greenline", suggestedProjectId: "pr_green_pilot", confidence: "medium", status: "needs_review", reason: "Ambiguous: 'GL' also matches an archived prospect 'Glow Labs'" },
    { id: "map_ads_northstar", orgId: ORG, connectorId: "con_adplatforms", externalName: "Northstar Pet (Meta)", externalId: "act_northstar_meta", suggestedAccountId: "a_northstar", confidence: "high", status: "needs_review", reason: "Account matches, but access was revoked so no data is available" },
    { id: "map_gmail_loop", orgId: ORG, connectorId: "con_gmail", externalName: "loopframe.example (domain)", externalId: "dom_loopframe", confidence: "low", status: "needs_review", reason: "Supplier domain, not a client. Suggest excluding from client analysis." },
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
    mediaFlights,
    retailLaunches: [],
    threads,
    actions,
    connectors,
    mappings,
    opportunitySeeds: {
      sig_a_arcwave_expansion_interest: { estimatedValue: 240_000, estimatedBy: "p_nadia", nextStep: "Run MMM and CTV scale-up scoping session week of Oct 12" },
    },
  };
}
