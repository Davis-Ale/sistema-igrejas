"use client";

import { Bot, MessageSquare, Send, UserRound } from "lucide-react";
import { PageHeader, EmptyState } from "../ui";
import ui from "../ui.module.css";
import styles from "./assistente.module.css";
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
  const [lastQuestion, setLastQuestion] = useState("");
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
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
      setMessage("");
    } catch {
      setError("Não foi possível consultar o assistente agora.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DashboardAuthGuard>
      <main className={ui.page}>
        <div className={ui.container}>
          <PageHeader title="Assistente IA" description="Consulte as informações disponíveis da sua igreja." icon={Bot} />
          <section className={styles.chat} aria-label="Consulta ao assistente">
            <header className={styles.chatHeader}>
              <span className={styles.botIcon}><Bot size={22} aria-hidden="true" /></span>
              <div><h2>Assistente da igreja</h2><p>Perguntas e respostas sobre seus dados</p></div>
            </header>
            <div className={styles.conversation} aria-live="polite" aria-busy={isSubmitting}>
              {!lastQuestion && !answer && !isSubmitting && <EmptyState icon={MessageSquare} title="Como podemos ajudar?" description="Escreva sua pergunta abaixo para consultar as informações disponíveis no sistema." />}
              {lastQuestion && <div className={styles.question}>
                <span className={styles.userIcon}><UserRound size={18} aria-hidden="true" /></span>
                <div className={styles.bubble}><h3>Você</h3><p>{lastQuestion}</p></div>
              </div>}
              {isSubmitting && <div className={styles.response} role="status"><span className={styles.botIcon}><Bot size={18} aria-hidden="true" /></span><p className={styles.pending}>Consultando informações…</p></div>}
              {answer && <div className={styles.response}>
                <span className={styles.botIcon}><Bot size={18} aria-hidden="true" /></span>
                <div className={styles.bubble}><h3>Assistente</h3><p>{answer}</p></div>
              </div>}
              {error && <p role="alert" className={ui.error}>{error}</p>}
            </div>
            <form className={styles.composer} onSubmit={(event) => { setLastQuestion(message); void handleSubmit(event); }}>
              <label className={ui.field}>Sua pergunta
                <textarea onChange={(event) => setMessage(event.target.value)} required rows={3} value={message} placeholder="O que você gostaria de consultar?" />
              </label>
              <div className={styles.composerFooter}>
                <p>A resposta à última consulta aparece acima.</p>
                <button className={ui.button} disabled={isSubmitting} type="submit"><Send size={15} aria-hidden="true" />{isSubmitting ? "Consultando..." : "Consultar assistente"}</button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </DashboardAuthGuard>
  );
}
