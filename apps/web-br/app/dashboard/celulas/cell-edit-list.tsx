"use client";

import { useEffect, useState } from "react";
import {
  searchCells,
  type CellListItem,
  type CellListPagination
} from "./cell-list-api";

type CellEditListProps = {
  apiBaseUrl: string;
  getToken: () => string | null;
  isOpen: boolean;
  onSelectCell: (cell: CellListItem) => void;
};

const fieldStyle = {
  border: "1px solid rgba(148, 163, 184, 0.38)",
  borderRadius: "14px",
  font: "inherit",
  padding: "12px 14px"
};

export function CellEditList({
  apiBaseUrl,
  getToken,
  isOpen,
  onSelectCell
}: CellEditListProps) {
  const [items, setItems] = useState<CellListItem[]>([]);
  const [pagination, setPagination] = useState<CellListPagination>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0
  });
  const [neighborhood, setNeighborhood] = useState("");
  const [profile, setProfile] = useState("");
  const [leader, setLeader] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    profile
  ]);

  function changeFilter(
    setter: (value: string) => void,
    value: string
  ) {
    setter(value);
    setPagination((current) => ({
      ...current,
      page: 1
    }));
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
        Selecionar célula para edição
      </h2>

      <div
        style={{
          display: "grid",
          gap: "12px",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))"
        }}
      >
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
          onChange={(event) => changeFilter(setProfile, event.target.value)}
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
          onChange={(event) => changeFilter(setLeader, event.target.value)}
          placeholder="Buscar por líder"
          style={fieldStyle}
          type="search"
          value={leader}
        />
      </div>

      {error ? (
        <p style={{ color: "#fecaca", margin: 0 }}>{error}</p>
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
          {items.map((cell) => (
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
                  "minmax(130px, 1fr) minmax(130px, 1fr) minmax(160px, 1fr) auto auto",
                padding: "12px 14px"
              }}
            >
              <strong style={{ color: "#ffffff" }}>
                {cell.profile}
              </strong>

              <span style={{ color: "#cbd5e1" }}>
                {cell.neighborhood || cell.region}
              </span>

              <span style={{ color: "#cbd5e1" }}>
                {cell.leader.name}
              </span>

              <span style={{ color: "#94a3b8", whiteSpace: "nowrap" }}>
                {cell.meetDay} • {cell.meetTime}
              </span>

              <button
                onClick={() => onSelectCell(cell)}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(96, 165, 250, 0.38)",
                  borderRadius: "999px",
                  color: "#bfdbfe",
                  cursor: "pointer",
                  font: "inherit",
                  fontSize: "12px",
                  fontWeight: 900,
                  padding: "7px 11px"
                }}
                type="button"
              >
                Editar
              </button>
            </div>
          ))}
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
