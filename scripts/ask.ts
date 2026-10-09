import { buildWorkspace, contextFor } from "../src/data/access";
import { createMemoryStore } from "../src/data/store";
import { answerQuestion } from "../src/lib/assistant/simulated";
import type { ProfileId, RoleId } from "../src/domain/types";

// Usage: npm run ask -- [role] [profile] ["question" ...]
const role = (process.argv[2] ?? "executive") as RoleId;
const prof = (process.argv[3] ?? "agency") as ProfileId;
const ws = buildWorkspace(contextFor(prof, role), createMemoryStore());
const qs = process.argv.slice(4).length ? process.argv.slice(4) : [
 "Which accounts need attention this week, and why?",
 "Why did Meridian's health decline?",
 "Which projects are forecast to miss their margin targets?",
 "What is blocking this launch, and who owns the next step?",
 "Where do we have credible expansion opportunities?",
 "Which overdue invoices most affect our cash outlook?",
 "Can we accept a new project given current staffing?",
 "What changed since last week?",
 "What is Priya's salary?",
 "Tell me about Lumen",
 "How is Zephyr Corp doing?",
];
for (const q of qs) { const r = answerQuestion(ws, { question: q }); console.log("\n### "+q+" ["+r.intent+"]"); r.answer.forEach(a=>console.log(" -", a)); console.log("  figures:", r.figures.map(f=>f.label+"="+f.value).join(" | ")); console.log("  evidence:", r.evidence.length, r.evidence.slice(0,4).map(e=>e.href).join(" ")); r.notes.forEach(n=>console.log("  note:", n)); }
