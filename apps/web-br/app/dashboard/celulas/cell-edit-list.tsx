"use client";

import styles from "./celulas.module.css";

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
      className={styles.manager}
    >
      <h2 className={styles.sectionTitle}>
        Gerenciar células
      </h2>

      <div
        className={styles.fields}
      >
        <select
          onChange={(event) =>
            changeFilter(
              setStatus,
              event.target.value as CellStatusFilter
            )
          }
          className={styles.input}
          aria-label="Status das células" value={status}
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
          className={styles.input}
          type="search"
          aria-label="Buscar por bairro" value={neighborhood}
        />

        <select
          onChange={(event) =>
            changeFilter(setProfile, event.target.value)
          }
          className={styles.input}
          aria-label="Perfil das células" value={profile}
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
          className={styles.input}
          type="search"
          aria-label="Buscar por líder" value={leader}
        />
      </div>

      {error ? (
        <p className={styles.error}>{error}</p>
      ) : null}

      {successMessage ? (
        <p className={styles.success}>
          {successMessage}
        </p>
      ) : null}

      {isLoading ? (
        <p className={styles.muted}>
          Carregando células...
        </p>
      ) : null}

      {!isLoading && !error && items.length === 0 ? (
        <p className={styles.muted}>
          Nenhuma célula encontrada.
        </p>
      ) : null}

      {!isLoading && items.length > 0 ? (
        <div className={styles.stack}>
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
                className={styles.cellRow}
              >
                <div className={styles.stack}>
                  <strong className={styles.strong}>
                    {cell.profile}
                  </strong>

                  <span
                    className={cell.status === "ACTIVE" ? styles.activeStatus : styles.archivedStatus}
                  >
                    {cell.status === "ACTIVE"
                      ? "Ativa"
                      : `Arquivada em ${formatArchivedAt(
                          cell.archivedAt
                        )}`}
                  </span>
                </div>

                <span className={styles.muted}>
                  {cell.neighborhood || cell.region}
                </span>

                <span className={styles.muted}>
                  {cell.leader.name}
                </span>

                <span
                  className={styles.muted}
                >
                  {cell.meetDay} • {cell.meetTime}
                </span>

                <div
                  className={styles.actions}
                >
                  <button
                    disabled={isAnyActionRunning}
                    onClick={() => onSelectCell(cell)}
                    className={styles.button}
                    type="button"
                  >
                    Editar
                  </button>

                  <button
                    disabled={isAnyActionRunning}
                    onClick={() => void handleStatusChange(cell)}
                    className={styles.button}
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
                      className={styles.danger}
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
        className={styles.actions}
      >
        <span className={styles.muted}>
          {pagination.total === 0
            ? "0 células"
            : `Página ${pagination.page} de ${pagination.totalPages} • ${pagination.total} células`}
        </span>

        <div className={styles.actions}>
          <button
            disabled={pagination.page <= 1 || isLoading}
            onClick={() =>
              setPagination((current) => ({
                ...current,
                page: current.page - 1
              }))
            }
            className={styles.button}
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
            className={styles.button}
            type="button"
          >
            Próxima
          </button>
        </div>
      </div>
    </section>
  );
}
