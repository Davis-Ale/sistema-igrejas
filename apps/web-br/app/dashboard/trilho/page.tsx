"use client";

import { Route, Plus, ListOrdered, Flag } from "lucide-react";
import { PageHeader, EmptyState } from "../ui";
import ui from "../ui.module.css";
import styles from "./trilho.module.css";
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
    <DashboardAuthGuard><main className={ui.page}><div className={ui.container}>
      <PageHeader title="Trilhos" description="Organize os percursos e as etapas de desenvolvimento da igreja." icon={Route} />
      {error && <p className={ui.error} role="alert">{error}</p>}
      {successMessage && <p className={ui.success} role="status">{successMessage}</p>}
      <div className={ui.twoColumns}>
        <section className={ui.panel}>
          <div className={ui.panelHeader}><div><h2>Novo trilho</h2><p>Defina o nome e o propósito do percurso.</p></div><Route size={20} aria-hidden="true" /></div>
          <form onSubmit={handleCreateTrail} className={ui.form}>
            <label className={ui.field}><span>Nome</span><input onChange={(event) => setTrailName(event.target.value)} required type="text" value={trailName} /></label>
            <label className={ui.check}><input checked={isVolunteerGate} onChange={(event) => setIsVolunteerGate(event.target.checked)} type="checkbox" />Porta de voluntariado</label>
            <div className={ui.actions}><button disabled={isSubmittingTrail} type="submit" className={ui.button}><Plus size={16} aria-hidden="true" />{isSubmittingTrail ? "Criando..." : "Criar trilho"}</button></div>
          </form>
        </section>
        <section className={ui.panel}>
          <div className={ui.panelHeader}><div><h2>Nova etapa</h2><p>Adicione uma etapa ao trilho selecionado.</p></div><ListOrdered size={20} aria-hidden="true" /></div>
          <form onSubmit={handleCreateStage} className={ui.form}>
            <label className={ui.field}><span>Trilho</span><select onChange={(event) => setSelectedTrailId(event.target.value)} required value={selectedTrailId}><option value="">Selecione</option>{trails.map(trail => <option key={trail.id} value={trail.id}>{trail.name}</option>)}</select></label>
            <div className={ui.fields}><label className={ui.field}><span>Etapa</span><input onChange={(event) => setStageLabel(event.target.value)} required type="text" value={stageLabel} /></label><label className={ui.field}><span>Ordem</span><input min="0" onChange={(event) => setStageOrder(event.target.value)} required type="number" value={stageOrder} /></label></div>
            <div className={ui.actions}><button disabled={isSubmittingStage} className={ui.button} type="submit"><Plus size={16} aria-hidden="true" />{isSubmittingStage ? "Criando..." : "Criar etapa"}</button></div>
          </form>
        </section>
      </div>
      <section className={styles.trailsSection} aria-labelledby="trails-title" aria-busy={isLoading}>
        <div className={styles.sectionHeading}><div><h2 id="trails-title">Trilhos cadastrados</h2><p>Visualize as etapas de cada percurso.</p></div>{!isLoading && <span className={ui.badge}>{trails.length} trilhos</span>}</div>
        {isLoading && <div className={ui.empty} role="status"><Route size={25} aria-hidden="true" /><p>Carregando trilhos...</p></div>}
        {!isLoading && trails.length === 0 && <div className={ui.panel}><EmptyState title="Nenhum trilho cadastrado" description="Crie um trilho e organize suas etapas." icon={Route} /></div>}
        {!isLoading && trails.length > 0 && <div className={styles.trailGrid}>{trails.map(trail => <article className={ui.panel} key={trail.id}>
          <div className={styles.trailHeading}><span className={styles.trailIcon}><Flag size={20} aria-hidden="true" /></span><div><h3>{trail.name}</h3><p>{trail.isVolunteerGate ? "Porta de voluntariado" : "Trilho comum"}</p></div><span className={ui.badge}>{trail.stages.length} etapas</span></div>
          {trail.stages.length > 0 ? <ol className={styles.timeline}>{trail.stages.map((stage, index) => <li key={stage.id}><span className={styles.step} aria-hidden="true">{index + 1}</span><span>{stage.label}</span></li>)}</ol> : <p className={styles.noStages}>Nenhuma etapa cadastrada.</p>}
        </article>)}</div>}
      </section>
    </div></main></DashboardAuthGuard>
  );
}
