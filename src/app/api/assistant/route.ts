import { NextResponse } from "next/server";
import { getWorkspace } from "@/data/session";
import { getAssistantProvider } from "@/lib/assistant";

/**
 * Assistant endpoint. Runs on the server so that a future Claude provider can
 * use a server-side API key. The workspace passed to the provider is already
 * scoped to the caller's organization and role.
 */
export async function POST(req: Request) {
  let body: { question?: unknown; accountId?: unknown; projectId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question : "";
  const accountId = typeof body.accountId === "string" ? body.accountId : undefined;
  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  if (!question.trim()) return NextResponse.json({ error: "Question is required" }, { status: 400 });
  const ws = await getWorkspace();
  const provider = getAssistantProvider();
  const answer = await provider.answer({ question, scope: accountId || projectId ? { accountId, projectId } : undefined }, ws);
  return NextResponse.json(answer);
}
