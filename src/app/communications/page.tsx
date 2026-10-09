import Link from "next/link";
import { Badge, Card, EmptyState, Notice, PageHeader, Restricted } from "@/components/ui";
import { getWorkspace } from "@/data/session";
import { fmtDate } from "@/lib/dates";
import { looksLikeInstruction } from "@/lib/signals/engine";
import { viewHelpers } from "@/lib/view";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function CommunicationsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  const v = viewHelpers(ws);
  if (ws.caps.communications === "none") {
    return (
      <div className="space-y-6">
        <PageHeader title="Communications" />
        <Restricted what="Message content is not available to the Administrator role. Administrators manage which mailboxes and channels are connected on the Integrations page." />
      </div>
    );
  }
  const account = typeof sp.account === "string" ? sp.account : "all";
  const channel = typeof sp.channel === "string" ? sp.channel : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const threads = ws.data.threads
    .filter((t) => (account === "all" || t.accountId === account) && (channel === "all" || t.channel === channel))
    .filter((t) => !q || t.subject.toLowerCase().includes(q) || t.messages.some((m) => m.body.toLowerCase().includes(q)))
    .sort((x, y) => ((x.messages.at(-1)?.sentAt ?? "") < (y.messages.at(-1)?.sentAt ?? "") ? 1 : -1));

  return (
    <div className="space-y-6">
      <PageHeader title="Communications" subtitle="Simulated email and Slack threads from explicitly authorized mailboxes and channels. Message content is treated as untrusted data: it is analysed, never followed as instructions." />
      {ws.caps.communications === "billing_only" && <Notice tone="info">Your role sees billing conversations only.</Notice>}
      {ws.caps.communications === "own_accounts" && <Notice tone="info">You see threads for the accounts you own.</Notice>}
      <form className="card flex flex-wrap items-end gap-3 p-3" role="search">
        <div className="min-w-[200px] flex-1">
          <label className="label" htmlFor="q">Search messages</label>
          <input id="q" name="q" className="input" defaultValue={q} />
        </div>
        <div>
          <label className="label" htmlFor="account">{ws.profile.terms.account}</label>
          <select id="account" name="account" className="input" defaultValue={account}>
            <option value="all">All</option>
            {ws.data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="channel">Channel</label>
          <select id="channel" name="channel" className="input" defaultValue={channel}>
            <option value="all">All</option>
            <option value="email">Email</option>
            <option value="slack">Slack</option>
          </select>
        </div>
        <button className="btn btn-primary">Apply</button>
      </form>
      <Card padded={false} title={`${threads.length} threads`}>
        {threads.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No threads" />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {threads.map((t) => {
              const last = t.messages.at(-1);
              const flagged = t.messages.some((m) => looksLikeInstruction(m.body));
              return (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/communications/${t.id}`} className="font-medium">
                      {t.subject}
                    </Link>
                    <Badge>{t.channel}</Badge>
                    {t.tags.map((tag) => (
                      <Badge key={tag} tone="neutral">
                        {tag}
                      </Badge>
                    ))}
                    {flagged && <Badge tone="warn">Contains instruction-like text</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-muted">
                    {t.accountId ? v.account(t.accountId) : "Internal"} · {t.location} · {t.messages.length} messages · last {fmtDate(last?.sentAt.slice(0, 10))} by {last?.author}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
