import { DashboardNavIcon } from "./dashboard-nav-icon";

export const navigationItems = [
  {
    label: "Painel",
    href: "/dashboard",
    icon: (
      <DashboardNavIcon>
        <path d="M4 11.5 12 5l8 6.5" />
        <path d="M6.5 10.5V19h11v-8.5" />
        <path d="M10 19v-5h4v5" />
      </DashboardNavIcon>
    )
  },
  {
    label: "Membros",
    href: "/dashboard/membros",
    icon: (
      <DashboardNavIcon>
        <path d="M16 19v-1.5A3.5 3.5 0 0 0 12.5 14h-5A3.5 3.5 0 0 0 4 17.5V19" />
        <path d="M10 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M20 19v-1.2A3 3 0 0 0 17.6 15" />
        <path d="M15.5 4.7a2.7 2.7 0 0 1 0 5.2" />
      </DashboardNavIcon>
    )
  },
  {
    label: "Visitantes",
    href: "/dashboard/visitantes",
    icon: (
      <DashboardNavIcon>
        <path d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M5 20a7 7 0 0 1 14 0" />
        <path d="M18.5 5.5v4" />
        <path d="M16.5 7.5h4" />
      </DashboardNavIcon>
    )
  },
  {
    label: "Células",
    href: "/dashboard/celulas",
    icon: (
      <DashboardNavIcon>
        <path d="M4 10.5 12 4l8 6.5" />
        <path d="M6.5 9.5V20h11V9.5" />
        <path d="M9 20v-5h6v5" />
        <path d="M9 11.5h6" />
      </DashboardNavIcon>
    )
  },
  {
    label: "Financeiro",
    href: "/dashboard/financeiro",
    icon: (
      <DashboardNavIcon>
        <path d="M4 7.5h16" />
        <path d="M6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9A2.5 2.5 0 0 1 6.5 5Z" />
        <path d="M7.5 12h4" />
        <path d="M7.5 15h2.5" />
        <path d="M15.5 12.5h1" />
      </DashboardNavIcon>
    )
  },
  {
    label: "Eventos",
    href: "/dashboard/eventos",
    icon: (
      <DashboardNavIcon>
        <path d="M7 4v3" />
        <path d="M17 4v3" />
        <path d="M5 8h14" />
        <path d="M6.5 6h11A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-9A2.5 2.5 0 0 1 6.5 6Z" />
        <path d="M8 12h2" />
        <path d="M14 12h2" />
        <path d="M8 16h2" />
      </DashboardNavIcon>
    )
  },
  {
    label: "Trilho",
    href: "/dashboard/trilho",
    icon: (
      <DashboardNavIcon>
        <path d="M5 19V5" />
        <path d="M5 5h9l-1.5 3L14 11H5" />
        <path d="M8 19h8" />
      </DashboardNavIcon>
    )
  },
  {
    label: "Voluntários",
    href: "/dashboard/voluntarios",
    icon: (
      <DashboardNavIcon>
        <path d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M5 20a7 7 0 0 1 14 0" />
        <path d="M19 5v4" />
        <path d="M17 7h4" />
      </DashboardNavIcon>
    )
  },
  {
    label: "Ministérios",
    href: "/dashboard/ministerios",
    icon: (
      <DashboardNavIcon>
        <path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M5 20a7 7 0 0 1 14 0" />
        <path d="M3 5h4M5 3v4M17 5h4M19 3v4" />
      </DashboardNavIcon>
    )
  },
  {
    label: "Assistente IA",
    href: "/dashboard/assistente",
    icon: (
      <DashboardNavIcon>
        <path d="M12 3.5 13.4 8a2 2 0 0 0 1.3 1.3l4.5 1.4-4.5 1.4a2 2 0 0 0-1.3 1.3L12 18l-1.4-4.6a2 2 0 0 0-1.3-1.3l-4.5-1.4 4.5-1.4A2 2 0 0 0 10.6 8L12 3.5Z" />
        <path d="M19 16v4" />
        <path d="M17 18h4" />
      </DashboardNavIcon>
    )
  }
];

export const moduleShortcuts = [
  { label: "Ministérios", href: "/dashboard/ministerios" },
  { label: "Membros", href: "/dashboard/membros" },
  { label: "Visitantes", href: "/dashboard/visitantes" },
  { label: "Células", href: "/dashboard/celulas" },
  { label: "Eventos", href: "/dashboard/eventos" },
  { label: "Financeiro", href: "/dashboard/financeiro" },
  { label: "Trilho", href: "/dashboard/trilho" },
  { label: "Voluntários", href: "/dashboard/voluntarios" }
];
