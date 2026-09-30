"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Church } from "lucide-react";
import { navigationItems } from "./dashboard-navigation";
import styles from "./dashboard-layout.module.css";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Events keeps its existing redirect and independent frontend untouched.
  if (pathname === "/dashboard/eventos" || pathname.startsWith("/dashboard/eventos/")) return children;

  return <div className={styles.frame}>
    <a className={styles.skipLink} href="#dashboard-content">Ir para o conteúdo</a>
    <aside className={styles.sidebar} aria-label="Menu do sistema">
      <Link href="/dashboard" className={styles.brand} aria-label="Sistema Igrejas — painel">
        <span className={styles.brandIcon}><Church size={23} aria-hidden="true" /></span>
        <span className={styles.label}><strong>Sistema Igrejas</strong><small>Gestão da igreja</small></span>
      </Link>
      <nav className={styles.navigation} aria-label="Navegação principal">
        {navigationItems.map(item => {
          const active = item.href === "/dashboard" ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
          return <Link key={item.href} href={item.href} className={styles.navItem} aria-current={active ? "page" : undefined} aria-label={item.label} title={item.label}>
            <span className={styles.icon}>{item.icon}</span><span className={styles.label}>{item.label}</span>
          </Link>;
        })}
      </nav>
      <div className={styles.sidebarFooter} aria-hidden="true"><span className={styles.footerMark}>SI</span><span className={styles.label}>Sistema Igrejas</span></div>
    </aside>
    <div id="dashboard-content" className={styles.content} tabIndex={-1}>{children}</div>
  </div>;
}
