"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addMemberAction, createActionAction, decideMappingAction, editOpportunityAction, removeMemberAction, resetDemoAction, reviewSignalAction, setCurrencyAction, updateActionAction } from "@/app/actions";
import type { Action, CurrencyCode, EvidenceLink, Opportunity, ReviewStatus, RoleId, Severity } from "@/domain/types";

const ROLE_LABELS: Record<RoleId, string> = { executive: "Executive", finance: "Finance", account_owner: "Account owner", department_head: "Department head", admin: "Administrator" };

type Res = { ok: true } | { ok: false; error: string };

/** Runs a server action, refreshes server components, and surfaces errors. */
function useMutation() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const run = (fn: () => Promise<Res | { ok: boolean; error?: string }>, success?: string, after?: () => void) =>
    start(async () => {
      setError(null);
      setMessage(null);
      const r = await fn();
      if (!r.ok) {
        setError("error" in r && r.error ? r.error : "Something went wrong");
        return;
      }
      if (success) setMessage(success);
      after?.();
      router.refresh();
    });
  return { pending, error, message, run };
}

function Feedback({ error, message }: { error: string | null; message: string | null }) {
  if (error) return <p role="alert" className="mt-2 text-xs text-bad">{error}</p>;
  if (message) return <p role="status" className="mt-2 text-xs text-good">{message}</p>;
  return null;
}

/* ------------------------------------------------------------------ */

export interface PersonOption {
  id: string;
  name: string;
}

export function ActionForm({
  people,
  defaults,
  canManage,
  label = "Create plan",
  defaultOpen = false,
  minDate,
}: {
  people: PersonOption[];
  defaults: { title?: string; description?: string; ownerId?: string; dueDate: string; severity?: Severity; impact?: string; accountId?: string; links?: EvidenceLink[]; origin?: Action["origin"] };
  canManage: boolean;
  label?: string;
  defaultOpen?: boolean;
  minDate?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState(defaults.title ?? "");
  const [description, setDescription] = useState(defaults.description ?? "");
  const [ownerId, setOwnerId] = useState(defaults.ownerId ?? people[0]?.id ?? "");
  const [dueDate, setDueDate] = useState(defaults.dueDate);
  const [severity, setSeverity] = useState<Severity>(defaults.severity ?? "medium");
  const [impact, setImpact] = useState(defaults.impact ?? "");
  const { pending, error, message, run } = useMutation();
  if (!canManage) return null;
  if (!open)
    return (
      <div>
        <button className="btn h-8 px-3 text-xs" onClick={() => setOpen(true)}>
          + {label}
        </button>
        <Feedback error={error} message={message} />
      </div>
    );
  return (
    <form
      className="space-y-3 rounded-xl border border-line bg-canvas p-4 text-ink"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => createActionAction({ title, description, ownerId, dueDate, severity, impact, accountId: defaults.accountId, links: defaults.links ?? [], origin: defaults.origin ?? "user" }),
          "Plan created. It now appears under Plans.",
          () => setOpen(false),
        );
      }}
    >
      <div>
        <label className="label" htmlFor="af-title">Title</label>
        <input id="af-title" className="input" required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="af-desc">Description</label>
        <textarea id="af-desc" className="input min-h-[60px]" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="af-owner">Owner</label>
          <select id="af-owner" className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="af-due">Due date</label>
          <input id="af-due" type="date" className="input" required min={minDate} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="af-sev">Severity</label>
          <select id="af-sev" className="input" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="af-impact">Impact</label>
          <input id="af-impact" className="input" maxLength={160} value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="e.g. $45k cash" />
        </div>
      </div>
      {(defaults.links?.length ?? 0) > 0 && <p className="text-xs text-ink-muted">{defaults.links!.length} evidence link(s) will be attached.</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending || !title.trim()}>
          {pending ? "Saving…" : "Save plan"}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <p className="text-[11px] text-ink-muted">Saved to this demo&rsquo;s shared data, which everyone using the demo sees. No email or Slack message is sent.</p>
      <Feedback error={error} message={message} />
    </form>
  );
}

export function ActionControls({ id, status, canManage }: { id: string; status: Action["status"]; canManage: boolean }) {
  const [comment, setComment] = useState("");
  const { pending, error, message, run } = useMutation();
  if (!canManage) return null;
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`st-${id}`}>Status</label>
        <select id={`st-${id}`} className="input w-auto py-1 text-xs" value={status} disabled={pending} onChange={(e) => run(() => updateActionAction(id, { status: e.target.value as Action["status"] }), "Status updated")}>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!comment.trim()) return;
          run(() => updateActionAction(id, {}, comment), "Comment added", () => setComment(""));
        }}
      >
        <label className="sr-only" htmlFor={`cm-${id}`}>Add a comment</label>
        <input id={`cm-${id}`} className="input py-1 text-xs" placeholder="Add a comment…" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
        <button className="btn text-xs" disabled={pending || !comment.trim()}>
          Comment
        </button>
      </form>
      <Feedback error={error} message={message} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function SignalReviewControls({ signalId, status, canReview }: { signalId: string; status: ReviewStatus; canReview: boolean }) {
  const [note, setNote] = useState("");
  const { pending, error, message, run } = useMutation();
  if (!canReview) return <p className="text-xs text-ink-muted">Your role can view this signal but not change its review status.</p>;
  const btn = (s: ReviewStatus, label: string) => (
    <button key={s} className={`btn text-xs ${status === s ? "ring-2 ring-accent" : ""}`} disabled={pending} aria-pressed={status === s} onClick={() => run(() => reviewSignalAction(signalId, s, note || undefined), `Marked ${label.toLowerCase()}`)}>
      {label}
    </button>
  );
  return (
    <div className="space-y-2">
      <label className="label" htmlFor={`note-${signalId}`}>Review note (optional)</label>
      <input id={`note-${signalId}`} className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why you confirmed, dismissed or resolved it" />
      <div className="flex flex-wrap gap-2">
        {btn("confirmed", "Confirm")}
        {btn("dismissed", "Dismiss")}
        {btn("resolved", "Resolve")}
        {status !== "unreviewed" && btn("unreviewed", "Reset to unreviewed")}
      </div>
      <p className="text-[11px] text-ink-muted">A dismissed signal re-surfaces automatically if new evidence arrives later.</p>
      <Feedback error={error} message={message} />
    </div>
  );
}

export function OpportunityEditor({ opp, canEdit, currency }: { opp: Pick<Opportunity, "id" | "estimatedValue" | "nextStep" | "status">; canEdit: boolean; currency: CurrencyCode }) {
  const [value, setValue] = useState(opp.estimatedValue === null ? "" : String(Math.round(opp.estimatedValue)));
  const [nextStep, setNextStep] = useState(opp.nextStep);
  const [status, setStatus] = useState(opp.status);
  const { pending, error, message, run } = useMutation();
  if (!canEdit) return null;
  return (
    <form
      className="mt-3 grid gap-2 rounded-lg border border-line bg-canvas p-3 sm:grid-cols-[140px_1fr_140px_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        const n = value.trim() === "" ? null : Number(value.replace(/[,\s]/g, ""));
        if (n !== null && (!Number.isFinite(n) || n < 0)) return;
        run(() => editOpportunityAction(opp.id, { estimatedValue: n, nextStep, status }), "Saved");
      }}
    >
      <div>
        <label className="label" htmlFor={`ov-${opp.id}`}>Manual estimate ({currency})</label>
        <input id={`ov-${opp.id}`} className="input" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Not estimated" />
      </div>
      <div>
        <label className="label" htmlFor={`on-${opp.id}`}>Next step</label>
        <input id={`on-${opp.id}`} className="input" maxLength={300} value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor={`os-${opp.id}`}>Status</label>
        <select id={`os-${opp.id}`} className="input" value={status} onChange={(e) => setStatus(e.target.value as Opportunity["status"])}>
          <option value="open">Open</option>
          <option value="qualified">Qualified</option>
          <option value="won">Won</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>
      <div className="flex items-end">
        <button className="btn btn-primary" disabled={pending}>
          Save
        </button>
      </div>
      <p className="text-[11px] text-ink-muted sm:col-span-4">Estimates are judgment, never counted in revenue, forecasts or cash.</p>
      <div className="sm:col-span-4">
        <Feedback error={error} message={message} />
      </div>
    </form>
  );
}

export function MappingDecision({ id, status, canManage }: { id: string; status: "confirmed" | "needs_review" | "rejected"; canManage: boolean }) {
  const { pending, error, message, run } = useMutation();
  if (!canManage) return <span className="text-xs text-ink-muted">Admin only</span>;
  return (
    <div>
      <div className="flex gap-1.5">
        <button className="btn py-1 text-xs" disabled={pending || status === "confirmed"} onClick={() => run(() => decideMappingAction(id, "confirmed"), "Confirmed")}>
          Confirm
        </button>
        <button className="btn py-1 text-xs" disabled={pending || status === "rejected"} onClick={() => run(() => decideMappingAction(id, "rejected"), "Rejected")}>
          Reject
        </button>
      </div>
      <Feedback error={error} message={message} />
    </div>
  );
}

export function CurrencyForm({ current, canChange }: { current: CurrencyCode; canChange: boolean }) {
  const { pending, error, message, run } = useMutation();
  return (
    <div>
      <label className="label" htmlFor="rep-cur">Reporting currency</label>
      <select id="rep-cur" className="input w-auto" value={current} disabled={!canChange || pending} onChange={(e) => run(() => setCurrencyAction(e.target.value as CurrencyCode), "Reporting currency updated")}>
        <option value="USD">USD ($)</option>
        <option value="EUR">EUR (€)</option>
        <option value="GBP">GBP (£)</option>
      </select>
      {!canChange && <p className="mt-1 text-xs text-ink-muted">Account owners cannot change organization settings.</p>}
      <Feedback error={error} message={message} />
    </div>
  );
}

export function ResetButton() {
  const [confirming, setConfirming] = useState(false);
  const { pending, error, message, run } = useMutation();
  return (
    <div>
      {!confirming ? (
        <button className="btn" onClick={() => setConfirming(true)}>
          Reset demo data
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">Discard all demo edits (actions, reviews, scenarios, imports) for every profile?</span>
          <button className="btn btn-primary" disabled={pending} onClick={() => run(() => resetDemoAction(), "Demo reset to the original seed data.", () => setConfirming(false))}>
            {pending ? "Resetting…" : "Yes, reset"}
          </button>
          <button className="btn" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      )}
      <Feedback error={error} message={message} />
    </div>
  );
}

export function MembersManager({ members, me }: { members: { email: string; role: RoleId; displayName: string | null }[]; me: string }) {
  const { pending, error, message, run } = useMutation();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<RoleId>("account_owner");
  return (
    <div>
      <table className="w-full">
        <thead>
          <tr>
            <th className="th">Email</th>
            <th className="th">Role</th>
            <th className="th" />
          </tr>
        </thead>
        <tbody>
          {members.map((x) => (
            <tr key={x.email}>
              <td className="td">
                {x.displayName && <div className="font-medium">{x.displayName}</div>}
                <div className="text-xs text-ink-soft">{x.email}</div>
              </td>
              <td className="td text-sm">{ROLE_LABELS[x.role]}</td>
              <td className="td text-right">
                {x.email !== me && (
                  <button className="btn py-1 text-xs" disabled={pending} onClick={() => run(() => removeMemberAction(x.email), `Removed ${x.email}.`)}>
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addMemberAction(email, role, name), `${email.trim().toLowerCase()} can now sign in.`, () => {
            setEmail("");
            setName("");
          });
        }}
      >
        <div>
          <label className="label" htmlFor="m-email">Email (their Google account)</label>
          <input id="m-email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="m-name">Name (optional)</label>
          <input id="m-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="m-role">Role</label>
          <select id="m-role" className="input" value={role} onChange={(e) => setRole(e.target.value as RoleId)}>
            {(Object.keys(ROLE_LABELS) as RoleId[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Add or update"}
        </button>
      </form>
      <Feedback error={error} message={message} />
    </div>
  );
}
