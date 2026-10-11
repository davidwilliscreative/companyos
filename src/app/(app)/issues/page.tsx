import Link from "next/link";
import { ISSUE_KIND_LABEL, IssueCard } from "@/components/issues";
import { EmptyState, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { buildIssues, issuesForRole, type IssueKind } from "@/lib/issues";
import { aggregateScope } from "@/lib/permissions";

export default async function IssuesPage({ searchParams }: { searchParams: Promise<{ kind?: string; filter?: string }> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  const all = issuesForRole(buildIssues(ws), ws.ctx.role, ws.user.id);
  // Show everything the role can see, not only the role's focus list.
  const every = [...all, ...buildIssues(ws).filter((i) => !all.some((x) => x.id === i.id))];
  const titles = Object.fromEntries(every.map((i) => [i.id, i.title]));
  const kinds = [...new Set(every.map((i) => i.kind))] as IssueKind[];
  const filtered = every.filter((i) => (!sp.kind || i.kind === sp.kind) && (sp.filter !== "executive" || i.executive) && (sp.filter !== "mine" || i.ownerId === ws.user.id || i.plans.some((p) => p.ownerId === ws.user.id)) && (sp.filter !== "noplan" || !i.plans.some((p) => p.relation === "plan")));
  const urgent = every.filter((i) => i.severity === "critical" || i.severity === "high").length;
  const chip = (label: string, params: Record<string, string | undefined>, active: boolean) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
    return (
      <Link key={label} href={`/issues${q ? `?${q}` : ""}`} aria-current={active ? "page" : undefined} className={`rounded-full px-3 py-1 text-sm no-underline ring-1 ring-inset ${active ? "bg-ink text-white ring-ink hover:text-white" : "bg-surface text-ink-soft ring-line hover:text-ink"}`}>
        {label}
      </Link>
    );
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={aggregateScope(ws.caps)}
        title="Issues"
        subtitle={`${every.length} open issue${every.length === 1 ? "" : "s"}, ${urgent} urgent. Each groups related alerts into one situation with an owner, a plan and a next update.`}
      />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2" aria-label="Quick views">
          {chip("All", { kind: sp.kind }, !sp.filter)}
          {ws.ctx.role === "executive" && chip("Executive decisions", { kind: sp.kind, filter: "executive" }, sp.filter === "executive")}
          {chip("Mine", { kind: sp.kind, filter: "mine" }, sp.filter === "mine")}
          {chip("No plan yet", { kind: sp.kind, filter: "noplan" }, sp.filter === "noplan")}
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Issue type">
          {chip("Any type", { filter: sp.filter }, !sp.kind)}
          {kinds.map((k) => chip(ISSUE_KIND_LABEL[k], { kind: k, filter: sp.filter }, sp.kind === k))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No issues match">Try another view.</EmptyState>
      ) : (
        <div className="space-y-3">
          {filtered.map((i) => (
            <IssueCard key={i.id} ws={ws} issue={i} titles={titles} />
          ))}
        </div>
      )}
    </div>
  );
}
