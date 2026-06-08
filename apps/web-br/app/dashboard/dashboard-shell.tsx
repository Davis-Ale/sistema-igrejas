import Link from "next/link";
import { DashboardSession } from "./dashboard-types";

type DashboardShellProps = {
  session: DashboardSession;
};

function formatDate(value: string | null): string {
  if (!value) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

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
            {["Painel", "Membros", "Visitantes", "Células", "Eventos", "Assistente IA"].map(
              (item) => (
                <Link
                  href={item === "Membros" ? "/dashboard/membros" : item === "Visitantes" ? "/dashboard/visitantes" : item === "Células" ? "/dashboard/celulas" : item === "Eventos" ? "/dashboard/eventos" : "/dashboard"}
                  key={item}
                  style={{
                    textDecoration: "none",
                    alignItems: "center",
                    background:
                      item === "Painel"
                        ? "linear-gradient(135deg, rgba(37, 99, 235, 0.95), rgba(14, 165, 233, 0.76))"
                        : "rgba(15, 23, 42, 0.24)",
                    border:
                      item === "Painel"
                        ? "1px solid rgba(147, 197, 253, 0.34)"
                        : "1px solid transparent",
                    borderRadius: "16px",
                    color: item === "Painel" ? "#ffffff" : "#cbd5e1",
                    display: "flex",
                    fontSize: "15px",
                    fontWeight: 800,
                    justifyContent: "space-between",
                    padding: "13px 14px"
                  }}
                >
                  <span>{item}</span>
                </Link>
              )
            )}
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
            <article
              style={{
                background:
                  "linear-gradient(135deg, rgba(34, 197, 94, 0.22), rgba(15, 23, 42, 0.92))",
                border: "1px solid rgba(74, 222, 128, 0.22)",
                borderRadius: "24px",
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.34)",
                minHeight: "150px",
                padding: "24px"
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
                Área administrativa
              </strong>
            </article>

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
                  letterSpacing: "-0.03em"
                }}
              >
                Navegação disponível
              </strong>
            </article>

            <article
              style={{
                background:
                  "linear-gradient(135deg, rgba(168, 85, 247, 0.28), rgba(15, 23, 42, 0.92))",
                border: "1px solid rgba(196, 181, 253, 0.22)",
                borderRadius: "24px",
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.34)",
                minHeight: "150px",
                padding: "24px"
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
            </article>
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
              Escolha uma opção no menu para começar.
            </p>
          </section>
        </section>
      </div>
    </main>
  );
}
