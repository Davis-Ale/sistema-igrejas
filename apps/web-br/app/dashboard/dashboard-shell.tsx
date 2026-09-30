"use client";

import Link from "next/link";
import { ArrowUpRight, Church, Sparkles, LogOut, ShieldCheck, Mail } from "lucide-react";
import type { DashboardSession } from "./dashboard-types";
import { moduleShortcuts, navigationItems } from "./dashboard-navigation";
import ui from "./ui.module.css";
import styles from "./dashboard-home.module.css";

type DashboardShellProps = { session: DashboardSession; onLogout: () => void };
const descriptions: Record<string, string> = {
  "/dashboard/ministerios": "Responsáveis e equipes",
  "/dashboard/membros": "Cadastro e contatos",
  "/dashboard/visitantes": "Recepção e acompanhamento",
  "/dashboard/celulas": "Encontros e liderança",
  "/dashboard/eventos": "Organização de eventos",
  "/dashboard/financeiro": "Entradas, saídas e lançamentos",
  "/dashboard/trilho": "Trilhos e etapas",
  "/dashboard/voluntarios": "Pessoas e voluntariado"
};

export function DashboardShell({ session, onLogout }: DashboardShellProps) {
  return <main className={ui.page}><div className={ui.container}>
    <header className={styles.header}>
      <div><p className={ui.eyebrow}>Painel da igreja</p><h1>{session.church.name}</h1><p>Um espaço para organizar a rotina e acompanhar sua igreja.</p></div>
      <button type="button" onClick={onLogout} className={ui.quiet}><LogOut size={15} aria-hidden="true" />Sair</button>
    </header>
    <section className={styles.welcome}>
      <div><span className={styles.welcomeIcon}><Church size={27} aria-hidden="true" /></span><p className={ui.eyebrow}>Sistema Igrejas</p><h2>Sua gestão, em um só lugar.</h2><p>Acesse os módulos para consultar informações e continuar o trabalho da igreja.</p></div>
      <div className={styles.sessionInfo}>
        <span><ShieldCheck size={17} aria-hidden="true" /><span>Situação da igreja<strong>{session.church.status}</strong></span></span>
        <span><Mail size={17} aria-hidden="true" /><span>Conta conectada<strong>{session.user.email}</strong></span></span>
        <span><ShieldCheck size={17} aria-hidden="true" /><span>Perfil de acesso<strong>{session.user.role}</strong></span></span>
      </div>
    </section>
    <div className={styles.contentGrid}>
      <section aria-labelledby="modules-title">
        <div className={styles.sectionHeading}><div><h2 id="modules-title">Acessos rápidos</h2><p>Escolha por onde continuar.</p></div><span className={ui.badge}>{moduleShortcuts.length} módulos</span></div>
        <div className={styles.moduleGrid}>{moduleShortcuts.map(module => <Link className={styles.moduleCard} href={module.href} key={module.href}>
          <span className={styles.moduleIcon}>{navigationItems.find(item => item.href === module.href)?.icon}</span><ArrowUpRight size={16} className={styles.cardArrow} aria-hidden="true" /><h3>{module.label}</h3><p>{descriptions[module.href]}</p>
        </Link>)}</div>
      </section>
      <aside className={styles.assistantCard}>
        <span className={styles.assistantIcon}><Sparkles size={26} aria-hidden="true" /></span><p className={ui.eyebrow}>Assistente IA</p><h2>Encontre informações da igreja.</h2><p>Faça uma pergunta para consultar os dados disponíveis no sistema, conforme seu acesso.</p>
        <Link href="/dashboard/assistente" className={ui.secondary}>Abrir assistente<ArrowUpRight size={16} aria-hidden="true" /></Link>
      </aside>
    </div>
  </div></main>;
}
