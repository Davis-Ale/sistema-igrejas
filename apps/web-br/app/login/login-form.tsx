"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type LoginSession = {
  token: string;
  user: {
    id: string;
    email: string;
    role: string;
    status: string;
    person: {
      id: string;
      name: string;
      email: string | null;
      campusId: string | null;
    } | null;
  };
  church: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    blockedAt: string | null;
    blockReason: string | null;
  };
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333";

function formatDate(value: string | null): string {
  if (!value) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("pastor@sistemaigrejas.local");
  const [password, setPassword] = useState("12345678");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<LoginSession | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setSession(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        body: JSON.stringify({
          email,
          password
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível entrar no sistema.");
        return;
      }

      const loginSession = (await response.json()) as LoginSession;

      localStorage.setItem("sistema-igrejas.session", JSON.stringify(loginSession));
      setSession(loginSession);
      router.push("/dashboard");
    } catch {
      setError("Não foi possível entrar no sistema agora. Tente novamente em alguns instantes.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gap: "24px"
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "24px",
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.08)",
          display: "grid",
          gap: "18px",
          padding: "32px"
        }}
      >
        <div>
          <p
            style={{
              color: "#2563eb",
              fontSize: "13px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              margin: "0 0 12px",
              textTransform: "uppercase"
            }}
          >
            Acesso da igreja
          </p>

          <h1
            style={{
              color: "#0f172a",
              fontSize: "32px",
              lineHeight: 1.1,
              margin: "0 0 10px"
            }}
          >
            Entrar no Sistema Igrejas
          </h1>

        </div>

        <label
          style={{
            color: "#334155",
            display: "grid",
            fontSize: "14px",
            fontWeight: 700,
            gap: "8px"
          }}
        >
          E-mail
          <input
            onChange={(event) => setEmail(event.target.value)}
            required
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: "14px",
              font: "inherit",
              padding: "14px 16px"
            }}
            type="email"
            value={email}
          />
        </label>

        <label
          style={{
            color: "#334155",
            display: "grid",
            fontSize: "14px",
            fontWeight: 700,
            gap: "8px"
          }}
        >
          Senha
          <input
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: "14px",
              font: "inherit",
              padding: "14px 16px"
            }}
            type="password"
            value={password}
          />
        </label>

        {error ? (
          <p
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "14px",
              color: "#991b1b",
              margin: 0,
              padding: "12px 14px"
            }}
          >
            {error}
          </p>
        ) : null}

        <button
          disabled={isSubmitting}
          style={{
            background: isSubmitting ? "#94a3b8" : "#2563eb",
            border: 0,
            borderRadius: "999px",
            color: "#ffffff",
            cursor: isSubmitting ? "not-allowed" : "pointer",
            font: "inherit",
            fontWeight: 700,
            padding: "14px 22px"
          }}
          type="submit"
        >
          {isSubmitting ? "Entrando..." : "Entrar"}
        </button>
      </form>

      {session ? (
        <section
          style={{
            background: "#f8fafc",
            border: "1px solid #cbd5e1",
            borderRadius: "20px",
            padding: "24px"
          }}
        >
          <h2
            style={{
              color: "#0f172a",
              fontSize: "22px",
              margin: "0 0 12px"
            }}
          >
            Login realizado
          </h2>

          <p style={{ color: "#475569", margin: "0 0 8px" }}>
            Igreja: <strong>{session.church.name}</strong>
          </p>

          <p style={{ color: "#475569", margin: "0 0 8px" }}>
            Status: <strong>{session.church.status}</strong>
          </p>

          <p style={{ color: "#475569", margin: "0 0 8px" }}>
            Trial termina em: <strong>{formatDate(session.church.trialEndsAt)}</strong>
          </p>

          <p style={{ color: "#475569", margin: 0 }}>
            Usuário: <strong>{session.user.email}</strong>
          </p>
        </section>
      ) : null}
    </div>
  );
}
