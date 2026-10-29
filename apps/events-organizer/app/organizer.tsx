"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, checkIn, listEvents, listRegistrations, login, readSession, SESSION_KEY,
  type CheckInResult, type EventPage, type EventSummary, type RegistrationPage, type RegistrationSummary, type Session } from "./lib/api";
import QrScanner from "./qr-scanner";
import { EventCover } from "./event-cover";
import styles from "./organizer.module.css";

function errorText(error: unknown) {
  if (error instanceof TypeError) return "Não foi possível conectar. Confira sua conexão e tente novamente.";
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

function participantName(item: Pick<RegistrationSummary, "person" | "visitor">) {
  return item.person?.name || item.visitor?.name || "Nome não informado";
}

function participantContact(item: Pick<RegistrationSummary, "person" | "visitor">) {
  const contact = item.person ?? item.visitor;
  return [contact?.email, contact?.phone].filter(Boolean).join(" · ");
}

function registrationBlock(item: RegistrationSummary) {
  if (item.status === "CANCELLED") {
    return "Esta inscrição foi cancelada e não pode fazer check-in.";
  }
  if (item.waitlistedAt) {
    return "Esta inscrição ainda está na lista de espera.";
  }
  if (item.paymentStatus === "PENDING" || item.paymentStatus === "CANCELLED") {
    return "O pagamento desta inscrição ainda não foi confirmado.";
  }
  if (item.status === "CHECKED_IN") {
    return "Check-in já realizado para esta inscrição.";
  }
  return null;
}

function canCheckIn(item: RegistrationSummary) {
  return item.status === "CONFIRMED" && Boolean(item.checkInToken) && !registrationBlock(item);
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
  const [tab, setTab] = useState<"checkin" | "people">("checkin");
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
    <div><p className="eyebrow">Recepção</p><h1>{event.title}</h1>
      <p className="muted">Leia o QR, digite o código ou localize o participante.</p></div>
    <div className="tabs" role="tablist" aria-label="Operação do evento">
      <button type="button" role="tab" aria-selected={tab === "checkin"} className={tab === "checkin" ? "tab active" : "tab"}
        disabled={busy} onClick={() => { setTab("checkin"); setCamera(false); }}>Check-in</button>
      <button type="button" role="tab" aria-selected={tab === "people"} className={tab === "people" ? "tab active" : "tab"}
        disabled={busy} onClick={() => { setTab("people"); setCamera(false); }}>Participantes</button>
    </div>
    {result ? <div className="success stack" role="status" aria-live="polite">
      <span className="success-icon" aria-hidden="true">✓</span>
      <h2>Check-in realizado</h2>
      <p className="participant">{result.person?.name || result.visitor?.name || "Nome não informado"}</p>
      <p><span className="badge">Presente</span></p>
      <button onClick={() => setResult(null)}>Próximo participante</button>
    </div> : tab === "people" ? <People eventId={event.id} token={token} busy={busy}
      onExpired={onExpired} onCheckIn={async (checkInToken) => {
        if (pending.current) return;
        pending.current = true;
        setBusy(true); setError(""); setResult(null);
        try {
          const next = await checkIn(token, event.id, checkInToken);
          if (mounted.current) setResult(next);
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
      }} /> : <>
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
    {tab === "people" && error && !result ? <p className="error" role="alert">{error}</p> : null}
  </section>;
}

function People({ eventId, token, busy, onExpired, onCheckIn }: {
  eventId: string;
  token: string;
  busy: boolean;
  onExpired: () => void;
  onCheckIn: (checkInToken: string) => Promise<void>;
}) {
  const [data, setData] = useState<RegistrationPage | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<RegistrationSummary | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void listRegistrations(token, eventId, page, query, controller.signal).then((result) => {
      if (!controller.signal.aborted) setData(result);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) onExpired();
      else setError(errorText(error));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, eventId, page, query, reload, onExpired]);

  return <section className="stack">
    <form className="search" onSubmit={(event) => {
      event.preventDefault(); setPage(1); setQuery(search.trim()); setReload((value) => value + 1); setSelected(null);
    }}>
      <label className="grow">Localizar participante
        <input value={search} onChange={(event) => setSearch(event.target.value)} type="search"
          placeholder="Nome, e-mail, telefone ou código" /></label>
      <button className="secondary" disabled={loading || busy}>Pesquisar</button>
    </form>
    {loading && <p role="status">Carregando participantes…</p>}
    {error && <div className="error" role="alert"><p>{error}</p>
      <button className="secondary" onClick={() => { setReload((value) => value + 1); }}>Tentar novamente</button></div>}
    {!loading && !error && data && <>
      {data.items.length === 0 ? <p className="panel">Nenhum participante encontrado.</p> :
        <ul className="people">{data.items.map((item) => {
          const block = registrationBlock(item);
          return <li key={item.id}>
            <button className="person" type="button" onClick={() => setSelected(item)}>
              <span><strong>{participantName(item)}</strong>
                {item.ticket?.name ? <span className="muted">{item.ticket.name}</span> : null}</span>
              <span className={item.status === "CHECKED_IN" ? "badge" : "muted"}>
                {item.status === "CHECKED_IN" ? "Presente" : block ? "Bloqueado" : "Confirmada"}
              </span>
            </button>
          </li>;
        })}</ul>}
      {data.pagination.totalPages > 1 && <nav className="pagination" aria-label="Páginas de participantes">
        <button className="secondary" disabled={page <= 1 || loading}
          onClick={() => { setPage((value) => value - 1); setSelected(null); }}>Anterior</button>
        <span>{page} / {data.pagination.totalPages}</span>
        <button className="secondary" disabled={page >= data.pagination.totalPages || loading}
          onClick={() => { setPage((value) => value + 1); setSelected(null); }}>Próxima</button>
      </nav>}
    </>}
    {selected ? <article className="panel stack" aria-label="Inscrição">
      <h2>{participantName(selected)}</h2>
      {participantContact(selected) ? <p className="muted">{participantContact(selected)}</p> : null}
      {selected.ticket?.name ? <p>{selected.ticket.name}{selected.ticketBatch?.name ? ` · ${selected.ticketBatch.name}` : ""}</p> : null}
      <p><span className={selected.status === "CHECKED_IN" ? "badge" : "muted"}>
        {selected.status === "CHECKED_IN" ? "Presente" : selected.status === "CONFIRMED" ? "Confirmada" : selected.status}
      </span></p>
      {registrationBlock(selected) ? <p className="error" role="status">{registrationBlock(selected)}</p> : null}
      {canCheckIn(selected) ? <button disabled={busy} onClick={() => void onCheckIn(selected.checkInToken ?? "")}>
        {busy ? "Confirmando…" : "Fazer check-in"}
      </button> : null}
    </article> : null}
  </section>;
}
