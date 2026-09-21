"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, checkIn, listEvents, login, readSession, SESSION_KEY,
  type CheckInResult, type EventPage, type EventSummary, type Session } from "./lib/api";
import QrScanner from "./qr-scanner";
import { EventCover } from "./event-cover";
import styles from "./organizer.module.css";

function errorText(error: unknown) {
  if (error instanceof TypeError) return "Não foi possível conectar. Confira sua conexão e tente novamente.";
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

export default function Organizer({ initialEvent }: {
  initialEvent?: Pick<EventSummary, "id" | "title">;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const restore = () => {
      try { setSession(readSession(window.localStorage)); } catch { setSession(null); }
      setReady(true);
    };
    restore();
    const onStorage = (event: StorageEvent) => {
      if (event.key === SESSION_KEY || event.key === null) restore();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const logout = useCallback((message = "") => {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* Clear in-memory access as well. */ }
    setSession(null);
    setNotice(message);
  }, []);
  const expired = useCallback(() => logout("Sua sessão expirou. Entre novamente."), [logout]);

  return <div className={styles.root}><main className="shell">
    <header className="header">
      <div><p className="eyebrow">Eventos</p><p className="brand">Organizador</p></div>
      {session && <button className="text-button" onClick={() => logout()}>Sair</button>}
    </header>
    {!ready ? <p role="status">Carregando…</p> : session ?
      <Events key={session.token} session={session} initialEvent={initialEvent} onExpired={expired} /> :
      <Login notice={notice} onLogin={(value) => { setNotice(""); setSession(value); }} />}
  </main></div>;
}

function Login({ notice, onLogin }: { notice: string; onLogin: (session: Session) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    pending.current = true;
    setBusy(true); setError("");
    try {
      const session = await login(String(data.get("email")), String(data.get("password")));
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
      catch { throw new Error("Permita o armazenamento deste site para manter sua sessão."); }
      form.reset();
      onLogin(session);
    } catch (error) { setError(errorText(error)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="panel">
    <p className="eyebrow">Bem-vindo à recepção</p>
    <h1>Entre para organizar</h1>
    <p className="muted">Use seu e-mail e senha do sistema.</p>
    {notice && <p className="notice" role="status">{notice}</p>}
    <form onSubmit={submit} className="stack">
      <label>E-mail<input name="email" type="email" autoComplete="username" required disabled={busy} /></label>
      <label>Senha<input name="password" type="password" autoComplete="current-password" required minLength={8} disabled={busy} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
    </form>
  </section>;
}

function Events({ session, initialEvent, onExpired }: {
  session: Session;
  initialEvent: Pick<EventSummary, "id" | "title"> | undefined;
  onExpired: () => void;
}) {
  const [selected, setSelected] = useState<Pick<EventSummary, "id" | "title"> | null>(initialEvent ?? null);
  const [data, setData] = useState<EventPage | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function resetList() {
    setLoading(true);
    setError("");
    setData(null);
  }

  useEffect(() => {
    if (selected) return;
    const controller = new AbortController();
    void listEvents(session.token, page, query, controller.signal).then((result) => {
      if (!controller.signal.aborted) setData(result);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) onExpired();
      else setError(errorText(error));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [session.token, page, query, reload, selected, onExpired]);

  if (selected) return <CheckIn key={selected.id} event={selected} token={session.token}
    onBack={() => { resetList(); setSelected(null); }} onExpired={onExpired} />;

  return <section className="stack">
    <div><p className="eyebrow">{session.church.name}</p><h1>Seus eventos</h1>
      <p className="muted">Selecione o evento para receber os participantes.</p></div>
    <form className="search" onSubmit={(event) => {
      event.preventDefault(); resetList(); setPage(1); setQuery(search.trim()); setReload((value) => value + 1);
    }}>
      <label className="grow">Buscar evento<input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Nome do evento" /></label>
      <button className="secondary" disabled={loading}>Pesquisar</button>
    </form>
    {loading && <p role="status">Carregando eventos…</p>}
    {error && <div className="error" role="alert"><p>{error}</p>
      <button className="secondary" onClick={() => { resetList(); setReload((value) => value + 1); }}>Tentar novamente</button></div>}
    {!loading && !error && data && <>
      {data.items.length === 0 ? <p className="panel">Nenhum evento encontrado.</p> :
        <ul className="events">{data.items.map((event) => <li key={event.id}>
          <button className="event" onClick={() => setSelected(event)}>
            <EventCover eventId={event.id} title={event.title} token={session.token} onExpired={onExpired} />
            <span className={styles.eventDetails}><strong>{event.title}</strong><time dateTime={event.date}>{new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "medium", timeStyle: "short",
            }).format(new Date(event.date))}</time></span><span aria-hidden="true">→</span>
          </button>
        </li>)}</ul>}
      {data.pagination.totalPages > 1 && <nav className="pagination" aria-label="Páginas de eventos">
        <button className="secondary" disabled={page <= 1} onClick={() => { resetList(); setPage((value) => value - 1); }}>Anterior</button>
        <span>{page} / {data.pagination.totalPages}</span>
        <button className="secondary" disabled={page >= data.pagination.totalPages} onClick={() => { resetList(); setPage((value) => value + 1); }}>Próxima</button>
      </nav>}
    </>}
  </section>;
}

function CheckIn({ event, token, onBack, onExpired }: {
  event: Pick<EventSummary, "id" | "title">; token: string; onBack: () => void; onExpired: () => void;
}) {
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const closeCamera = useCallback(() => setCamera(false), []);
  const readCode = useCallback((value: string) => {
    setCamera(false); setCode(value); setResult(null); setError("");
    inputRef.current?.focus();
  }, []);

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (pending.current || !code.trim()) return;
    pending.current = true;
    setBusy(true); setCamera(false); setError(""); setResult(null);
    try {
      const result = await checkIn(token, event.id, code);
      if (mounted.current) { setResult(result); setCode(""); }
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiError && error.status === 401) onExpired();
      else setError(error instanceof TypeError
        ? "A conexão foi interrompida e não recebemos a confirmação. Confira a conexão; uma nova tentativa informará se o check-in já foi realizado."
        : errorText(error));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <section className="stack">
    <button className="text-button back" disabled={busy} onClick={onBack}>← Trocar evento</button>
    <EventCover eventId={event.id} title={event.title} token={token} banner onExpired={onExpired} />
    <div><p className="eyebrow">Check-in</p><h1>{event.title}</h1>
      <p className="muted">Leia o QR da credencial ou digite o código.</p></div>
    {result ? <div className="success stack" role="status" aria-live="polite">
      <span className="success-icon" aria-hidden="true">✓</span>
      <h2>Check-in realizado</h2>
      <p className="participant">{result.person?.name || result.visitor?.name || "Nome não informado"}</p>
      <p><span className="badge">Presente</span></p>
      <button onClick={() => setResult(null)}>Próximo participante</button>
    </div> : <>
      {camera ? <QrScanner onRead={readCode} onClose={closeCamera} /> :
        <button className="camera-button" disabled={busy} onClick={() => { setCamera(true); setError(""); }}>Ler QR Code</button>}
      <form className="panel stack" onSubmit={submit} aria-busy={busy}>
        <label>Código da credencial<input ref={inputRef} value={code} required disabled={busy}
          autoComplete="off" autoCapitalize="none" spellCheck={false}
          onChange={(event) => { setCode(event.target.value); setError(""); }}
          placeholder="Digite ou leia o código" /></label>
        <p className="hint">Confirme o evento acima antes de fazer o check-in.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={busy || !code.trim()}>{busy ? "Confirmando…" : "Fazer check-in"}</button>
      </form>
    </>}
  </section>;
}
