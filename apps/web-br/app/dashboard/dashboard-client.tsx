"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type LoginSession = {
  user: {
    email: string;
    role: string;
  };
  church: {
    name: string;
    plan: string;
    status: string;
    trialEndsAt: string | null;
  };
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

export function DashboardClient() {
  const router = useRouter();
  const [session, setSession] = useState<LoginSession | null>(null);

  useEffect(() => {
    const storedSession = localStorage.getItem("sistema-igrejas.session");

    if (!storedSession) {
      router.replace("/login");
      return;
    }

    setSession(JSON.parse(storedSession) as LoginSession);
  }, [router]);

  if (!session) {
    return null;
  }

  return (
    <main
      style={{
        margin: "0 auto",
        maxWidth: "960px",
        minHeight: "100vh",
        padding: "48px 24px"
      }}
    >
      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "24px",
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.08)",
          padding: "32px"
        }}
      >
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
          Painel
        </p>

        <h1
          style={{
            color: "#0f172a",
            fontSize: "32px",
            lineHeight: 1.1,
            margin: "0 0 20px"
          }}
        >
          {session.church.name}
        </h1>

        <div
          style={{
            color: "#475569",
            display: "grid",
            fontSize: "16px",
            gap: "8px"
          }}
        >
          <p style={{ margin: 0 }}>
            Status: <strong>{session.church.status}</strong>
          </p>

          <p style={{ margin: 0 }}>
            Plano: <strong>{session.church.plan}</strong>
          </p>

          <p style={{ margin: 0 }}>
            Trial termina em: <strong>{formatDate(session.church.trialEndsAt)}</strong>
          </p>

          <p style={{ margin: 0 }}>
            Usuário: <strong>{session.user.email}</strong>
          </p>
        </div>
      </section>
    </main>
  );
}
