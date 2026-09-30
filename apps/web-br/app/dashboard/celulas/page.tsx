"use client";

import styles from "./celulas.module.css";

import { Network } from "lucide-react";
import { PageHeader } from "../ui";
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
        className={styles.page}
      >
        <section
          className={styles.container}
        >
          <PageHeader title="Células" description="Organize os encontros, os perfis e a liderança de cada grupo." icon={Network} />

          <form
            onSubmit={handleSaveCell}
            className={styles.form}
          >
            <h2 className={styles.sectionTitle}>
              {editingCellId ? "Editar célula" : "Cadastrar célula"}
            </h2>

            <div
              className={styles.fields}
            >
              <CellLocationFields
                disabled={isLoadingLocation}
                neighborhood={neighborhood}
                neighborhoods={neighborhoods}
                onNeighborhoodChange={setNeighborhood}
              />
              <label className={styles.field}>
                Dia de encontro
                <input
                  onChange={(event) => setMeetDay(event.target.value)}
                  required
                  className={styles.input}
                  type="text"
                  value={meetDay}
                />
              </label>

              <label className={styles.field}>
                Horário
                <input
                  onChange={(event) => setMeetTime(event.target.value)}
                  required
                  className={styles.input}
                  type="time"
                  value={meetTime}
                />
              </label>

              <label className={styles.field}>
                Tipo/perfil
                <select
                  onChange={(event) => setProfile(event.target.value)}
                  required
                  className={styles.input}
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

              <label className={styles.field}>
                Líder
                <select
                  onChange={(event) => setLeaderId(event.target.value)}
                  required
                  className={styles.input}
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

            <div className={styles.actions}>
              <button
                disabled={isCreating || members.length === 0}
                className={styles.primary}
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
                  className={styles.button}
                  type="button"
                >
                  {showCellList ? "Fechar lista" : "Gerenciar células"}
                </button>
              ) : null}

              {editingCellId ? (
                <button
                  disabled={isCreating}
                  onClick={handleCancelEdit}
                  className={styles.button}
                  type="button"
                >
                  Cancelar edição
                </button>
              ) : null}
            </div>
          </form>

          <form
            onSubmit={handleChangeLeader}
            className={styles.form}
          >
            <h2 className={styles.sectionTitle}>
              Alterar líder da célula
            </h2>

            <div className={styles.stack}>
              <div
                className={styles.fields}
              >
                <label
                  className={styles.field}
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
                    className={styles.input}
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
                  className={styles.field}
                >
                  Novo líder
                  <select
                    onChange={(event) =>
                      setSelectedLeaderId(event.target.value)
                    }
                    required
                    className={styles.input}
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
                  className={styles.field}
                >
                  Telefone do novo líder
                  <input
                    readOnly
                    className={styles.input}
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
              className={styles.primary}
              type="submit"
            >
              {isUpdatingLeader ? "Alterando..." : "Alterar líder"}
            </button>
          </form>

          {error ? (
            <p className={styles.error}>
              {error}
            </p>
          ) : null}

          {successMessage ? (
            <p className={styles.success}>
              {successMessage}
            </p>
          ) : null}

          <CellEditList
            apiBaseUrl={API_BASE_URL}
            getToken={getSessionToken}
            isOpen={showCellList}
            onStatusChange={loadData}
            onSelectCell={handleEditCell}
          />
        </section>
      </main>
    </DashboardAuthGuard>
  );
}
