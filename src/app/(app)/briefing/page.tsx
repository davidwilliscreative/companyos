import { redirect } from "next/navigation";

/** The weekly briefing is now the weekly report on Home. Old links keep working. */
export default function BriefingRedirect() {
  redirect("/?view=weekly");
}
