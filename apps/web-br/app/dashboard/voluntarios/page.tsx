"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { DashboardAuthGuard } from "../dashboard-auth-guard";

type LoginSession = {
  token: string;
};

type VolunteerStatus = "IN_FORMATION" | "ELIGIBLE" | "ACTIVE" | "SUSPENDED";

type Volunteer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  volunteerStatus: VolunteerStatus | null;
  celula: {
    id: string;
    name: string;
    region: string | null;
  } | null;
  trailStage: {
    id: string;
    label: string;
    trail: {
      id: string;
      name: string;
      isVolunteerGate: boolean;
    };
  } | null;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333";

const volunteerStatusLabels: Record<VolunteerStatus, string> = {
  IN_FORMATION: "Em formação",
  ELIGIBLE: "Elegível",
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso"
};

export default function VoluntariosPage() {
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [status, setStatus] = useState<VolunteerStatus>("IN_FORMATION");
  const [reason, setReason] = useState("");
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

  async function loadVolunteers() {
    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/volunteers`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível carregar os voluntários.");
        return;
      }

      const data = (await response.json()) as Volunteer[];

      setVolunteers(data);
      setSelectedPersonId((currentPersonId) => currentPersonId || data[0]?.id || "");
    } catch {
      setError("Não foi possível carregar os voluntários agora.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpdateStatus(event: FormEvent<HTMLFormElement>) {
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
      const response = await fetch(`${API_BASE_URL}/api/volunteers/status`, {
        body: JSON.stringify({
          personId: selectedPersonId,
          reason: reason || undefined,
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

        setError(data.message ?? "Não foi possível atualizar o voluntário.");
        return;
      }

      setReason("");
      setSuccessMessage("Status atualizado com sucesso.");
      await loadVolunteers();
    } catch {
      setError("Não foi possível atualizar o voluntário agora.");
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    void loadVolunteers();
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
            Voltar ao painel
          </Link>

          <form
            onSubmit={handleUpdateStatus}
            style={{
              background: "rgba(15, 23, 42, 0.72)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "22px",
              display: "grid",
              gap: "16px",
              padding: "22px"
            }}
          >
            <h2 style={{ color: "#ffffff", fontSize: "20px", margin: 0 }}>
              Atualizar voluntário
            </h2>

            <div
              style={{
                display: "grid",
                gap: "14px",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))"
              }}
            >
              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Voluntário
                <select
                  onChange={(event) => setSelectedPersonId(event.target.value)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  value={selectedPersonId}
                >
                  <option value="">Selecione</option>
                  {volunteers.map((volunteer) => (
                    <option key={volunteer.id} value={volunteer.id}>
                      {volunteer.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Status
                <select
                  onChange={(event) => setStatus(event.target.value as VolunteerStatus)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  value={status}
                >
                  <option value="IN_FORMATION">Em formação</option>
                  <option value="ELIGIBLE">Elegível</option>
                  <option value="ACTIVE">Ativo</option>
                  <option value="SUSPENDED">Suspenso</option>
                </select>
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Motivo
                <input
                  onChange={(event) => setReason(event.target.value)}
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  type="text"
                  value={reason}
                />
              </label>
            </div>

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
              {isSubmitting ? "Salvando..." : "Atualizar status"}
            </button>
          </form>

          {error ? (
            <p style={{ background: "rgba(239, 68, 68, 0.14)", border: "1px solid rgba(248, 113, 113, 0.26)", borderRadius: "14px", color: "#fecaca", fontSize: "14px", margin: 0, padding: "12px 14px" }}>
              {error}
            </p>
          ) : null}

          {successMessage ? (
            <p style={{ background: "rgba(34, 197, 94, 0.14)", border: "1px solid rgba(74, 222, 128, 0.26)", borderRadius: "14px", color: "#bbf7d0", fontSize: "14px", margin: 0, padding: "12px 14px" }}>
              {successMessage}
            </p>
          ) : null}

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
            <h2 style={{ color: "#ffffff", fontSize: "20px", margin: 0 }}>
              Voluntários
            </h2>

            {isLoading ? (
              <p style={{ color: "#cbd5e1", margin: 0 }}>Carregando voluntários...</p>
            ) : null}

            {!isLoading && volunteers.length === 0 ? (
              <p style={{ color: "#cbd5e1", margin: 0 }}>
                Nenhum voluntário encontrado.
              </p>
            ) : null}

            {!isLoading && volunteers.length > 0 ? (
              <div style={{ display: "grid", gap: "10px" }}>
                {volunteers.map((volunteer) => (
                  <article
                    key={volunteer.id}
                    style={{
                      background: "rgba(15, 23, 42, 0.82)",
                      border: "1px solid rgba(148, 163, 184, 0.16)",
                      borderRadius: "18px",
                      display: "grid",
                      gap: "8px",
                      padding: "14px"
                    }}
                  >
                    <h3 style={{ color: "#ffffff", fontSize: "16px", margin: 0 }}>
                      {volunteer.name}
                    </h3>

                    <p style={{ color: "#cbd5e1", fontSize: "14px", margin: 0 }}>
                      {volunteer.phone}
                      {volunteer.email ? ` - ${volunteer.email}` : ""}
                    </p>

                    <p style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.5, margin: 0 }}>
                      Status: {volunteer.volunteerStatus ? volunteerStatusLabels[volunteer.volunteerStatus] : "Não definido"}.
                      {volunteer.celula ? ` Célula: ${volunteer.celula.name}.` : ""}
                      {volunteer.trailStage ? ` Trilho: ${volunteer.trailStage.trail.name} - ${volunteer.trailStage.label}.` : ""}
                    </p>
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
