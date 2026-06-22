"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { DashboardAuthGuard } from "../dashboard-auth-guard";

type LoginSession = {
  token: string;
};

type TrailStage = {
  id: string;
  label: string;
  order: number;
  requiresEventId: string | null;
};

type Trail = {
  id: string;
  name: string;
  isVolunteerGate: boolean;
  stages: TrailStage[];
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333";

export default function TrilhoPage() {
  const [trails, setTrails] = useState<Trail[]>([]);
  const [trailName, setTrailName] = useState("");
  const [isVolunteerGate, setIsVolunteerGate] = useState(false);
  const [selectedTrailId, setSelectedTrailId] = useState("");
  const [stageLabel, setStageLabel] = useState("");
  const [stageOrder, setStageOrder] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingTrail, setIsSubmittingTrail] = useState(false);
  const [isSubmittingStage, setIsSubmittingStage] = useState(false);

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

  async function loadTrails() {
    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/trails`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível carregar os trilhos.");
        return;
      }

      const data = (await response.json()) as Trail[];

      setTrails(data);
      setSelectedTrailId((currentTrailId) => currentTrailId || data[0]?.id || "");
    } catch {
      setError("Não foi possível carregar os trilhos agora.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateTrail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSubmittingTrail(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/trails`, {
        body: JSON.stringify({
          isVolunteerGate,
          name: trailName
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível criar o trilho.");
        return;
      }

      setTrailName("");
      setIsVolunteerGate(false);
      setSuccessMessage("Trilho criado com sucesso.");
      await loadTrails();
    } catch {
      setError("Não foi possível criar o trilho agora.");
    } finally {
      setIsSubmittingTrail(false);
    }
  }

  async function handleCreateStage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSubmittingStage(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/trails/stages`, {
        body: JSON.stringify({
          label: stageLabel,
          order: Number(stageOrder),
          trailId: selectedTrailId
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível criar a etapa.");
        return;
      }

      setStageLabel("");
      setStageOrder("");
      setSuccessMessage("Etapa criada com sucesso.");
      await loadTrails();
    } catch {
      setError("Não foi possível criar a etapa agora.");
    } finally {
      setIsSubmittingStage(false);
    }
  }

  useEffect(() => {
    void loadTrails();
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
            onSubmit={handleCreateTrail}
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
              Novo trilho
            </h2>

            <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
              Nome
              <input
                onChange={(event) => setTrailName(event.target.value)}
                required
                style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                type="text"
                value={trailName}
              />
            </label>

            <label style={{ alignItems: "center", color: "#cbd5e1", display: "flex", fontSize: "14px", fontWeight: 800, gap: "10px" }}>
              <input
                checked={isVolunteerGate}
                onChange={(event) => setIsVolunteerGate(event.target.checked)}
                type="checkbox"
              />
              Porta de voluntariado
            </label>

            <button
              disabled={isSubmittingTrail}
              style={{
                background: "#2563eb",
                border: 0,
                borderRadius: "14px",
                color: "#ffffff",
                cursor: isSubmittingTrail ? "not-allowed" : "pointer",
                font: "inherit",
                fontWeight: 900,
                justifySelf: "start",
                opacity: isSubmittingTrail ? 0.72 : 1,
                padding: "13px 18px"
              }}
              type="submit"
            >
              {isSubmittingTrail ? "Criando..." : "Criar trilho"}
            </button>
          </form>

          <form
            onSubmit={handleCreateStage}
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
              Nova etapa
            </h2>

            <div
              style={{
                display: "grid",
                gap: "14px",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))"
              }}
            >
              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Trilho
                <select
                  onChange={(event) => setSelectedTrailId(event.target.value)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  value={selectedTrailId}
                >
                  <option value="">Selecione</option>
                  {trails.map((trail) => (
                    <option key={trail.id} value={trail.id}>
                      {trail.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Etapa
                <input
                  onChange={(event) => setStageLabel(event.target.value)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  type="text"
                  value={stageLabel}
                />
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Ordem
                <input
                  min="0"
                  onChange={(event) => setStageOrder(event.target.value)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  type="number"
                  value={stageOrder}
                />
              </label>
            </div>

            <button
              disabled={isSubmittingStage}
              style={{
                background: "#2563eb",
                border: 0,
                borderRadius: "14px",
                color: "#ffffff",
                cursor: isSubmittingStage ? "not-allowed" : "pointer",
                font: "inherit",
                fontWeight: 900,
                justifySelf: "start",
                opacity: isSubmittingStage ? 0.72 : 1,
                padding: "13px 18px"
              }}
              type="submit"
            >
              {isSubmittingStage ? "Criando..." : "Criar etapa"}
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
              Trilhos
            </h2>

            {isLoading ? (
              <p style={{ color: "#cbd5e1", margin: 0 }}>Carregando trilhos...</p>
            ) : null}

            {!isLoading && trails.length === 0 ? (
              <p style={{ color: "#cbd5e1", margin: 0 }}>
                Nenhum trilho cadastrado ainda.
              </p>
            ) : null}

            {!isLoading && trails.length > 0 ? (
              <div style={{ display: "grid", gap: "10px" }}>
                {trails.map((trail) => (
                  <article
                    key={trail.id}
                    style={{
                      background: "rgba(15, 23, 42, 0.82)",
                      border: "1px solid rgba(148, 163, 184, 0.16)",
                      borderRadius: "18px",
                      display: "grid",
                      gap: "10px",
                      padding: "14px"
                    }}
                  >
                    <div>
                      <h3 style={{ color: "#ffffff", fontSize: "16px", margin: "0 0 4px" }}>
                        {trail.name}
                      </h3>
                      <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0 }}>
                        {trail.isVolunteerGate ? "Porta de voluntariado" : "Trilho comum"}
                      </p>
                    </div>

                    {trail.stages.length > 0 ? (
                      <ol style={{ color: "#cbd5e1", margin: 0, paddingLeft: "20px" }}>
                        {trail.stages.map((stage) => (
                          <li key={stage.id}>
                            {stage.label}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0 }}>
                        Nenhuma etapa cadastrada.
                      </p>
                    )}
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
