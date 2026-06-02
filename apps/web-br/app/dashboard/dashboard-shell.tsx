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
        background: "#f8fafc",
        color: "#0f172a",
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
            background: "#ffffff",
            borderRight: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column",
            gap: "28px",
            padding: "28px 22px"
          }}
        >
          <div>
            <p
              style={{
                color: "#2563eb",
                fontSize: "13px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                margin: "0 0 10px",
                textTransform: "uppercase"
              }}
            >
              Sistema Igrejas
            </p>

            <h1
              style={{
                color: "#0f172a",
                fontSize: "22px",
                lineHeight: 1.15,
                margin: 0
              }}
            >
              {session.church.name}
            </h1>
          </div>

          <nav
            aria-label="Navegação principal"
            style={{
              display: "grid",
              gap: "8px"
            }}
          >
            {["Painel", "Membros", "Visitantes", "Células", "Eventos", "IA geral"].map((item) => (
              <div
                key={item}
                style={{
                  alignItems: "center",
                  background: item === "Painel" ? "#eff6ff" : "transparent",
                  borderRadius: "14px",
                  color: item === "Painel" ? "#1d4ed8" : "#475569",
                  display: "flex",
                  fontSize: "15px",
                  fontWeight: 700,
                  justifyContent: "space-between",
                  padding: "12px 14px"
                }}
              >
                <span>{item}</span>
              </div>
            ))}
          </nav>
        </aside>

        <section
          style={{
            display: "grid",
            gap: "28px",
            padding: "28px"
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
                  color: "#64748b",
                  fontSize: "14px",
                  margin: "0 0 6px"
                }}
              >
                Painel da igreja
              </p>

              <h2
                style={{
                  color: "#0f172a",
                  fontSize: "30px",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.1,
                  margin: 0
                }}
              >
                Visão geral
              </h2>
            </div>

            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "999px",
                color: "#475569",
                fontSize: "14px",
                fontWeight: 700,
                padding: "10px 14px"
              }}
            >
              {session.user.email}
            </div>
          </header>

          <section
            style={{
              display: "grid",
              gap: "16px",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))"
            }}
          >
            <article
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "22px",
                padding: "22px"
              }}
            >
              <p
                style={{
                  color: "#64748b",
                  fontSize: "14px",
                  fontWeight: 700,
                  margin: "0 0 10px"
                }}
              >
                Acesso
              </p>

              <strong
                style={{
                  color: "#0f172a",
                  display: "block",
                  fontSize: "20px"
                }}
              >
                Período de teste ativo
              </strong>
            </article>

            <article
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "22px",
                padding: "22px"
              }}
            >
              <p
                style={{
                  color: "#64748b",
                  fontSize: "14px",
                  fontWeight: 700,
                  margin: "0 0 10px"
                }}
              >
                Disponível até
              </p>

              <strong
                style={{
                  color: "#0f172a",
                  display: "block",
                  fontSize: "20px"
                }}
              >
                {formatDate(session.church.trialEndsAt)}
              </strong>
            </article>

            <article
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "22px",
                padding: "22px"
              }}
            >
              <p
                style={{
                  color: "#64748b",
                  fontSize: "14px",
                  fontWeight: 700,
                  margin: "0 0 10px"
                }}
              >
                IA geral
              </p>

              <strong
                style={{
                  color: "#0f172a",
                  display: "block",
                  fontSize: "20px"
                }}
              >
                Recurso planejado
              </strong>
            </article>
          </section>

          <section
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "28px",
              boxShadow: "0 24px 80px rgba(15, 23, 42, 0.06)",
              padding: "28px"
            }}
          >
            <p
              style={{
                color: "#2563eb",
                fontSize: "13px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                margin: "0 0 12px",
                textTransform: "uppercase"
              }}
            >
              Início
            </p>

            <h3
              style={{
                color: "#0f172a",
                fontSize: "26px",
                letterSpacing: "-0.03em",
                lineHeight: 1.15,
                margin: "0 0 12px"
              }}
            >
              Painel pronto para receber os módulos reais.
            </h3>

            <p
              style={{
                color: "#64748b",
                fontSize: "16px",
                lineHeight: 1.6,
                margin: 0,
                maxWidth: "680px"
              }}
            >
              A partir daqui, as próximas telas serão conectadas ao fluxo real do sistema,
              seguindo a ordem aprovada.
            </p>
          </section>
        </section>
      </div>
    </main>
  );
}
