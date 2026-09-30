import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import ui from "./ui.module.css";

export function PageHeader({ title, description, icon: Icon, action }: { title: string; description: string; icon: LucideIcon; action?: ReactNode }) {
  return <header className={ui.header}><div><Link className={ui.back} href="/dashboard"><ArrowLeft size={15} aria-hidden="true" />Voltar ao painel</Link><div className={ui.titleRow}><span className={ui.pageIcon}><Icon size={24} aria-hidden="true" /></span><div><p className={ui.eyebrow}>Gestão da igreja</p><h1>{title}</h1></div></div><p className={ui.intro}>{description}</p></div>{action}</header>;
}

export function EmptyState({ title, description, icon: Icon }: { title: string; description?: string; icon: LucideIcon }) {
  return <div className={ui.empty}><span className={ui.emptyIcon}><Icon size={27} aria-hidden="true" /></span><h3>{title}</h3>{description && <p>{description}</p>}</div>;
}
