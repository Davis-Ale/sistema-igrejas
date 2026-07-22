"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { DashboardAuthGuard } from "../dashboard-auth-guard";
import { CellEditList } from "./cell-edit-list";
import type { CellListItem } from "./cell-list-api";
import { CellLocationFields } from "./cell-location-fields";
import { useCellLocation } from "./use-cell-location";

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
  state: string;
  city: string;
  neighborhood: string;
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

function formatBrazilPhone(phone?: string | null): string {
  const digits = phone?.replace(/\D/g, "") ?? "";
  const nationalDigits =
    digits.length === 13 && digits.startsWith("55")
      ? digits.slice(2)
      : digits;

  if (nationalDigits.length === 11) {
    return `(${nationalDigits.slice(0, 2)}) ${nationalDigits.slice(
      2,
      7
    )}-${nationalDigits.slice(7)}`;
  }

  if (nationalDigits.length === 10) {
    return `(${nationalDigits.slice(0, 2)}) ${nationalDigits.slice(
      2,
      6
    )}-${nationalDigits.slice(6)}`;
  }

  return phone?.trim() || "Não informado";
}

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
  const [meetDay, setMeetDay] = useState("");
  const [meetTime, setMeetTime] = useState("");
  const [profile, setProfile] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const [showCellList, setShowCellList] = useState(false);
  const [selectedCellId, setSelectedCellId] = useState("");
  const [selectedLeaderId, setSelectedLeaderId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdatingLeader, setIsUpdatingLeader] = useState(false);

  const {
    city,
    isLoadingLocation,
    neighborhood,
    neighborhoods,
    resetLocation,
    setNeighborhood,
    stateCode
  } = useCellLocation(API_BASE_URL, getSessionToken, setError);

  const selectedCellForLeaderChange = cells.find(
    (cell) => cell.id === selectedCellId
  );

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

  async function handleSaveCell(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    const isEditing = editingCellId !== null;
    const endpoint = isEditing
      ? `${API_BASE_URL}/api/cells/${editingCellId}`
      : `${API_BASE_URL}/api/cells`;

    setError(null);
    setSuccessMessage(null);
    setIsCreating(true);

    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify({
          city,
          leaderId,
          meetDay,
          meetTime,
          neighborhood,
          profile,
          name: profile,
          state: stateCode
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        method: isEditing ? "PUT" : "POST"
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(
          data.message ??
            (isEditing
              ? "Não foi possível atualizar a célula."
              : "Não foi possível cadastrar a célula.")
        );
        return;
      }

      resetLocation();
      setMeetDay("");
      setMeetTime("");
      setProfile("");
      setEditingCellId(null);
      setSuccessMessage(
        isEditing
          ? "Célula atualizada com sucesso."
          : "Célula cadastrada com sucesso."
      );
      await loadData();
    } catch {
      setError(
        isEditing
          ? "Não foi possível atualizar a célula agora."
          : "Não foi possível cadastrar a célula agora."
      );
    } finally {
      setIsCreating(false);
    }
  }

  function handleEditCell(cell: CellListItem) {
    setEditingCellId(cell.id);
    setShowCellList(false);
    setNeighborhood(
      cell.neighborhood || cell.region.split(" - ")[0] || ""
    );
    setMeetDay(cell.meetDay);
    setMeetTime(cell.meetTime);
    setProfile(cell.profile);
    setLeaderId(cell.leaderId);
    setError(null);
    setSuccessMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelEdit() {
    setEditingCellId(null);
    resetLocation();
    setMeetDay("");
    setMeetTime("");
    setProfile("");
    setLeaderId(members[0]?.id ?? "");
    setError(null);
    setSuccessMessage(null);
  }

  async function handleChangeLeader(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const token = getSessionToken();
    const selectedCell = cells.find(
      (cell) => cell.id === selectedCellId
    );

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    if (!selectedCell || !selectedLeaderId) {
      setError("Selecione a célula e o novo líder.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsUpdatingLeader(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/cells/${selectedCell.id}`,
        {
          body: JSON.stringify({
            city: selectedCell.city,
            leaderId: selectedLeaderId,
            meetDay: selectedCell.meetDay,
            meetTime: selectedCell.meetTime,
            name: selectedCell.name,
            neighborhood: selectedCell.neighborhood,
            profile: selectedCell.profile,
            region: selectedCell.region,
            state: selectedCell.state
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "PUT"
        }
      );

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(
          data.message ?? "Não foi possível alterar o líder da célula."
        );
        return;
      }

      setSelectedCellId("");
      setSelectedLeaderId("");
      setSuccessMessage("Líder da célula alterado com sucesso.");
      await loadData();
    } catch {
      setError("Não foi possível alterar o líder da célula agora.");
    } finally {
      setIsUpdatingLeader(false);
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
            onSubmit={handleSaveCell}
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
              {editingCellId ? "Editar célula" : "Cadastrar célula"}
            </h2>

            <div
              style={{
                display: "grid",
                gap: "14px",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
              }}
            >
              <CellLocationFields
                disabled={isLoadingLocation}
                neighborhood={neighborhood}
                neighborhoods={neighborhoods}
                onNeighborhoodChange={setNeighborhood}
              />
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
                  <option value="Sêniores / melhor idade">Sêniores / melhor idade</option>
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
                      {member.name} • {formatBrazilPhone(member.phone)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
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
                  opacity: isCreating || members.length === 0 ? 0.72 : 1,
                  padding: "13px 18px"
                }}
                type="submit"
              >
                {isCreating
                  ? editingCellId
                    ? "Salvando..."
                    : "Cadastrando..."
                  : editingCellId
                    ? "Salvar alterações"
                    : "Cadastrar célula"}
              </button>

              {!editingCellId ? (
                <button
                  onClick={() => setShowCellList((current) => !current)}
                  style={{ background: "transparent", border: "1px solid rgba(96, 165, 250, 0.38)", borderRadius: "14px", color: "#bfdbfe", cursor: "pointer", font: "inherit", fontWeight: 900, padding: "13px 18px" }}
                  type="button"
                >
                  {showCellList ? "Fechar lista" : "Editar célula"}
                </button>
              ) : null}

              {editingCellId ? (
                <button
                  disabled={isCreating}
                  onClick={handleCancelEdit}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(148, 163, 184, 0.38)",
                    borderRadius: "14px",
                    color: "#cbd5e1",
                    cursor: isCreating ? "not-allowed" : "pointer",
                    font: "inherit",
                    fontWeight: 900,
                    padding: "13px 18px"
                  }}
                  type="button"
                >
                  Cancelar edição
                </button>
              ) : null}
            </div>
          </form>

          <form
            onSubmit={handleChangeLeader}
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
              Alterar líder da célula
            </h2>

            <div style={{ display: "grid", gap: "16px" }}>
              <div
                style={{
                  alignItems: "start",
                  display: "grid",
                  gap: "14px",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(240px, 1fr))"
                }}
              >
                <label
                  style={{
                    color: "#cbd5e1",
                    display: "grid",
                    fontSize: "14px",
                    fontWeight: 800,
                    gap: "8px"
                  }}
                >
                  Célula
                  <select
                    onChange={(event) => {
                      const cellId = event.target.value;
                      const cell = cells.find(
                        (item) => item.id === cellId
                      );

                      setSelectedCellId(cellId);
                      setSelectedLeaderId(cell?.leaderId ?? "");
                    }}
                    required
                    style={{
                      border: "1px solid rgba(148, 163, 184, 0.38)",
                      borderRadius: "14px",
                      boxSizing: "border-box",
                      font: "inherit",
                      height: "48px",
                      padding: "0 14px",
                      width: "100%"
                    }}
                    value={selectedCellId}
                  >
                    <option value="">Selecione uma célula</option>
                    {cells.map((cell) => (
                      <option key={cell.id} value={cell.id}>
                        {cell.neighborhood || cell.region} | {cell.meetDay} às{" "}
                        {cell.meetTime}
                      </option>
                    ))}
                  </select>
                </label>

                <label
                  style={{
                    color: "#cbd5e1",
                    display: "grid",
                    fontSize: "14px",
                    fontWeight: 800,
                    gap: "8px"
                  }}
                >
                  Novo líder
                  <select
                    onChange={(event) =>
                      setSelectedLeaderId(event.target.value)
                    }
                    required
                    style={{
                      border: "1px solid rgba(148, 163, 184, 0.38)",
                      borderRadius: "14px",
                      boxSizing: "border-box",
                      font: "inherit",
                      height: "48px",
                      padding: "0 14px",
                      width: "100%"
                    }}
                    value={selectedLeaderId}
                  >
                    <option value="">Selecione um novo líder</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} • {formatBrazilPhone(member.phone)}
                      </option>
                    ))}
                  </select>
                </label>

                <label
                  style={{
                    color: "#cbd5e1",
                    display: "grid",
                    fontSize: "14px",
                    fontWeight: 800,
                    gap: "8px"
                  }}
                >
                  Telefone do novo líder
                  <input
                    readOnly
                    style={{
                      border: "1px solid rgba(148, 163, 184, 0.38)",
                      borderRadius: "14px",
                      boxSizing: "border-box",
                      font: "inherit",
                      height: "48px",
                      padding: "0 14px",
                      width: "100%"
                    }}
                    type="text"
                    value={
                      selectedLeaderId
                        ? formatBrazilPhone(
                            members.find(
                              (member) =>
                                member.id === selectedLeaderId
                            )?.phone
                          )
                        : ""
                    }
                  />
                </label>
              </div>


            </div>

            <button
              disabled={
                isUpdatingLeader ||
                cells.length === 0 ||
                members.length === 0
              }
              style={{
                background: "#2563eb",
                border: 0,
                borderRadius: "14px",
                color: "#ffffff",
                cursor:
                  isUpdatingLeader ||
                  cells.length === 0 ||
                  members.length === 0
                    ? "not-allowed"
                    : "pointer",
                font: "inherit",
                fontWeight: 900,
                justifySelf: "start",
                opacity:
                  isUpdatingLeader ||
                  cells.length === 0 ||
                  members.length === 0
                    ? 0.72
                    : 1,
                padding: "13px 18px"
              }}
              type="submit"
            >
              {isUpdatingLeader ? "Alterando..." : "Alterar líder"}
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

          <CellEditList
            apiBaseUrl={API_BASE_URL}
            getToken={getSessionToken}
            isOpen={showCellList}
            onSelectCell={handleEditCell}
          />
        </section>
      </main>
    </DashboardAuthGuard>
  );
}
