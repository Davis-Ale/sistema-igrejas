"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { DashboardAuthGuard } from "../dashboard-auth-guard";

type LoginSession = {
  token: string;
};

type VisitorStatus = "NEW" | "CONTACTED" | "INTEGRATED" | "ARCHIVED";

type Visitor = {
  id: string;
  campusId: string | null;
  name: string;
  phone: string;
  email: string | null;
  status: VisitorStatus;
  firstVisitAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333";

const statusLabels: Record<VisitorStatus, string> = {
  NEW: "Novo",
  CONTACTED: "Contatado",
  INTEGRATED: "Integrado",
  ARCHIVED: "Arquivado"
};

function formatDate(value: string | null) {
  if (!value) {
    return "Não informada";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short"
  }).format(new Date(value));
}

export default function VisitantesPage() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<VisitorStatus>("NEW");
  const [firstVisitAt, setFirstVisitAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  async function loadVisitors() {
    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/visitors`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível carregar os visitantes.");
        return;
      }

      const data = (await response.json()) as Visitor[];

      setVisitors(data);
    } catch {
      setError("Não foi possível carregar os visitantes agora.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/visitors`, {
        body: JSON.stringify({
          email,
          firstVisitAt: firstVisitAt ? new Date(`${firstVisitAt}T00:00:00.000Z`).toISOString() : "",
          name,
          notes,
          phone,
          status
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível cadastrar o visitante.");
        return;
      }

      const createdVisitor = (await response.json()) as Visitor;

      setVisitors((currentVisitors) => [createdVisitor, ...currentVisitors]);
      setName("");
      setPhone("");
      setEmail("");
      setStatus("NEW");
      setFirstVisitAt("");
      setNotes("");
      setSuccessMessage("Visitante cadastrado com sucesso.");
    } catch {
      setError("Não foi possível cadastrar o visitante agora.");
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    void loadVisitors();
  }, []);

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
            gap: "28px",
            margin: "0 auto",
            maxWidth: "1120px",
            padding: "28px"
          }}
        >
          <div>
            <Link
              href="/dashboard"
              style={{
                color: "#93c5fd",
                display: "inline-flex",
                fontSize: "14px",
                fontWeight: 800,
                marginBottom: "22px",
                textDecoration: "none"
              }}
            >
              ← Voltar ao painel
            </Link>

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
              Visitantes
            </p>

            <h1
              style={{
                color: "#ffffff",
                fontSize: "30px",
                letterSpacing: "-0.04em",
                lineHeight: 1.12,
                margin: "0 0 12px"
              }}
            >
              Gestão de visitantes
            </h1>

            <p
              style={{
                color: "#cbd5e1",
                fontSize: "15px",
                lineHeight: 1.6,
                margin: 0,
                maxWidth: "760px"
              }}
            >
              Cadastre e acompanhe visitantes reais vinculados à igreja autenticada.
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
            <h2
              style={{
                color: "#ffffff",
                fontSize: "20px",
                margin: 0
              }}
            >
              Cadastrar visitante
            </h2>

            <div
              style={{
                display: "grid",
                gap: "14px",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
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
                Nome
                <input
                  onChange={(event) => setName(event.target.value)}
                  required
                  style={{
                    border: "1px solid rgba(148, 163, 184, 0.38)",
                    borderRadius: "14px",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="text"
                  value={name}
                />
              </label>

              <label
                style={{
                  color: "#cbd5e1",
                  display: "grid",
                  fontSize: "14px",
                  fontWeight: 800,
                  gap: "8px"
                }}
              >
                Telefone
                <input
                  onChange={(event) => setPhone(event.target.value)}
                  required
                  style={{
                    border: "1px solid rgba(148, 163, 184, 0.38)",
                    borderRadius: "14px",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="tel"
                  value={phone}
                />
              </label>

              <label
                style={{
                  color: "#cbd5e1",
                  display: "grid",
                  fontSize: "14px",
                  fontWeight: 800,
                  gap: "8px"
                }}
              >
                E-mail
                <input
                  onChange={(event) => setEmail(event.target.value)}
                  style={{
                    border: "1px solid rgba(148, 163, 184, 0.38)",
                    borderRadius: "14px",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="email"
                  value={email}
                />
              </label>

              <label
                style={{
                  color: "#cbd5e1",
                  display: "grid",
                  fontSize: "14px",
                  fontWeight: 800,
                  gap: "8px"
                }}
              >
                Status
                <select
                  onChange={(event) => setStatus(event.target.value as VisitorStatus)}
                  style={{
                    border: "1px solid rgba(148, 163, 184, 0.38)",
                    borderRadius: "14px",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  value={status}
                >
                  <option value="NEW">Novo</option>
                  <option value="CONTACTED">Contatado</option>
                  <option value="INTEGRATED">Integrado</option>
                  <option value="ARCHIVED">Arquivado</option>
                </select>
              </label>

              <label
                style={{
                  color: "#cbd5e1",
                  display: "grid",
                  fontSize: "14px",
                  fontWeight: 800,
                  gap: "8px"
                }}
              >
                Primeira visita
                <input
                  onChange={(event) => setFirstVisitAt(event.target.value)}
                  style={{
                    border: "1px solid rgba(148, 163, 184, 0.38)",
                    borderRadius: "14px",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="date"
                  value={firstVisitAt}
                />
              </label>
            </div>

            <label
              style={{
                color: "#cbd5e1",
                display: "grid",
                fontSize: "14px",
                fontWeight: 800,
                gap: "8px"
              }}
            >
              Observações
              <textarea
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                style={{
                  border: "1px solid rgba(148, 163, 184, 0.38)",
                  borderRadius: "14px",
                  font: "inherit",
                  padding: "13px 14px",
                  resize: "vertical"
                }}
                value={notes}
              />
            </label>

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

            {successMessage ? (
              <p
                style={{
                  background: "rgba(34, 197, 94, 0.14)",
                  border: "1px solid rgba(74, 222, 128, 0.26)",
                  borderRadius: "14px",
                  color: "#bbf7d0",
                  fontSize: "14px",
                  margin: 0,
                  padding: "12px 14px"
                }}
              >
                {successMessage}
              </p>
            ) : null}

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
              {isSubmitting ? "Cadastrando..." : "Cadastrar visitante"}
            </button>
          </form>

          <section
            style={{
              background: "rgba(15, 23, 42, 0.58)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: "22px",
              display: "grid",
              gap: "14px",
              padding: "22px"
            }}
          >
            <h2
              style={{
                color: "#ffffff",
                fontSize: "20px",
                margin: 0
              }}
            >
              Visitantes cadastrados
            </h2>

            {isLoading ? (
              <p style={{ color: "#cbd5e1", margin: 0 }}>Carregando visitantes...</p>
            ) : null}

            {!isLoading && visitors.length === 0 ? (
              <p style={{ color: "#cbd5e1", margin: 0 }}>
                Nenhum visitante cadastrado ainda.
              </p>
            ) : null}

            {!isLoading && visitors.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gap: "12px"
                }}
              >
                {visitors.map((visitor) => (
                  <article
                    key={visitor.id}
                    style={{
                      background: "rgba(15, 23, 42, 0.82)",
                      border: "1px solid rgba(148, 163, 184, 0.16)",
                      borderRadius: "18px",
                      display: "grid",
                      gap: "10px",
                      padding: "16px"
                    }}
                  >
                    <div
                      style={{
                        alignItems: "start",
                        display: "flex",
                        gap: "12px",
                        justifyContent: "space-between"
                      }}
                    >
                      <div>
                        <h3
                          style={{
                            color: "#ffffff",
                            fontSize: "17px",
                            margin: "0 0 6px"
                          }}
                        >
                          {visitor.name}
                        </h3>

                        <p
                          style={{
                            color: "#cbd5e1",
                            fontSize: "14px",
                            lineHeight: 1.5,
                            margin: 0
                          }}
                        >
                          {visitor.phone}
                          {visitor.email ? ` • ${visitor.email}` : ""}
                        </p>
                      </div>

                      <span
                        style={{
                          background: "rgba(37, 99, 235, 0.18)",
                          border: "1px solid rgba(96, 165, 250, 0.22)",
                          borderRadius: "999px",
                          color: "#bfdbfe",
                          fontSize: "12px",
                          fontWeight: 900,
                          padding: "6px 10px",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {statusLabels[visitor.status]}
                      </span>
                    </div>

                    <p
                      style={{
                        color: "#94a3b8",
                        fontSize: "13px",
                        margin: 0
                      }}
                    >
                      Primeira visita: {formatDate(visitor.firstVisitAt)}
                    </p>

                    {visitor.notes ? (
                      <p
                        style={{
                          color: "#cbd5e1",
                          fontSize: "14px",
                          lineHeight: 1.55,
                          margin: 0
                        }}
                      >
                        {visitor.notes}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        </section>
      </main>
    </DashboardAuthGuard>
  );
}
