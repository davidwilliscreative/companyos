"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AssistantResponse } from "@/lib/assistant/types";

interface Turn {
  q: string;
  a?: AssistantResponse;
  error?: string;
}

const KIND_CLS: Record<string, string> = {
  calculated: "bg-accent-soft text-accent",
  observed: "bg-canvas text-ink-soft",
  inferred: "bg-violet-soft text-violet",
  estimate: "bg-warn-soft text-warn",
};

export function AssistantChat({ accountId, accountName, suggestions, autoFocus = false }: { accountId?: string; accountName?: string; suggestions: string[]; autoFocus?: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setQ("");
    setTurns((t) => [...t, { q: question }]);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, accountId }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
      const a = (await res.json()) as AssistantResponse;
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x)));
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: e instanceof Error ? e.message : "Something went wrong" } : x)));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-xs text-warn">
        <strong>Simulated assistant.</strong> No AI service is connected. Answers are composed deterministically from {accountName ? `${accountName}'s` : "your permitted"} records and the same calculations as the dashboard. Read-only.
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" aria-live="polite">
        {turns.length === 0 && (
          <div>
            <div className="mb-2 text-xs font-medium text-ink-muted">Try asking</div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button key={s} className="rounded-full border border-line bg-white px-3 py-1 text-left text-xs text-ink-soft hover:border-accent hover:text-accent" onClick={() => ask(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-8 rounded-lg bg-ink px-3 py-2 text-sm text-white">{t.q}</div>
            {!t.a && !t.error && <div className="text-sm text-ink-muted">Retrieving records…</div>}
            {t.error && <div className="rounded-lg border border-bad-line bg-bad-soft px-3 py-2 text-sm text-bad">{t.error}</div>}
            {t.a && <Answer a={t.a} onFollowUp={ask} />}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <label htmlFor={`ask-${accountId ?? "global"}`} className="sr-only">
          Ask a question
        </label>
        <input id={`ask-${accountId ?? "global"}`} ref={inputRef} className="input" placeholder={accountName ? `Ask about ${accountName}…` : "Ask about accounts, projects, cash, capacity…"} value={q} onChange={(e) => setQ(e.target.value)} maxLength={600} />
        <button className="btn btn-primary" disabled={busy || !q.trim()}>
          Ask
        </button>
      </form>
    </div>
  );
}

function Answer({ a, onFollowUp }: { a: AssistantResponse; onFollowUp: (q: string) => void }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
        <span className="rounded bg-warn-soft px-1.5 py-0.5 font-medium text-warn">{a.provider.label}</span>
        <span>{a.period}</span>
        {a.insufficient && <span className="rounded bg-canvas px-1.5 py-0.5 font-medium text-ink-soft">Insufficient information</span>}
      </div>
      <div className="space-y-1.5 text-ink">
        {a.answer.map((p, i) => (
          <p key={i} className={i === 0 ? "font-medium" : ""}>
            {p}
          </p>
        ))}
      </div>
      {a.figures.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {a.figures.map((f, i) => (
            <div key={i} className="rounded-md border border-line px-2 py-1">
              <div className="text-[10px] text-ink-muted">{f.label}</div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold tabular-nums">{f.value}</span>
                <span className={`rounded px-1 text-[9px] font-medium uppercase ${KIND_CLS[f.kind]}`}>{f.kind}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {a.evidence.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Evidence</div>
          <ul className="space-y-1">
            {a.evidence.map((e) => (
              <li key={`${e.type}:${e.id}`} className="text-xs">
                <Link href={e.href}>{e.label}</Link>
                <span className="ml-1 text-ink-muted">({e.type})</span>
                {e.excerpt && <blockquote className="mt-0.5 border-l-2 border-line pl-2 text-ink-soft">“{e.excerpt}”</blockquote>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.notes.length > 0 && (
        <ul className="mt-3 space-y-0.5 border-t border-line pt-2 text-xs text-ink-soft">
          {a.notes.map((n, i) => (
            <li key={i}>⚠︎ {n}</li>
          ))}
        </ul>
      )}
      {a.followUps.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {a.followUps.map((f) => (
            <button key={f} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-soft hover:border-accent hover:text-accent" onClick={() => onFollowUp(f)}>
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AssistantDrawer({ suggestions }: { suggestions: string[] }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((x) => !x);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const wasOpen = useRef(false);
  useEffect(() => {
    // Return focus to the button only after the drawer closes, not on first render.
    if (!open && wasOpen.current) btnRef.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);
  return (
    <>
      <button ref={btnRef} className="btn btn-primary rounded-full pl-3 pr-2" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <Sparkles aria-hidden="true" size={15} className="text-[#a9a4ff]" />
        Ask CompanyOS <kbd className="hidden rounded-md bg-white/15 px-1.5 py-0.5 font-sans text-[10px] font-medium text-white/80 sm:inline">⌘K</kbd>
      </button>
      {open &&
        createPortal(
        <div className="fixed inset-0 z-50 flex justify-end">
          <button aria-label="Close assistant" className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="CompanyOS assistant" className="relative flex h-full w-full max-w-xl flex-col border-l border-line bg-canvas p-5 shadow-pop">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-base font-semibold tracking-tight"><Sparkles aria-hidden="true" size={16} className="text-accent" />Assistant</div>
                <div className="text-xs text-ink-muted">Company-wide, limited to what your role can see</div>
              </div>
              <button className="btn" onClick={() => setOpen(false)}>
                Close <span className="sr-only">assistant</span>
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <AssistantChat suggestions={suggestions} autoFocus />
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
