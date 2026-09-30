"use client";

import { Users, UserPlus, Phone, Mail } from "lucide-react";
import { PageHeader, EmptyState } from "../ui";
import ui from "../ui.module.css";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DashboardAuthGuard } from "../dashboard-auth-guard";

type Member = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  volunteerStatus: string;
  campusId: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredSession = {
  token?: string;
  accessToken?: string;
  jwt?: string;
};

function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(
      2,
      6
    )}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(
    2,
    7
  )}-${digits.slice(7)}`;
}

function getApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3333/api";
}

function getAuthToken() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = window.localStorage.getItem("sistema-igrejas.session");

  if (!rawSession) {
    return null;
  }

  try {
    const session = JSON.parse(rawSession) as StoredSession;

    return session.token ?? session.accessToken ?? session.jwt ?? null;
  } catch {
    return null;
  }
}

export default function MembrosPage() {
  const apiUrl = useMemo(() => getApiUrl(), []);
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadMembers = useCallback(async () => {
    const token = getAuthToken();

    if (!token) {
      setFeedback("Sessão sem token de acesso. Faça login novamente.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${apiUrl}/members`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error("MEMBERS_LOAD_FAILED");
      }

      const data = (await response.json()) as Member[];

      setMembers(data);
      setFeedback("");
    } catch {
      setFeedback("Não foi possível carregar os membros.");
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getAuthToken();

    if (!token) {
      setFeedback("Sessão sem token de acesso. Faça login novamente.");
      return;
    }

    setIsSaving(true);
    setFeedback("");

    try {
      const response = await fetch(`${apiUrl}/members`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name,
          phone: phone.replace(/\D/g, ""),
          email
        })
      });

      if (!response.ok) {
        throw new Error("MEMBER_CREATE_FAILED");
      }

      setName("");
      setPhone("");
      setEmail("");
      setFeedback("Membro cadastrado com sucesso.");
      await loadMembers();
    } catch {
      setFeedback("Não foi possível cadastrar o membro.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <DashboardAuthGuard>
      <main className={ui.page}><div className={ui.container}>
        <PageHeader title="Membros" description="Organize o cadastro e mantenha os contatos da igreja por perto." icon={Users} />
        {feedback && <p className={ui.notice} role="status">{feedback}</p>}
        <div className={ui.split}>
          <section className={[ui.panel, ui.formSidebar].join(" ")}>
            <div className={ui.panelHeader}><div><h2>Novo membro</h2><p>Adicione uma pessoa ao cadastro.</p></div><UserPlus size={20} aria-hidden="true" /></div>
            <form onSubmit={handleSubmit} className={ui.form}>
              <label className={ui.field}><span>Nome</span><input required value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label className={ui.field}><span>Telefone</span><input inputMode="tel" maxLength={15} placeholder="(41) 99104-8498" required value={phone} onChange={(event) => setPhone(formatPhoneInput(event.target.value))} /></label>
              <label className={ui.field}><span>Email <small>Opcional</small></span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <button disabled={isSaving} type="submit" className={ui.button}><UserPlus size={16} aria-hidden="true" />{isSaving ? "Cadastrando..." : "Cadastrar membro"}</button>
            </form>
          </section>
          <section className={[ui.panel, ui.listColumn].join(" ")} aria-labelledby="members-title" aria-busy={isLoading}>
            <div className={ui.panelHeader}><div><h2 id="members-title">Membros cadastrados</h2><p>Pessoas e informações de contato.</p></div>{!isLoading && <span className={ui.badge}>{members.length} membros</span>}</div>
            {isLoading ? <div className={ui.empty} role="status"><Users size={25} aria-hidden="true" /><p>Carregando membros...</p></div> : members.length === 0 ? <EmptyState title="Nenhum membro cadastrado" description="Preencha o cadastro para adicionar o primeiro membro." icon={Users} /> : (
              <div className={ui.tableWrap}><table className={ui.table}>
                <caption className={ui.srOnly}>Membros da igreja</caption><thead><tr><th scope="col">Nome</th><th scope="col"><Phone size={12} aria-hidden="true" /> Telefone</th><th scope="col"><Mail size={12} aria-hidden="true" /> Email</th></tr></thead>
                <tbody>{members.map(member => <tr key={member.id}><td><div className={ui.person}><span className={ui.avatar} aria-hidden="true">{member.name.trim().slice(0, 1).toUpperCase()}</span>{member.name}</div></td><td data-label="Telefone">{member.phone}</td><td data-label="Email">{member.email ?? "Sem email"}</td></tr>)}</tbody>
              </table></div>
            )}
          </section>
        </div>
      </div></main>
    </DashboardAuthGuard>
  );
}
