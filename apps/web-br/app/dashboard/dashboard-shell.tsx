import Link from "next/link";
import { ReactNode } from "react";
import { DashboardSession } from "./dashboard-types";

type DashboardShellProps = {
  session: DashboardSession;
};

type IconProps = {
  children: ReactNode;
};

function NavIcon({ children }: IconProps) {
  return (
    <span
      aria-hidden="true"
      style={{
        alignItems: "center",
        background: "rgba(15, 23, 42, 0.34)",
        border: "1px solid rgba(148, 163, 184, 0.16)",
        borderRadius: "12px",
        display: "inline-flex",
        height: "30px",
        justifyContent: "center",
        width: "30px"
      }}
    >
      <svg
        fill="none"
        height="17"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
        width="17"
      >
        {children}
      </svg>
    </span>
  );
}

const navigationItems = [
  {
    label: "Painel",
    href: "/dashboard",
    icon: (
      <NavIcon>
        <path d="M4 11.5 12 5l8 6.5" />
        <path d="M6.5 10.5V19h11v-8.5" />
        <path d="M10 19v-5h4v5" />
      </NavIcon>
    )
  },
  {
    label: "Membros",
    href: "/dashboard/membros",
    icon: (
      <NavIcon>
        <path d="M16 19v-1.5A3.5 3.5 0 0 0 12.5 14h-5A3.5 3.5 0 0 0 4 17.5V19" />
        <path d="M10 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M20 19v-1.2A3 3 0 0 0 17.6 15" />
        <path d="M15.5 4.7a2.7 2.7 0 0 1 0 5.2" />
      </NavIcon>
    )
  },
  {
    label: "Visitantes",
    href: "/dashboard/visitantes",
    icon: (
      <NavIcon>
        <path d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M5 20a7 7 0 0 1 14 0" />
        <path d="M18.5 5.5v4" />
        <path d="M16.5 7.5h4" />
      </NavIcon>
    )
  },
  {
    label: "Células",
    href: "/dashboard/celulas",
    icon: (
      <NavIcon>
        <path d="M4 10.5 12 4l8 6.5" />
        <path d="M6.5 9.5V20h11V9.5" />
        <path d="M9 20v-5h6v5" />
        <path d="M9 11.5h6" />
      </NavIcon>
    )
  },
  {
    label: "Financeiro",
    href: "/dashboard/financeiro",
    icon: (
      <NavIcon>
        <path d="M4 7.5h16" />
        <path d="M6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9A2.5 2.5 0 0 1 6.5 5Z" />
        <path d="M7.5 12h4" />
        <path d="M7.5 15h2.5" />
        <path d="M15.5 12.5h1" />
      </NavIcon>
    )
  },
  {
    label: "Eventos",
    href: "/dashboard/eventos",
    icon: (
      <NavIcon>
        <path d="M7 4v3" />
        <path d="M17 4v3" />
        <path d="M5 8h14" />
        <path d="M6.5 6h11A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-9A2.5 2.5 0 0 1 6.5 6Z" />
        <path d="M8 12h2" />
        <path d="M14 12h2" />
        <path d="M8 16h2" />
      </NavIcon>
    )
  },
  {
    label: "Trilho",
    href: "/dashboard/trilho",
    icon: (
      <NavIcon>
        <path d="M5 19V5" />
        <path d="M5 5h9l-1.5 3L14 11H5" />
        <path d="M8 19h8" />
      </NavIcon>
    )
  },
  {
    label: "Voluntários",
    href: "/dashboard/voluntarios",
    icon: (
      <NavIcon>
        <path d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M5 20a7 7 0 0 1 14 0" />
        <path d="M19 5v4" />
        <path d="M17 7h4" />
      </NavIcon>
    )
  },
  {
    label: "Assistente IA",
    href: "/dashboard/assistente",
    icon: (
      <NavIcon>
        <path d="M12 3.5 13.4 8a2 2 0 0 0 1.3 1.3l4.5 1.4-4.5 1.4a2 2 0 0 0-1.3 1.3L12 18l-1.4-4.6a2 2 0 0 0-1.3-1.3l-4.5-1.4 4.5-1.4A2 2 0 0 0 10.6 8L12 3.5Z" />
        <path d="M19 16v4" />
        <path d="M17 18h4" />
      </NavIcon>
    )
  }
];

const moduleShortcuts = [
  { label: "Membros", href: "/dashboard/membros" },
  { label: "Visitantes", href: "/dashboard/visitantes" },
  { label: "Células", href: "/dashboard/celulas" },
  { label: "Eventos", href: "/dashboard/eventos" },
  { label: "Financeiro", href: "/dashboard/financeiro" },
  { label: "Trilho", href: "/dashboard/trilho" },
  { label: "Voluntários", href: "/dashboard/voluntarios" }
];

export function DashboardShell({ session }: DashboardShellProps) {
  return (
    <main
      style={{
        background:
          "radial-gradient(circle at top left, rgba(59, 130, 246, 0.22), transparent 34%), linear-gradient(135deg, #0f172a 0%, #111827 45%, #020617 100%)",
        color: "#f8fafc",
        minHeight: "100vh"
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          minHeight: "100vh"
        }}
      >
        <aside
          style={{
            background: "rgba(15, 23, 42, 0.72)",
            borderRight: "1px solid rgba(148, 163, 184, 0.18)",
            display: "flex",
            flexDirection: "column",
            gap: "32px",
            padding: "28px 22px"
          }}
        >
          <div>
            <p
              style={{
                color: "#60a5fa",
                fontSize: "13px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                margin: "0 0 12px",
                textTransform: "uppercase"
              }}
            >
              Sistema Igrejas
            </p>
          </div>

          <nav
            aria-label="Navegação principal"
            style={{
              display: "grid",
              gap: "10px"
            }}
          >
            {navigationItems.map((item) => (
              <Link
                href={item.href}
                key={item.href}
                style={{
                  alignItems: "center",
                  background:
                    item.href === "/dashboard"
                      ? "linear-gradient(135deg, rgba(37, 99, 235, 0.95), rgba(14, 165, 233, 0.76))"
                      : "rgba(15, 23, 42, 0.24)",
                  border:
                    item.href === "/dashboard"
                      ? "1px solid rgba(147, 197, 253, 0.34)"
                      : "1px solid transparent",
                  borderRadius: "16px",
                  color: item.href === "/dashboard" ? "#ffffff" : "#cbd5e1",
                  display: "flex",
                  fontSize: "15px",
                  fontWeight: 800,
                  gap: "12px",
                  padding: "13px 14px",
                  textDecoration: "none"
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </aside>

        <section
          style={{
            display: "grid",
            gap: "30px",
            padding: "32px"
          }}
        >
          <header
            style={{
              alignItems: "center",
              display: "flex",
              justifyContent: "space-between"
            }}
          >
            <div>
              <p
                style={{
                  color: "#94a3b8",
                  fontSize: "14px",
                  margin: "0 0 8px"
                }}
              >
                Igreja logada
              </p>

              <h2
                style={{
                  color: "#f8fafc",
                  fontSize: "34px",
                  letterSpacing: "-0.04em",
                  lineHeight: 1.05,
                  margin: 0
                }}
              >
                {session.church.name}
              </h2>
            </div>

            <div
              style={{
                background: "rgba(15, 23, 42, 0.68)",
                border: "1px solid rgba(148, 163, 184, 0.22)",
                borderRadius: "999px",
                color: "#e2e8f0",
                fontSize: "14px",
                fontWeight: 800,
                padding: "12px 16px"
              }}
            >
              {session.user.email}
            </div>
          </header>

          <section
            style={{
              display: "grid",
              gap: "18px",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))"
            }}
          >
            <Link
              href="/dashboard"
              style={{
                background:
                  "linear-gradient(135deg, rgba(34, 197, 94, 0.22), rgba(15, 23, 42, 0.92))",
                border: "1px solid rgba(74, 222, 128, 0.22)",
                borderRadius: "24px",
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.34)",
                minHeight: "150px",
                padding: "24px",
                textDecoration: "none"
              }}
            >
              <p
                style={{
                  color: "#bbf7d0",
                  fontSize: "14px",
                  fontWeight: 800,
                  margin: "0 0 12px"
                }}
              >
                Sistema
              </p>

              <strong
                style={{
                  color: "#ffffff",
                  display: "block",
                  fontSize: "22px",
                  letterSpacing: "-0.03em"
                }}
              >
                Painel
              </strong>

              <span
                style={{
                  color: "#bbf7d0",
                  display: "inline-block",
                  fontSize: "13px",
                  fontWeight: 800,
                  marginTop: "28px"
                }}
              >
                Abrir →
              </span>
            </Link>

            <article
              style={{
                background:
                  "linear-gradient(135deg, rgba(59, 130, 246, 0.28), rgba(15, 23, 42, 0.92))",
                border: "1px solid rgba(96, 165, 250, 0.22)",
                borderRadius: "24px",
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.34)",
                minHeight: "150px",
                padding: "24px"
              }}
            >
              <p
                style={{
                  color: "#bfdbfe",
                  fontSize: "14px",
                  fontWeight: 800,
                  margin: "0 0 12px"
                }}
              >
                Módulos
              </p>

              <strong
                style={{
                  color: "#ffffff",
                  display: "block",
                  fontSize: "22px",
                  letterSpacing: "-0.03em",
                  marginBottom: "18px"
                }}
              >
                Navegação disponível
              </strong>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px"
                }}
              >
                {moduleShortcuts.map((module) => (
                  <Link
                    href={module.href}
                    key={module.href}
                    style={{
                      background: "rgba(15, 23, 42, 0.46)",
                      border: "1px solid rgba(147, 197, 253, 0.2)",
                      borderRadius: "999px",
                      color: "#dbeafe",
                      fontSize: "13px",
                      fontWeight: 800,
                      padding: "8px 10px",
                      textDecoration: "none"
                    }}
                  >
                    {module.label}
                  </Link>
                ))}
              </div>
            </article>

            <Link
              href="/dashboard/assistente"
              style={{
                background:
                  "linear-gradient(135deg, rgba(168, 85, 247, 0.28), rgba(15, 23, 42, 0.92))",
                border: "1px solid rgba(196, 181, 253, 0.22)",
                borderRadius: "24px",
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.34)",
                minHeight: "150px",
                padding: "24px",
                textDecoration: "none"
              }}
            >
              <p
                style={{
                  color: "#ddd6fe",
                  fontSize: "14px",
                  fontWeight: 800,
                  margin: "0 0 12px"
                }}
              >
                Assistente IA
              </p>

              <strong
                style={{
                  color: "#ffffff",
                  display: "block",
                  fontSize: "22px",
                  letterSpacing: "-0.03em"
                }}
              >
                Recurso planejado
              </strong>

              <span
                style={{
                  color: "#ddd6fe",
                  display: "inline-block",
                  fontSize: "13px",
                  fontWeight: 800,
                  marginTop: "28px"
                }}
              >
                Abrir assistente →
              </span>
            </Link>
          </section>

          <section
            style={{
              background:
                "linear-gradient(135deg, rgba(15, 23, 42, 0.86), rgba(30, 41, 59, 0.74))",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: "30px",
              boxShadow: "0 28px 90px rgba(2, 6, 23, 0.36)",
              padding: "22px"
            }}
          >
            <p
              style={{
                color: "#60a5fa",
                fontSize: "13px",
                fontWeight: 900,
                letterSpacing: "0.08em",
                margin: "0 0 14px",
                textTransform: "uppercase"
              }}
            >
              Início
            </p>

            <h3
              style={{
                color: "#ffffff",
                fontSize: "24px",
                letterSpacing: "-0.04em",
                lineHeight: 1.12,
                margin: "0 0 14px"
              }}
            >
              Bem-vindo ao painel.
            </h3>

            <p
              style={{
                color: "#cbd5e1",
                fontSize: "15px",
                lineHeight: 1.5,
                margin: 0,
                maxWidth: "720px"
              }}
            >
              Escolha uma opção no menu ou nos atalhos acima para começar.
            </p>
          </section>
        </section>
      </div>
    </main>
  );
}
