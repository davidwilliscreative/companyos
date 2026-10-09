import type { Dataset, EvidenceLink } from "@/domain/types";

/** Every evidence link resolves to a page that shows the underlying record. */
export function hrefFor(link: EvidenceLink, data?: Pick<Dataset, "milestones" | "tasks" | "invoices" | "threads">): string {
  switch (link.type) {
    case "account":
      return `/accounts/${link.id}`;
    case "project":
      return `/projects/${link.id}`;
    case "milestone": {
      const m = data?.milestones.find((x) => x.id === link.id);
      return m ? `/projects/${m.projectId}#${link.id}` : `/projects`;
    }
    case "task": {
      const t = data?.tasks.find((x) => x.id === link.id);
      return t ? `/projects/${t.projectId}#${link.id}` : `/projects`;
    }
    case "invoice":
      return `/finance/invoices/${link.id}`;
    case "thread":
      return `/communications/${link.id}`;
    case "message": {
      const t = data?.threads.find((x) => x.messages.some((m) => m.id === link.id));
      return t ? `/communications/${t.id}#${link.id}` : `/communications`;
    }
    case "signal":
      return `/signals/${link.id}`;
    case "opportunity":
      return `/signals?tab=opportunities#${link.id}`;
    case "person":
      return `/team#${link.id}`;
    case "calculation": {
      const [kind, id] = link.id.split(":");
      if (kind === "margin") return `/projects/${id}#calculation`;
      if (kind === "cash") return `/finance#cash`;
      if (kind === "health") return `/accounts/${id}#health`;
      if (kind === "utilization") return `/team#utilization`;
      return `/calculations`;
    }
  }
}
