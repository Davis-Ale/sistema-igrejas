"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { DashboardAuthGuard } from "../dashboard-auth-guard";
import styles from "./ministries.module.css";

type Person = { id: string; name: string; role: string };
type Ministry = {
  id: string; name: string; description: string; status: "ACTIVE" | "INACTIVE";
  leaderId: string; leader: Person;
  members: { personId: string; person: Person }[];
};
type Session = { token?: string; accessToken?: string; jwt?: string; user?: { role?: string } };
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333"}/api`).replace(/\/$/, "");
const emptyForm = { name: "", description: "", status: "ACTIVE" as Ministry["status"], leaderId: "" };
const roleLabels: Record<string, string> = { SUPER_ADMIN: "Administrador", PASTOR: "Pastor", LEADER: "Líder", MEMBER: "Membro", VOLUNTEER: "Voluntário", VISITOR: "Visitante" };

function Ministries() {
  const [session, setSession] = useState<Session | null>(null);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [personId, setPersonId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const role = session?.user?.role ?? "";
  const canRead = ["SUPER_ADMIN", "PASTOR", "LEADER"].includes(role);
  const canManage = ["SUPER_ADMIN", "PASTOR"].includes(role);
  const token = session?.token ?? session?.accessToken ?? session?.jwt;
  const selected = ministries.find(ministry => ministry.id === selectedId);
  const availablePeople = people.filter(person => ["MEMBER", "VOLUNTEER"].includes(person.role) && !selected?.members.some(member => member.personId === person.id));

  useEffect(() => {
    try { setSession(JSON.parse(localStorage.getItem("sistema-igrejas.session") ?? "null") as Session | null); }
    catch { setSession(null); }
    setLoading(false);
  }, []);

  const request = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!token) throw new Error("Sessão inválida. Entre novamente no sistema.");
    const response = await fetch(`${API_URL}/ministries${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "Não foi possível concluir a operação.");
    return data as T;
  }, [token]);

  const refresh = useCallback(async () => {
    const [rows, persons] = await Promise.all([request<Ministry[]>(""), request<Person[]>("/people")]);
    setMinistries(rows);
    setPeople(persons);
  }, [request]);

  useEffect(() => {
    if (!canRead) return;
    let active = true;
    setLoading(true);
    setError("");
    refresh().catch(err => { if (active) setError(err instanceof Error ? err.message : "Falha ao carregar ministérios."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [canRead, refresh]);

  async function mutate(operation: () => Promise<void>) {
    if (!canManage || saving) return;
    setSaving(true); setError(""); setNotice("");
    try { await operation(); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }

  function edit(ministry?: Ministry) {
    setEditingId(ministry?.id ?? null);
    setForm(ministry ? { name: ministry.name, description: ministry.description, status: ministry.status, leaderId: ministry.leaderId } : emptyForm);
    setShowForm(true); setError(""); setNotice("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    await mutate(async () => {
      const result = await request<Ministry>(editingId ? `/${encodeURIComponent(editingId)}` : "", editingId ? "PATCH" : "POST", form);
      await refresh(); setSelectedId(result.id); setPersonId(""); setShowForm(false);
      setNotice(editingId ? "Ministério atualizado." : "Ministério criado.");
    });
  }

  async function remove(ministry: Ministry) {
    if (!window.confirm(`Excluir o ministério “${ministry.name}” e seus vínculos? As pessoas cadastradas serão preservadas.`)) return;
    await mutate(async () => {
      await request(`/${encodeURIComponent(ministry.id)}`, "DELETE");
      await refresh(); setSelectedId(null); setShowForm(false); setNotice("Ministério excluído.");
    });
  }

  return <main className={styles.page}>
    <div className={styles.container}>
      <Link className={styles.back} href="/dashboard">← Voltar ao painel</Link>
      <header className={styles.header}>
        <div><h1>Ministérios</h1><p>Organize os responsáveis e as equipes da igreja.</p></div>
        {canManage && <button disabled={saving || loading} onClick={() => edit()}>Novo ministério</button>}
      </header>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {loading ? <p role="status">Carregando ministérios…</p> : !canRead ? <p>Você não tem permissão para consultar ministérios.</p> : <>
        {error && <button disabled={saving} onClick={() => { setLoading(true); setError(""); void refresh().catch(err => setError(err instanceof Error ? err.message : "Falha ao atualizar.")).finally(() => setLoading(false)); }}>Tentar novamente</button>}
        {showForm && canManage && <section className={styles.panel}>
          <h2>{editingId ? "Editar ministério" : "Novo ministério"}</h2>
          <form onSubmit={save}>
            <fieldset disabled={saving} className={styles.fields}>
              <label>Nome<input required maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
              <label>Descrição<textarea rows={3} maxLength={4000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
              <div className={styles.formRow}>
                <label>Responsável / líder<select required value={form.leaderId} onChange={event => setForm({ ...form, leaderId: event.target.value })}>
                  <option value="">Selecione uma pessoa</option>
                  {people.map(person => <option key={person.id} value={person.id}>{person.name} — {roleLabels[person.role] ?? person.role}</option>)}
                </select></label>
                <label>Status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as Ministry["status"] })}>
                  <option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option>
                </select></label>
              </div>
              {people.length === 0 && <p>Cadastre uma pessoa na igreja para selecionar o responsável.</p>}
              <div className={styles.actions}><button type="submit" disabled={!people.length}>{saving ? "Salvando…" : "Salvar ministério"}</button><button className={styles.secondary} type="button" onClick={() => setShowForm(false)}>Cancelar</button></div>
            </fieldset>
          </form>
        </section>}
        <div className={styles.grid}>
          <section className={styles.panel} aria-label="Lista de ministérios">
            <h2>Ministérios cadastrados ({ministries.length})</h2>
            {!ministries.length && <p>Nenhum ministério cadastrado.</p>}
            <ul className={styles.list}>{ministries.map(ministry => <li key={ministry.id}>
              <button className={`${styles.item} ${selectedId === ministry.id ? styles.selected : ""}`} disabled={saving} aria-pressed={selectedId === ministry.id} onClick={() => { setSelectedId(ministry.id); setPersonId(""); setShowForm(false); }}>
                <strong>{ministry.name}</strong><span>{ministry.status === "ACTIVE" ? "Ativo" : "Inativo"} · {ministry.members.length} pessoa(s)</span><span>Responsável: {ministry.leader.name}</span>
              </button>
            </li>)}</ul>
          </section>
          <section className={styles.panel} aria-label="Detalhes do ministério">
            {!selected ? <p>Selecione um ministério para consultar sua equipe.</p> : <>
              <h2>{selected.name}</h2>
              <p className={styles.description}>{selected.description || "Sem descrição."}</p>
              <p><strong>Status:</strong> {selected.status === "ACTIVE" ? "Ativo" : "Inativo"}</p>
              <p><strong>Responsável:</strong> {selected.leader.name}</p>
              {canManage && <div className={styles.actions}><button disabled={saving} className={styles.secondary} onClick={() => edit(selected)}>Editar</button><button disabled={saving} className={styles.danger} onClick={() => void remove(selected)}>Excluir ministério</button></div>}
              <h3>Equipe ({selected.members.length})</h3>
              {!selected.members.length && <p>Nenhum membro ou voluntário vinculado.</p>}
              <ul className={styles.list}>{selected.members.map(member => <li className={styles.member} key={member.personId}>
                <span>{member.person.name}<small>{roleLabels[member.person.role] ?? member.person.role}</small></span>
                {canManage && <button disabled={saving} className={styles.secondary} aria-label={`Desvincular ${member.person.name}`} onClick={() => void mutate(async () => {
                  const result = await request<Ministry>(`/${encodeURIComponent(selected.id)}/members/${encodeURIComponent(member.personId)}`, "DELETE");
                  setMinistries(rows => rows.map(row => row.id === result.id ? result : row)); setNotice("Pessoa desvinculada.");
                })}>Desvincular</button>}
              </li>)}</ul>
              {canManage && <form onSubmit={event => { event.preventDefault(); void mutate(async () => {
                const result = await request<Ministry>(`/${encodeURIComponent(selected.id)}/members`, "POST", { personId });
                setMinistries(rows => rows.map(row => row.id === result.id ? result : row)); setPersonId(""); setNotice("Pessoa vinculada.");
              }); }}>
                <fieldset disabled={saving} className={styles.fields}>
                  <label>Membro / voluntário<select required value={personId} onChange={event => setPersonId(event.target.value)}>
                    <option value="">Selecione uma pessoa</option>
                    {availablePeople.map(person => <option key={person.id} value={person.id}>{person.name} — {roleLabels[person.role]}</option>)}
                  </select></label>
                  <button type="submit" disabled={!personId}>Vincular à equipe</button>
                  {!availablePeople.length && <p>Não há outros membros ou voluntários disponíveis.</p>}
                </fieldset>
              </form>}
            </>}
          </section>
        </div>
      </>}
    </div>
  </main>;
}

export default function MinistriesPage() {
  return <DashboardAuthGuard><Ministries /></DashboardAuthGuard>;
}
