"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { AssistantResponse } from "@/lib/assistant/types";

/**
 * One assistant, one drawer. Detail pages register the record being viewed so
 * the drawer opens scoped to "This client" or "This project"; elsewhere it is
 * scoped to everything the role can see ("My accounts" or "Company-wide").
 */
export interface PageScope {
  kind: "account" | "project";
  id: string;
  label: string;
  name: string;
  suggestions: string[];
}

type Listener = () => void;
const store = { scope: null as PageScope | null, open: false, listeners: new Set<Listener>() };
const emit = () => store.listeners.forEach((l) => l());
const subscribe = (l: Listener) => {
  store.listeners.add(l);
  return () => store.listeners.delete(l);
};
function setOpen(open: boolean) {
  store.open = open;
  emit();
}
let snap = { scope: store.scope, open: store.open };
function getSnap() {
  if (snap.scope !== store.scope || snap.open !== store.open) snap = { scope: store.scope, open: store.open };
  return snap;
}

/** Registers the record a detail page is about, for as long as the page is shown. */
export function AssistantScope(props: PageScope) {
  const { kind, id, label, name } = props;
  const key = props.suggestions.join("|");
  useEffect(() => {
    store.scope = { kind, id, label, name, suggestions: key.split("|") };
    emit();
    return () => {
      if (store.scope?.id === id) {
        store.scope = null;
        emit();
      }
    };
  }, [kind, id, label, name, key]);
  return null;
}

/** An in-page entry point that opens the shared drawer in the page's scope. */
export function AskAssistantButton({ label }: { label: string }) {
  return (
    <button className="btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
      <Sparkles aria-hidden="true" size={14} className="text-accent" />
      {label}
    </button>
  );
}

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

function AssistantChat({ scope, suggestions, autoFocus = false }: { scope: PageScope | null; suggestions: string[]; autoFocus?: boolean }) {
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
      const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, accountId: scope?.kind === "account" ? scope.id : undefined, projectId: scope?.kind === "project" ? scope.id : undefined }) });
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
        <strong>Simulated assistant.</strong> No AI service is connected. Answers are composed from {scope ? `${scope.name}'s` : "your permitted"} records using the same calculations as the dashboard. It cannot change anything.
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
        <label htmlFor="ask-assistant" className="sr-only">
          Ask a question
        </label>
        <input id="ask-assistant" ref={inputRef} className="input" placeholder={scope ? `Ask about ${scope.name}…` : "Ask about accounts, projects, cash, capacity…"} value={q} onChange={(e) => setQ(e.target.value)} maxLength={600} />
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
        <span className="rounded bg-canvas px-1.5 py-0.5 font-medium text-ink-soft">Scope: {a.scope.label}{a.scope.name ? ` · ${a.scope.name}` : ""}</span>
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

export function AssistantDrawer({ suggestions, broadScope }: { suggestions: string[]; broadScope: string }) {
  const { scope: pageScope, open } = useSyncExternalStore(subscribe, getSnap, getSnap);
  const [useBroad, setUseBroad] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const scope = useBroad ? null : pageScope;
  useEffect(() => setUseBroad(false), [pageScope?.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!store.open);
      }
      if (e.key === "Escape" && store.open) setOpen(false);
      // Keep keyboard focus inside the open drawer.
      if (e.key === "Tab" && store.open && dialogRef.current) {
        const f = [...dialogRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select, textarea")];
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
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
        Ask OpsInstinct <kbd className="hidden rounded-md bg-white/15 px-1.5 py-0.5 font-sans text-[10px] font-medium text-white/80 sm:inline">⌘K</kbd>
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex justify-end">
            <button aria-label="Close assistant" tabIndex={-1} className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="OpsInstinct assistant" className="relative flex h-full w-full max-w-xl flex-col border-l border-line bg-canvas p-4 shadow-pop sm:p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-base font-semibold tracking-tight">
                    <Sparkles aria-hidden="true" size={16} className="text-accent" />
                    Assistant
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                    <span>Scope:</span>
                    {pageScope ? (
                      <div role="group" aria-label="Assistant scope" className="inline-flex rounded-full bg-surface p-0.5 ring-1 ring-inset ring-line">
                        <button aria-pressed={!useBroad} onClick={() => setUseBroad(false)} className={`rounded-full px-2 py-0.5 ${!useBroad ? "bg-ink font-medium text-white" : "text-ink-soft"}`}>
                          {pageScope.label}: {pageScope.name}
                        </button>
                        <button aria-pressed={useBroad} onClick={() => setUseBroad(true)} className={`rounded-full px-2 py-0.5 ${useBroad ? "bg-ink font-medium text-white" : "text-ink-soft"}`}>
                          {broadScope}
                        </button>
                      </div>
                    ) : (
                      <span className="rounded-full bg-surface px-2 py-0.5 font-medium text-ink ring-1 ring-inset ring-line">{broadScope}</span>
                    )}
                    <span className="text-ink-muted">· limited to what your role can see</span>
                  </div>
                </div>
                <button className="btn" onClick={() => setOpen(false)}>
                  Close <span className="sr-only">assistant</span>
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <AssistantChat key={scope?.id ?? "broad"} scope={scope} suggestions={scope ? scope.suggestions : suggestions} autoFocus />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
