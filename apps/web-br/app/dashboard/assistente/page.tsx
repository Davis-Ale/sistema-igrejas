"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { DashboardAuthGuard } from "../dashboard-auth-guard";

type LoginSession = {
  token: string;
};

type AssistantResponse = {
  answer: string;
  context: {
    membersCount: number;
    visitorsCount: number;
    cellsCount: number;
    eventsCount: number;
    volunteersCount: number;
  };
  safety: {
    canExecuteBusinessRules: boolean;
    canAccessExternalSystemsDirectly: boolean;
  };
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333";

function getSessionToken() {
  const storedSession = localStorage.getItem("sistema-igrejas.session");

  if (!storedSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(storedSession) as LoginSession;

    return parsedSession.token;
  } catch {
    localStorage.removeItem("sistema-igrejas.session");
    return null;
  }
}

export default function AssistentePage() {
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [context, setContext] = useState<AssistantResponse["context"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    setError(null);
    setAnswer(null);
    setContext(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/assistant/messages`, {
        body: JSON.stringify({
          message
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível consultar o assistente.");
        return;
      }

      const data = (await response.json()) as AssistantResponse;

      setAnswer(data.answer);
      setContext(data.context);
      setMessage("");
    } catch {
      setError("Não foi possível consultar o assistente agora.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DashboardAuthGuard>
      <main
        style={{
          background:
            "radial-gradient(circle at top left, rgba(59, 130, 246, 0.22), transparent 34%), linear-gradient(135deg, #0f172a 0%, #111827 45%, #020617 100%)",
          color: "#f8fafc",
          minHeight: "100vh",
          padding: "40px"
        }}
      >
        <section
          style={{
            background:
              "linear-gradient(135deg, rgba(15, 23, 42, 0.86), rgba(30, 41, 59, 0.74))",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            borderRadius: "28px",
            boxShadow: "0 28px 90px rgba(2, 6, 23, 0.36)",
            display: "grid",
            gap: "22px",
            margin: "0 auto",
            maxWidth: "1040px",
            padding: "28px"
          }}
        >
          <Link
            href="/dashboard"
            style={{
              color: "#93c5fd",
              display: "inline-flex",
              fontSize: "14px",
              fontWeight: 800,
              textDecoration: "none"
            }}
          >
            ← Voltar ao painel
          </Link>

          <div>
            <p
              style={{
                color: "#93c5fd",
                fontSize: "13px",
                fontWeight: 900,
                letterSpacing: "0.08em",
                margin: "0 0 10px",
                textTransform: "uppercase"
              }}
            >
              Assistente seguro
            </p>

            <h1
              style={{
                color: "#ffffff",
                fontSize: "32px",
                lineHeight: 1.1,
                margin: "0 0 10px"
              }}
            >
              Assistente IA
            </h1>

            <p
              style={{
                color: "#cbd5e1",
                fontSize: "16px",
                lineHeight: 1.7,
                margin: 0,
                maxWidth: "760px"
              }}
            >
              Consulte informações do sistema sem permitir que a IA execute regras de negócio ou acesse sistemas externos diretamente.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{
              background: "rgba(15, 23, 42, 0.72)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "22px",
              display: "grid",
              gap: "16px",
              padding: "22px"
            }}
          >
            <label
              style={{
                color: "#cbd5e1",
                display: "grid",
                fontSize: "14px",
                fontWeight: 800,
                gap: "8px"
              }}
            >
              Pergunta
              <textarea
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Ex.: Quantos membros temos? Como acompanho visitantes? Como vejo eventos?"
                required
                rows={5}
                style={{
                  border: "1px solid rgba(148, 163, 184, 0.38)",
                  borderRadius: "14px",
                  font: "inherit",
                  padding: "13px 14px",
                  resize: "vertical"
                }}
                value={message}
              />
            </label>

            <button
              disabled={isSubmitting}
              style={{
                background: "#2563eb",
                border: 0,
                borderRadius: "14px",
                color: "#ffffff",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                font: "inherit",
                fontWeight: 900,
                justifySelf: "start",
                opacity: isSubmitting ? 0.72 : 1,
                padding: "13px 18px"
              }}
              type="submit"
            >
              {isSubmitting ? "Consultando..." : "Consultar assistente"}
            </button>
          </form>

          {error ? (
            <p
              style={{
                background: "rgba(239, 68, 68, 0.14)",
                border: "1px solid rgba(248, 113, 113, 0.26)",
                borderRadius: "14px",
                color: "#fecaca",
                fontSize: "14px",
                margin: 0,
                padding: "12px 14px"
              }}
            >
              {error}
            </p>
          ) : null}

          {answer ? (
            <section
              style={{
                background: "rgba(15, 23, 42, 0.72)",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                borderRadius: "22px",
                display: "grid",
                gap: "14px",
                padding: "22px"
              }}
            >
              <h2 style={{ color: "#ffffff", fontSize: "20px", margin: 0 }}>
                Resposta
              </h2>

              <p
                style={{
                  color: "#e2e8f0",
                  fontSize: "15px",
                  lineHeight: 1.7,
                  margin: 0
                }}
              >
                {answer}
              </p>

              {context ? (
                <div
                  style={{
                    display: "grid",
                    gap: "10px",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))"
                  }}
                >
                  <strong style={{ color: "#bfdbfe" }}>Membros: {context.membersCount}</strong>
                  <strong style={{ color: "#bfdbfe" }}>Visitantes: {context.visitorsCount}</strong>
                  <strong style={{ color: "#bfdbfe" }}>Células: {context.cellsCount}</strong>
                  <strong style={{ color: "#bfdbfe" }}>Eventos: {context.eventsCount}</strong>
                  <strong style={{ color: "#bfdbfe" }}>Voluntários: {context.volunteersCount}</strong>
                </div>
              ) : null}
            </section>
          ) : null}

          <p
            style={{
              color: "#94a3b8",
              fontSize: "13px",
              lineHeight: 1.6,
              margin: 0
            }}
          >
            Segurança: o assistente responde com base nos dados da igreja, mas não altera banco, não executa ações administrativas e não acessa sistemas externos diretamente.
          </p>
        </section>
      </main>
    </DashboardAuthGuard>
  );
}
