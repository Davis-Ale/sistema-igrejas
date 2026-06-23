"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { DashboardAuthGuard } from "../dashboard-auth-guard";

type LoginSession = {
  token: string;
};

type MemberRole = "PASTOR" | "LEADER" | "VOLUNTEER" | "MEMBER";

type Member = {
  id: string;
  campusId: string | null;
  name: string;
  phone: string;
  email: string | null;
  role: MemberRole;
  volunteerStatus: string;
  createdAt: string;
  updatedAt: string;
};

type Cell = {
  id: string;
  churchId: string;
  campusId: string | null;
  leaderId: string;
  name: string;
  region: string;
  meetDay: string;
  meetTime: string;
  profile: string;
  createdAt: string;
  updatedAt: string;
  leader: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  };
  people: Array<{
    id: string;
    name: string;
    phone: string;
    email: string | null;
    role: MemberRole;
    volunteerStatus: string;
  }>;
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

export default function CelulasPage() {
  const [cells, setCells] = useState<Cell[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [meetDay, setMeetDay] = useState("");
  const [meetTime, setMeetTime] = useState("");
  const [profile, setProfile] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [selectedCellId, setSelectedCellId] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [canVolunteer, setCanVolunteer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);

  const availableMembers = useMemo(() => {
    if (!selectedCellId) {
      return members;
    }

    const selectedCell = cells.find((cell) => cell.id === selectedCellId);
    const memberIdsInCell = new Set(selectedCell?.people.map((person) => person.id) ?? []);

    return members.filter((member) => !memberIdsInCell.has(member.id));
  }, [cells, members, selectedCellId]);

  async function loadData() {
    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const [cellsResponse, membersResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/cells`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }),
        fetch(`${API_BASE_URL}/api/members`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
      ]);

      if (!cellsResponse.ok) {
        const data = (await cellsResponse.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível carregar as células.");
        return;
      }

      if (!membersResponse.ok) {
        const data = (await membersResponse.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível carregar os membros.");
        return;
      }

      const cellsData = (await cellsResponse.json()) as Cell[];
      const membersData = (await membersResponse.json()) as Member[];

      setCells(cellsData);
      setMembers(membersData);

      const firstMember = membersData[0];

      if (!leaderId && firstMember) {
        setLeaderId(firstMember.id);
      }
    } catch {
      setError("Não foi possível carregar os dados de células agora.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateCell(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsCreating(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/cells`, {
        body: JSON.stringify({
          leaderId,
          meetDay,
          meetTime,
          profile,
          name,
          region
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível cadastrar a célula.");
        return;
      }

      setName("");
      setRegion("");
      setMeetDay("");
      setMeetTime("");
      setProfile("");
      setSuccessMessage("Célula cadastrada com sucesso.");
      await loadData();
    } catch {
      setError("Não foi possível cadastrar a célula agora.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsAddingMember(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/cells/members`, {
        body: JSON.stringify({
          canVolunteer,
          groupId: selectedCellId,
          personId: selectedPersonId
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível vincular o membro à célula.");
        return;
      }

      setSelectedPersonId("");
      setCanVolunteer(false);
      setSuccessMessage("Membro vinculado à célula com sucesso.");
      await loadData();
    } catch {
      setError("Não foi possível vincular o membro à célula agora.");
    } finally {
      setIsAddingMember(false);
    }
  }

  useEffect(() => {
    void loadData();
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
          <div>
            <Link
              href="/dashboard"
              style={{
                color: "#93c5fd",
                display: "inline-flex",
                fontSize: "14px",
                fontWeight: 800,
                marginBottom: "22px",
                textDecoration: "none"
              }}
            >
              ← Voltar ao painel
            </Link>


          </div>

          <form
            onSubmit={handleCreateCell}
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
              Cadastrar célula
            </h2>

            <div
              style={{
                display: "grid",
                gap: "14px",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
              }}
            >
              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Nome da célula
                <input
                  onChange={(event) => setName(event.target.value)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  type="text"
                  value={name}
                />
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Região
                <input
                  onChange={(event) => setRegion(event.target.value)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  type="text"
                  value={region}
                />
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Dia de encontro
                <input
                  onChange={(event) => setMeetDay(event.target.value)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  type="text"
                  value={meetDay}
                />
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Horário
                <input
                  onChange={(event) => setMeetTime(event.target.value)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  type="time"
                  value={meetTime}
                />
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Tipo/perfil
                <select
                  onChange={(event) => setProfile(event.target.value)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  value={profile}
                >
                  <option value="">Selecione</option>
                  <option value="Famílias">Famílias</option>
                  <option value="Jovens">Jovens</option>
                  <option value="Mulheres">Mulheres</option>
                  <option value="Homens">Homens</option>
                  <option value="Adolescentes">Adolescentes</option>
                  <option value="Terceira idade">Terceira idade</option>
                </select>
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Líder
                <select
                  onChange={(event) => setLeaderId(event.target.value)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  value={leaderId}
                >
                  <option value="">Selecione um líder</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              disabled={isCreating || members.length === 0}
              style={{
                background: "#2563eb",
                border: 0,
                borderRadius: "14px",
                color: "#ffffff",
                cursor: isCreating || members.length === 0 ? "not-allowed" : "pointer",
                font: "inherit",
                fontWeight: 900,
                justifySelf: "start",
                opacity: isCreating || members.length === 0 ? 0.72 : 1,
                padding: "13px 18px"
              }}
              type="submit"
            >
              {isCreating ? "Cadastrando..." : "Cadastrar célula"}
            </button>
          </form>

          <form
            onSubmit={handleAddMember}
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
              Vincular membro à célula
            </h2>

            <div
              style={{
                display: "grid",
                gap: "14px",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
              }}
            >
              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Célula
                <select
                  onChange={(event) => {
                    setSelectedCellId(event.target.value);
                    setSelectedPersonId("");
                  }}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  value={selectedCellId}
                >
                  <option value="">Selecione uma célula</option>
                  {cells.map((cell) => (
                    <option key={cell.id} value={cell.id}>
                      {cell.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Membro
                <select
                  onChange={(event) => setSelectedPersonId(event.target.value)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  value={selectedPersonId}
                >
                  <option value="">Selecione um membro</option>
                  {availableMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ alignItems: "center", color: "#cbd5e1", display: "flex", fontSize: "14px", fontWeight: 800, gap: "10px", paddingTop: "28px" }}>
                <input
                  checked={canVolunteer}
                  onChange={(event) => setCanVolunteer(event.target.checked)}
                  type="checkbox"
                />
                Pode servir como voluntário
              </label>
            </div>

            <button
              disabled={isAddingMember || cells.length === 0 || members.length === 0}
              style={{
                background: "#2563eb",
                border: 0,
                borderRadius: "14px",
                color: "#ffffff",
                cursor: isAddingMember || cells.length === 0 || members.length === 0 ? "not-allowed" : "pointer",
                font: "inherit",
                fontWeight: 900,
                justifySelf: "start",
                opacity: isAddingMember || cells.length === 0 || members.length === 0 ? 0.72 : 1,
                padding: "13px 18px"
              }}
              type="submit"
            >
              {isAddingMember ? "Vinculando..." : "Vincular membro"}
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
              Células cadastradas
            </h2>

            {isLoading ? (
              <p style={{ color: "#cbd5e1", margin: 0 }}>Carregando células...</p>
            ) : null}

            {!isLoading && cells.length === 0 ? (
              <p style={{ color: "#cbd5e1", margin: 0 }}>
                Nenhuma célula cadastrada ainda.
              </p>
            ) : null}

            {!isLoading && cells.length > 0 ? (
              <div style={{ display: "grid", gap: "12px" }}>
                {cells.map((cell) => (
                  <article
                    key={cell.id}
                    style={{
                      background: "rgba(15, 23, 42, 0.82)",
                      border: "1px solid rgba(148, 163, 184, 0.16)",
                      borderRadius: "18px",
                      display: "grid",
                      gap: "10px",
                      padding: "16px"
                    }}
                  >
                    <div style={{ alignItems: "start", display: "flex", gap: "12px", justifyContent: "space-between" }}>
                      <div>
                        <h3 style={{ color: "#ffffff", fontSize: "17px", margin: "0 0 6px" }}>
                          {cell.name}
                        </h3>

                        <p style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: 1.5, margin: 0 }}>
                          Região: {cell.region} • Perfil: {cell.profile} • Dia: {cell.meetDay} • Horário: {cell.meetTime}
                        </p>

                        <p style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.5, margin: "6px 0 0" }}>
                          Líder: {cell.leader.name}
                        </p>
                      </div>

                      <span style={{ background: "rgba(37, 99, 235, 0.18)", border: "1px solid rgba(96, 165, 250, 0.22)", borderRadius: "999px", color: "#bfdbfe", fontSize: "12px", fontWeight: 900, padding: "6px 10px", whiteSpace: "nowrap" }}>
                        {cell.people.length} membro{cell.people.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    {cell.people.length > 0 ? (
                      <div style={{ display: "grid", gap: "6px" }}>
                        {cell.people.map((person) => (
                          <p key={person.id} style={{ color: "#cbd5e1", fontSize: "14px", margin: 0 }}>
                            {person.name} • {person.phone}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>
                        Nenhum membro vinculado ainda.
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
