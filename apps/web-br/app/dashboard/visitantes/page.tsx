"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DashboardAuthGuard } from "../dashboard-auth-guard";

type Visitor = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  volunteerStatus: string;
  campusId: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredSession = {
  token?: string;
  accessToken?: string;
  jwt?: string;
};

function getApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3333/api";
}

function getAuthToken() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = window.localStorage.getItem("sistema-igrejas.session");

  if (!rawSession) {
    return null;
  }

  try {
    const session = JSON.parse(rawSession) as StoredSession;

    return session.token ?? session.accessToken ?? session.jwt ?? null;
  } catch {
    return null;
  }
}

export default function VisitantesPage() {
  const apiUrl = useMemo(() => getApiUrl(), []);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadVisitors = useCallback(async () => {
    const token = getAuthToken();

    if (!token) {
      setFeedback("Sessão sem token de acesso. Faça login novamente.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${apiUrl}/visitors`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error("VISITORS_LOAD_FAILED");
      }

      const data = (await response.json()) as Visitor[];

      setVisitors(data);
      setFeedback("");
    } catch {
      setFeedback("Não foi possível carregar os visitantes.");
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void loadVisitors();
  }, [loadVisitors]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getAuthToken();

    if (!token) {
      setFeedback("Sessão sem token de acesso. Faça login novamente.");
      return;
    }

    setIsSaving(true);
    setFeedback("");

    try {
      const response = await fetch(`${apiUrl}/visitors`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name,
          phone,
          email
        })
      });

      if (!response.ok) {
        throw new Error("VISITOR_CREATE_FAILED");
      }

      setName("");
      setPhone("");
      setEmail("");
      setFeedback("Visitante cadastrado com sucesso.");
      await loadVisitors();
    } catch {
      setFeedback("Não foi possível cadastrar o visitante.");
    } finally {
      setIsSaving(false);
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
              margin: "0 0 28px",
              maxWidth: "720px"
            }}
          >
            Cadastre e acompanhe visitantes reais conectados à API.
          </p>

          <form
            onSubmit={handleSubmit}
            style={{
              display: "grid",
              gap: "14px",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              marginBottom: "24px"
            }}
          >
            <label style={{ display: "grid", gap: "8px" }}>
              <span style={{ color: "#cbd5e1", fontSize: "13px", fontWeight: 800 }}>Nome</span>
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                style={{
                  background: "rgba(15, 23, 42, 0.9)",
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                  borderRadius: "14px",
                  color: "#ffffff",
                  padding: "12px"
                }}
              />
            </label>

            <label style={{ display: "grid", gap: "8px" }}>
              <span style={{ color: "#cbd5e1", fontSize: "13px", fontWeight: 800 }}>Telefone</span>
              <input
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                style={{
                  background: "rgba(15, 23, 42, 0.9)",
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                  borderRadius: "14px",
                  color: "#ffffff",
                  padding: "12px"
                }}
              />
            </label>

            <label style={{ display: "grid", gap: "8px" }}>
              <span style={{ color: "#cbd5e1", fontSize: "13px", fontWeight: 800 }}>
                Email opcional
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                style={{
                  background: "rgba(15, 23, 42, 0.9)",
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                  borderRadius: "14px",
                  color: "#ffffff",
                  padding: "12px"
                }}
              />
            </label>

            <button
              disabled={isSaving}
              style={{
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                border: 0,
                borderRadius: "14px",
                color: "#ffffff",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 900,
                gridColumn: "1 / -1",
                padding: "13px 18px"
              }}
              type="submit"
            >
              {isSaving ? "Cadastrando..." : "Cadastrar visitante"}
            </button>
          </form>

          {feedback ? (
            <p
              style={{
                background: "rgba(30, 41, 59, 0.72)",
                border: "1px solid rgba(148, 163, 184, 0.16)",
                borderRadius: "14px",
                color: "#dbeafe",
                margin: "0 0 18px",
                padding: "12px 14px"
              }}
            >
              {feedback}
            </p>
          ) : null}

          <section style={{ display: "grid", gap: "12px" }}>
            {isLoading ? (
              <p style={{ color: "#cbd5e1", margin: 0 }}>Carregando visitantes...</p>
            ) : visitors.length === 0 ? (
              <p style={{ color: "#cbd5e1", margin: 0 }}>Nenhum visitante cadastrado ainda.</p>
            ) : (
              visitors.map((visitor) => (
                <article
                  key={visitor.id}
                  style={{
                    background: "rgba(15, 23, 42, 0.72)",
                    border: "1px solid rgba(148, 163, 184, 0.16)",
                    borderRadius: "18px",
                    padding: "16px"
                  }}
                >
                  <strong style={{ color: "#ffffff", display: "block", marginBottom: "6px" }}>
                    {visitor.name}
                  </strong>
                  <span style={{ color: "#cbd5e1", display: "block", fontSize: "14px" }}>
                    {visitor.phone}
                  </span>
                  <span style={{ color: "#94a3b8", display: "block", fontSize: "13px" }}>
                    {visitor.email ?? "Sem email"}
                  </span>
                </article>
              ))
            )}
          </section>
        </section>
      </main>
    </DashboardAuthGuard>
  );
}
