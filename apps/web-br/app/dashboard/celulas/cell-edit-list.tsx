"use client";

import { useEffect, useState } from "react";
import {
  archiveCell,
  deleteCell,
  reactivateCell,
  searchCells,
  type CellListItem,
  type CellListPagination,
  type CellStatusFilter
} from "./cell-list-api";

type CellEditListProps = {
  apiBaseUrl: string;
  getToken: () => string | null;
  isOpen: boolean;
  onSelectCell: (cell: CellListItem) => void;
  onStatusChange: () => void | Promise<void>;
};

const fieldStyle = {
  border: "1px solid rgba(148, 163, 184, 0.38)",
  borderRadius: "14px",
  font: "inherit",
  padding: "12px 14px"
};

function formatArchivedAt(archivedAt: string | null): string {
  if (!archivedAt) {
    return "";
  }

  return new Date(archivedAt).toLocaleString("pt-BR");
}

function getSessionRole(): string | null {
  const storedSession = localStorage.getItem(
    "sistema-igrejas.session"
  );

  if (!storedSession) {
    return null;
  }

  try {
    const session = JSON.parse(storedSession) as {
      user?: {
        role?: string;
      };
    };

    return session.user?.role ?? null;
  } catch {
    return null;
  }
}

export function CellEditList({
  apiBaseUrl,
  getToken,
  isOpen,
  onSelectCell,
  onStatusChange
}: CellEditListProps) {
  const [items, setItems] = useState<CellListItem[]>([]);
  const [pagination, setPagination] = useState<CellListPagination>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0
  });
  const [status, setStatus] = useState<CellStatusFilter>("ACTIVE");
  const [neighborhood, setNeighborhood] = useState("");
  const [profile, setProfile] = useState("");
  const [leader, setLeader] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [changingStatusCellId, setChangingStatusCellId] = useState<
    string | null
  >(null);
  const [deletingCellId, setDeletingCellId] = useState<
    string | null
  >(null);
  const [canDelete, setCanDelete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setCanDelete(getSessionRole() === "SUPER_ADMIN");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const token = getToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setError(null);

    void searchCells(apiBaseUrl, token, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      status,
      neighborhood,
      profile,
      leader
    })
      .then((response) => {
        if (!cancelled) {
          setItems(response.items);
          setPagination(response.pagination);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível pesquisar as células."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    apiBaseUrl,
    getToken,
    isOpen,
    leader,
    neighborhood,
    pagination.page,
    pagination.pageSize,
    profile,
    refreshVersion,
    status
  ]);

  function changeFilter<T>(
    setter: (value: T) => void,
    value: T
  ) {
    setter(value);
    setPagination((current) => ({
      ...current,
      page: 1
    }));
  }

  async function handleStatusChange(cell: CellListItem) {
    const token = getToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    setChangingStatusCellId(cell.id);
    setError(null);
    setSuccessMessage(null);

    try {
      if (cell.status === "ACTIVE") {
        await archiveCell(apiBaseUrl, token, cell.id);
        setSuccessMessage("Célula arquivada com sucesso.");
      } else {
        await reactivateCell(apiBaseUrl, token, cell.id);
        setSuccessMessage("Célula reativada com sucesso.");
      }

      await onStatusChange();
      setRefreshVersion((current) => current + 1);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Não foi possível alterar o status da célula."
      );
    } finally {
      setChangingStatusCellId(null);
    }
  }

  async function handleDeleteCell(cell: CellListItem) {
    const confirmed = window.confirm(
      "Excluir esta célula definitivamente? Depois será necessário cadastrá-la novamente."
    );

    if (!confirmed) {
      return;
    }

    const token = getToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    setDeletingCellId(cell.id);
    setError(null);
    setSuccessMessage(null);

    try {
      await deleteCell(apiBaseUrl, token, cell.id);

      setSuccessMessage("Célula excluída com sucesso.");
      setPagination((current) => ({
        ...current,
        page:
          items.length === 1 && current.page > 1
            ? current.page - 1
            : current.page
      }));
      await onStatusChange();
      setRefreshVersion((current) => current + 1);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Não foi possível excluir a célula."
      );
    } finally {
      setDeletingCellId(null);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <section
      style={{
        background: "rgba(15, 23, 42, 0.58)",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        borderRadius: "22px",
        display: "grid",
        gap: "16px",
        padding: "22px"
      }}
    >
      <h2 style={{ color: "#ffffff", fontSize: "20px", margin: 0 }}>
        Gerenciar células
      </h2>

      <div
        style={{
          display: "grid",
          gap: "12px",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))"
        }}
      >
        <select
          onChange={(event) =>
            changeFilter(
              setStatus,
              event.target.value as CellStatusFilter
            )
          }
          style={fieldStyle}
          value={status}
        >
          <option value="ACTIVE">Ativas</option>
          <option value="ARCHIVED">Arquivadas</option>
          <option value="ALL">Todas</option>
        </select>

        <input
          onChange={(event) =>
            changeFilter(setNeighborhood, event.target.value)
          }
          placeholder="Buscar por bairro"
          style={fieldStyle}
          type="search"
          value={neighborhood}
        />

        <select
          onChange={(event) =>
            changeFilter(setProfile, event.target.value)
          }
          style={fieldStyle}
          value={profile}
        >
          <option value="">Todos os perfis</option>
          <option value="Famílias">Famílias</option>
          <option value="Jovens">Jovens</option>
          <option value="Mulheres">Mulheres</option>
          <option value="Homens">Homens</option>
          <option value="Adolescentes">Adolescentes</option>
          <option value="Sêniores / melhor idade">
            Sêniores / melhor idade
          </option>
        </select>

        <input
          onChange={(event) =>
            changeFilter(setLeader, event.target.value)
          }
          placeholder="Buscar por líder"
          style={fieldStyle}
          type="search"
          value={leader}
        />
      </div>

      {error ? (
        <p style={{ color: "#fecaca", margin: 0 }}>{error}</p>
      ) : null}

      {successMessage ? (
        <p style={{ color: "#bbf7d0", margin: 0 }}>
          {successMessage}
        </p>
      ) : null}

      {isLoading ? (
        <p style={{ color: "#cbd5e1", margin: 0 }}>
          Carregando células...
        </p>
      ) : null}

      {!isLoading && !error && items.length === 0 ? (
        <p style={{ color: "#cbd5e1", margin: 0 }}>
          Nenhuma célula encontrada.
        </p>
      ) : null}

      {!isLoading && items.length > 0 ? (
        <div style={{ display: "grid", gap: "8px" }}>
          {items.map((cell) => {
            const isChangingStatus =
              changingStatusCellId === cell.id;
            const isDeleting = deletingCellId === cell.id;
            const isAnyActionRunning =
              changingStatusCellId !== null ||
              deletingCellId !== null;

            return (
              <div
                key={cell.id}
                style={{
                  alignItems: "center",
                  background: "rgba(15, 23, 42, 0.82)",
                  border: "1px solid rgba(148, 163, 184, 0.16)",
                  borderRadius: "14px",
                  display: "grid",
                  gap: "12px",
                  gridTemplateColumns:
                    "minmax(150px, 1fr) minmax(130px, 1fr) minmax(160px, 1fr) auto auto",
                  padding: "12px 14px"
                }}
              >
                <div style={{ display: "grid", gap: "4px" }}>
                  <strong style={{ color: "#ffffff" }}>
                    {cell.profile}
                  </strong>

                  <span
                    style={{
                      color:
                        cell.status === "ACTIVE"
                          ? "#bbf7d0"
                          : "#fde68a",
                      fontSize: "12px",
                      fontWeight: 800
                    }}
                  >
                    {cell.status === "ACTIVE"
                      ? "Ativa"
                      : `Arquivada em ${formatArchivedAt(
                          cell.archivedAt
                        )}`}
                  </span>
                </div>

                <span style={{ color: "#cbd5e1" }}>
                  {cell.neighborhood || cell.region}
                </span>

                <span style={{ color: "#cbd5e1" }}>
                  {cell.leader.name}
                </span>

                <span
                  style={{
                    color: "#94a3b8",
                    whiteSpace: "nowrap"
                  }}
                >
                  {cell.meetDay} • {cell.meetTime}
                </span>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    justifyContent: "flex-end"
                  }}
                >
                  <button
                    disabled={isAnyActionRunning}
                    onClick={() => onSelectCell(cell)}
                    style={{
                      background: "transparent",
                      border:
                        "1px solid rgba(96, 165, 250, 0.38)",
                      borderRadius: "999px",
                      color: "#bfdbfe",
                      cursor: isAnyActionRunning
                        ? "not-allowed"
                        : "pointer",
                      font: "inherit",
                      fontSize: "12px",
                      fontWeight: 900,
                      padding: "7px 11px"
                    }}
                    type="button"
                  >
                    Editar
                  </button>

                  <button
                    disabled={isAnyActionRunning}
                    onClick={() => void handleStatusChange(cell)}
                    style={{
                      background: "transparent",
                      border:
                        cell.status === "ACTIVE"
                          ? "1px solid rgba(251, 191, 36, 0.48)"
                          : "1px solid rgba(74, 222, 128, 0.48)",
                      borderRadius: "999px",
                      color:
                        cell.status === "ACTIVE"
                          ? "#fde68a"
                          : "#bbf7d0",
                      cursor: isAnyActionRunning
                        ? "not-allowed"
                        : "pointer",
                      font: "inherit",
                      fontSize: "12px",
                      fontWeight: 900,
                      padding: "7px 11px"
                    }}
                    type="button"
                  >
                    {isChangingStatus
                      ? "Salvando..."
                      : cell.status === "ACTIVE"
                        ? "Arquivar"
                        : "Reativar"}
                  </button>

                  {canDelete ? (
                    <button
                      disabled={isAnyActionRunning}
                      onClick={() => void handleDeleteCell(cell)}
                      style={{
                        background: "transparent",
                        border:
                          "1px solid rgba(248, 113, 113, 0.48)",
                        borderRadius: "999px",
                        color: "#fecaca",
                        cursor: isAnyActionRunning
                          ? "not-allowed"
                          : "pointer",
                        font: "inherit",
                        fontSize: "12px",
                        fontWeight: 900,
                        padding: "7px 11px"
                      }}
                      type="button"
                    >
                      {isDeleting ? "Excluindo..." : "Excluir"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          justifyContent: "space-between"
        }}
      >
        <span style={{ color: "#94a3b8", fontSize: "13px" }}>
          {pagination.total === 0
            ? "0 células"
            : `Página ${pagination.page} de ${pagination.totalPages} • ${pagination.total} células`}
        </span>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            disabled={pagination.page <= 1 || isLoading}
            onClick={() =>
              setPagination((current) => ({
                ...current,
                page: current.page - 1
              }))
            }
            style={{
              border: "1px solid rgba(148, 163, 184, 0.38)",
              borderRadius: "10px",
              cursor:
                pagination.page <= 1 || isLoading
                  ? "not-allowed"
                  : "pointer",
              font: "inherit",
              padding: "8px 12px"
            }}
            type="button"
          >
            Anterior
          </button>

          <button
            disabled={
              pagination.page >= pagination.totalPages || isLoading
            }
            onClick={() =>
              setPagination((current) => ({
                ...current,
                page: current.page + 1
              }))
            }
            style={{
              border: "1px solid rgba(148, 163, 184, 0.38)",
              borderRadius: "10px",
              cursor:
                pagination.page >= pagination.totalPages || isLoading
                  ? "not-allowed"
                  : "pointer",
              font: "inherit",
              padding: "8px 12px"
            }}
            type="button"
          >
            Próxima
          </button>
        </div>
      </div>
    </section>
  );
}
