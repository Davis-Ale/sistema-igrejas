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

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3333";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/auth/login`,
        {
          body: JSON.stringify({
            email,
            password
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      if (!response.ok) {
        const data =
          (await response.json()) as ApiErrorResponse;

        setError(
          data.message ??
            "Não foi possível entrar no sistema."
        );
        return;
      }

      const loginSession =
        (await response.json()) as LoginSession;

      localStorage.setItem(
        "sistema-igrejas.session",
        JSON.stringify(loginSession)
      );

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError(
        "Não foi possível entrar no sistema agora."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background:
          "linear-gradient(135deg, rgba(15, 23, 42, 0.94), rgba(30, 41, 59, 0.88))",
        border: "1px solid rgba(148, 163, 184, 0.2)",
        borderRadius: "28px",
        boxShadow: "0 32px 100px rgba(2, 6, 23, 0.5)",
        display: "grid",
        gap: "20px",
        padding: "32px"
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

        <h1
          style={{
            color: "#ffffff",
            fontSize: "32px",
            letterSpacing: "-0.04em",
            lineHeight: 1.1,
            margin: 0
          }}
        >
          Entrar
        </h1>
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
        E-mail
        <input
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          style={{
            background: "#ffffff",
            border: "1px solid rgba(148, 163, 184, 0.38)",
            borderRadius: "14px",
            color: "#0f172a",
            font: "inherit",
            padding: "14px 16px"
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
        Senha
        <input
          autoComplete="current-password"
          minLength={8}
          onChange={(event) =>
            setPassword(event.target.value)
          }
          required
          style={{
            background: "#ffffff",
            border: "1px solid rgba(148, 163, 184, 0.38)",
            borderRadius: "14px",
            color: "#0f172a",
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
            background: "rgba(239, 68, 68, 0.14)",
            border: "1px solid rgba(248, 113, 113, 0.28)",
            borderRadius: "14px",
            color: "#fecaca",
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
          background: isSubmitting
            ? "#475569"
            : "linear-gradient(135deg, #2563eb, #0ea5e9)",
          border: 0,
          borderRadius: "14px",
          color: "#ffffff",
          cursor: isSubmitting
            ? "not-allowed"
            : "pointer",
          font: "inherit",
          fontWeight: 900,
          padding: "14px 22px"
        }}
        type="submit"
      >
        {isSubmitting ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
