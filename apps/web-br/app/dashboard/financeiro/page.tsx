"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { DashboardAuthGuard } from "../dashboard-auth-guard";

type LoginSession = {
  token: string;
};

type TransactionType = "TITHE" | "OFFERING" | "EVENT" | "EXPENSE" | "OTHER";
type TransactionDirection = "IN" | "OUT";
type PaymentMethod = "PIX" | "CARD" | "CASH" | "BOLETO";

type Transaction = {
  id: string;
  type: TransactionType;
  direction: TransactionDirection;
  amount: number | string;
  method: PaymentMethod;
  costCenter: string;
  asaasId: string | null;
  nfseId: string | null;
  at: string;
  createdAt: string;
  updatedAt: string;
  person: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  } | null;
  event: {
    id: string;
    title: string;
    slug: string;
    date: string;
  } | null;
};

type FinancialSummary = {
  income: number | string;
  expense: number | string;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333";

const transactionTypeLabels: Record<TransactionType, string> = {
  TITHE: "Dízimo",
  OFFERING: "Oferta",
  EVENT: "Evento",
  EXPENSE: "Despesa",
  OTHER: "Outro"
};

const transactionDirectionLabels: Record<TransactionDirection, string> = {
  IN: "Entrada",
  OUT: "Saída"
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  PIX: "PIX",
  CARD: "Cartão",
  CASH: "Dinheiro",
  BOLETO: "Boleto"
};

function formatMoney(value: number | string) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency"
  }).format(Number(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short"
  }).format(new Date(value));
}

function getSummaryBalance(summary: FinancialSummary) {
  return Number(summary.income) - Number(summary.expense);
}

function formatDateInput(value: string) {
  return value.slice(0, 10);
}

export default function FinanceiroPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<FinancialSummary>({
    income: 0,
    expense: 0
  });
  const [type, setType] = useState<TransactionType>("TITHE");
  const [direction, setDirection] = useState<TransactionDirection>("IN");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("PIX");
  const [costCenter, setCostCenter] = useState("Geral");
  const [at, setAt] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterDirection, setFilterDirection] = useState("");
  const [filterMethod, setFilterMethod] = useState("");
  const [filterCostCenter, setFilterCostCenter] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);

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

  function buildFinancialQuery() {
    const params = new URLSearchParams();

    if (filterType) {
      params.set("type", filterType);
    }

    if (filterDirection) {
      params.set("direction", filterDirection);
    }

    if (filterMethod) {
      params.set("method", filterMethod);
    }

    if (filterCostCenter.trim()) {
      params.set("costCenter", filterCostCenter.trim());
    }

    if (filterFrom) {
      params.set("from", new Date(`${filterFrom}T00:00:00.000Z`).toISOString());
    }

    if (filterTo) {
      params.set("to", new Date(`${filterTo}T23:59:59.999Z`).toISOString());
    }

    const query = params.toString();

    return query ? `?${query}` : "";
  }

  async function loadFinancialData(queryOverride?: string) {
    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const financialQuery = queryOverride ?? buildFinancialQuery();

      const [transactionsResponse, summaryResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/financial/transactions${financialQuery}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }),
        fetch(`${API_BASE_URL}/api/financial/summary${financialQuery}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
      ]);

      if (!transactionsResponse.ok) {
        const data = (await transactionsResponse.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível carregar as transações.");
        return;
      }

      if (!summaryResponse.ok) {
        const data = (await summaryResponse.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível carregar o resumo financeiro.");
        return;
      }

      const transactionsData = (await transactionsResponse.json()) as Transaction[];
      const summaryData = (await summaryResponse.json()) as FinancialSummary;

      setTransactions(transactionsData);
      setSummary(summaryData);
    } catch {
      setError("Não foi possível carregar o financeiro agora.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadFinancialData();
  }

  async function clearFinancialFilters() {
    setFilterType("");
    setFilterDirection("");
    setFilterMethod("");
    setFilterCostCenter("");
    setFilterFrom("");
    setFilterTo("");

    await loadFinancialData("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const requestUrl = editingTransactionId
        ? `${API_BASE_URL}/api/financial/transactions/${editingTransactionId}`
        : `${API_BASE_URL}/api/financial/transactions`;

      const response = await fetch(requestUrl, {
        body: JSON.stringify({
          amount: Number(amount),
          at: at ? new Date(`${at}T00:00:00.000Z`).toISOString() : undefined,
          costCenter,
          direction,
          method,
          type
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        method: editingTransactionId ? "PATCH" : "POST"
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível lançar a transação.");
        return;
      }

      setAmount("");
      setCostCenter("Geral");
      setAt("");
      setEditingTransactionId(null);
      setSuccessMessage(editingTransactionId ? "Transação corrigida com sucesso." : "Transação lançada com sucesso.");
      await loadFinancialData();
    } catch {
      setError("Não foi possível lançar a transação agora.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEditingTransaction(transaction: Transaction) {
    setEditingTransactionId(transaction.id);
    setType(transaction.type);
    setDirection(transaction.direction);
    setAmount(String(Number(transaction.amount)));
    setMethod(transaction.method);
    setCostCenter(transaction.costCenter);
    setAt(formatDateInput(transaction.at));
    setError(null);
    setSuccessMessage(null);
  }

  function cancelEditingTransaction() {
    setEditingTransactionId(null);
    setType("TITHE");
    setDirection("IN");
    setAmount("");
    setMethod("PIX");
    setCostCenter("Geral");
    setAt("");
    setError(null);
    setSuccessMessage(null);
  }

  useEffect(() => {
    void loadFinancialData();
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
              Voltar ao painel
            </Link>


          </div>

          <section
            style={{
              display: "grid",
              gap: "14px",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))"
            }}
          >
            <article
              style={{
                background: "rgba(22, 163, 74, 0.14)",
                border: "1px solid rgba(74, 222, 128, 0.24)",
                borderRadius: "20px",
                padding: "18px"
              }}
            >
              <p style={{ color: "#bbf7d0", fontSize: "13px", fontWeight: 900, margin: "0 0 8px" }}>
                Entradas
              </p>
              <strong style={{ color: "#ffffff", fontSize: "24px" }}>
                {formatMoney(summary.income)}
              </strong>
            </article>

            <article
              style={{
                background: "rgba(239, 68, 68, 0.14)",
                border: "1px solid rgba(248, 113, 113, 0.24)",
                borderRadius: "20px",
                padding: "18px"
              }}
            >
              <p style={{ color: "#fecaca", fontSize: "13px", fontWeight: 900, margin: "0 0 8px" }}>
                Saídas
              </p>
              <strong style={{ color: "#ffffff", fontSize: "24px" }}>
                {formatMoney(summary.expense)}
              </strong>
            </article>

            <article
              style={{
                background: "rgba(37, 99, 235, 0.14)",
                border: "1px solid rgba(96, 165, 250, 0.24)",
                borderRadius: "20px",
                padding: "18px"
              }}
            >
              <p style={{ color: "#bfdbfe", fontSize: "13px", fontWeight: 900, margin: "0 0 8px" }}>
                Saldo
              </p>
              <strong style={{ color: "#ffffff", fontSize: "24px" }}>
                {formatMoney(getSummaryBalance(summary))}
              </strong>
            </article>
          </section>


          <form
            onSubmit={handleFilterSubmit}
            style={{
              background: "rgba(15, 23, 42, 0.72)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "22px",
              display: "grid",
              gap: "16px",
              padding: "22px"
            }}
          >
            <div>
              <h2 style={{ color: "#ffffff", fontSize: "20px", margin: "0 0 6px" }}>
                Filtros financeiros
              </h2>
              <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>
                Filtre lançamentos e resumo por tipo, direção, método, centro de custo e período.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gap: "14px",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))"
              }}
            >
              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Tipo
                <select
                  onChange={(event) => setFilterType(event.target.value)}
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  value={filterType}
                >
                  <option value="">Todos</option>
                  <option value="TITHE">Dízimo</option>
                  <option value="OFFERING">Oferta</option>
                  <option value="EVENT">Evento</option>
                  <option value="EXPENSE">Despesa</option>
                  <option value="OTHER">Outro</option>
                </select>
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Direção
                <select
                  onChange={(event) => setFilterDirection(event.target.value)}
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  value={filterDirection}
                >
                  <option value="">Todas</option>
                  <option value="IN">Entrada</option>
                  <option value="OUT">Saída</option>
                </select>
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Método
                <select
                  onChange={(event) => setFilterMethod(event.target.value)}
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  value={filterMethod}
                >
                  <option value="">Todos</option>
                  <option value="PIX">PIX</option>
                  <option value="CARD">Cartão</option>
                  <option value="CASH">Dinheiro</option>
                  <option value="BOLETO">Boleto</option>
                </select>
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Centro de custo
                <input
                  onChange={(event) => setFilterCostCenter(event.target.value)}
                  placeholder="Ex.: Geral, Eventos, Missões"
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  type="text"
                  value={filterCostCenter}
                />
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                De
                <input
                  onChange={(event) => setFilterFrom(event.target.value)}
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  type="date"
                  value={filterFrom}
                />
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Até
                <input
                  onChange={(event) => setFilterTo(event.target.value)}
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  type="date"
                  value={filterTo}
                />
              </label>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              <button
                disabled={isLoading}
                style={{
                  background: "#2563eb",
                  border: 0,
                  borderRadius: "14px",
                  color: "#ffffff",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  font: "inherit",
                  fontWeight: 900,
                  opacity: isLoading ? 0.72 : 1,
                  padding: "13px 18px"
                }}
                type="submit"
              >
                Aplicar filtros
              </button>

              <button
                disabled={isLoading}
                onClick={clearFinancialFilters}
                style={{
                  background: "rgba(15, 23, 42, 0.72)",
                  border: "1px solid rgba(148, 163, 184, 0.32)",
                  borderRadius: "14px",
                  color: "#e5e7eb",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  font: "inherit",
                  fontWeight: 900,
                  opacity: isLoading ? 0.72 : 1,
                  padding: "13px 18px"
                }}
                type="button"
              >
                Limpar filtros
              </button>
            </div>
          </form>

          <form
            onSubmit={handleSubmit}
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
              {editingTransactionId ? "Corrigir lançamento" : "Novo lançamento"}
            </h2>

            <div
              style={{
                display: "grid",
                gap: "14px",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))"
              }}
            >
              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Tipo
                <select
                  onChange={(event) => setType(event.target.value as TransactionType)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  value={type}
                >
                  <option value="TITHE">Dízimo</option>
                  <option value="OFFERING">Oferta</option>
                  <option value="EVENT">Evento</option>
                  <option value="EXPENSE">Despesa</option>
                  <option value="OTHER">Outro</option>
                </select>
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Direção
                <select
                  onChange={(event) => setDirection(event.target.value as TransactionDirection)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  value={direction}
                >
                  <option value="IN">Entrada</option>
                  <option value="OUT">Saída</option>
                </select>
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Método
                <select
                  onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  value={method}
                >
                  <option value="PIX">PIX</option>
                  <option value="CARD">Cartão</option>
                  <option value="CASH">Dinheiro</option>
                  <option value="BOLETO">Boleto</option>
                </select>
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Valor
                <input
                  min="0.01"
                  onChange={(event) => setAmount(event.target.value)}
                  required
                  step="0.01"
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  type="number"
                  value={amount}
                />
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Centro de custo
                <input
                  onChange={(event) => setCostCenter(event.target.value)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  type="text"
                  value={costCenter}
                />
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Data
                <input
                  onChange={(event) => setAt(event.target.value)}
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  type="date"
                  value={at}
                />
              </label>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              <button
              disabled={isSubmitting}
              style={{
                background: "#2563eb",
                border: 0,
                borderRadius: "14px",
                color: "#ffffff",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                font: "inherit",
                fontWeight: 900,
                justifySelf: "start",
                opacity: isSubmitting ? 0.72 : 1,
                padding: "13px 18px"
              }}
              type="submit"
            >
              {isSubmitting
                ? editingTransactionId
                  ? "Salvando correção..."
                  : "Lançando..."
                : editingTransactionId
                  ? "Salvar correção"
                  : "Lançar transação"}
              </button>

              {editingTransactionId ? (
                <button
                  disabled={isSubmitting}
                  onClick={cancelEditingTransaction}
                  style={{
                    background: "rgba(15, 23, 42, 0.72)",
                    border: "1px solid rgba(148, 163, 184, 0.32)",
                    borderRadius: "14px",
                    color: "#e5e7eb",
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    font: "inherit",
                    fontWeight: 900,
                    opacity: isSubmitting ? 0.72 : 1,
                    padding: "13px 18px"
                  }}
                  type="button"
                >
                  Cancelar edição
                </button>
              ) : null}
            </div>
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
              Transações
            </h2>

            {isLoading ? (
              <p style={{ color: "#cbd5e1", margin: 0 }}>Carregando financeiro...</p>
            ) : null}

            {!isLoading && transactions.length === 0 ? (
              <p style={{ color: "#cbd5e1", margin: 0 }}>
                Nenhuma transação lançada ainda.
              </p>
            ) : null}

            {!isLoading && transactions.length > 0 ? (
              <div style={{ display: "grid", gap: "10px" }}>
                {transactions.map((transaction) => (
                  <article
                    key={transaction.id}
                    style={{
                      background: "rgba(15, 23, 42, 0.82)",
                      border: "1px solid rgba(148, 163, 184, 0.16)",
                      borderRadius: "18px",
                      display: "grid",
                      gap: "8px",
                      padding: "14px"
                    }}
                  >
                    <div style={{ alignItems: "start", display: "flex", gap: "12px", justifyContent: "space-between" }}>
                      <div>
                        <h3 style={{ color: "#ffffff", fontSize: "16px", margin: "0 0 4px" }}>
                          {transactionTypeLabels[transaction.type]} - {transactionDirectionLabels[transaction.direction]}
                        </h3>

                        <p style={{ color: "#cbd5e1", fontSize: "14px", margin: 0 }}>
                          {paymentMethodLabels[transaction.method]} - {transaction.costCenter} - {formatDate(transaction.at)}
                        </p>
                      </div>

                      <div style={{ alignItems: "end", display: "grid", gap: "8px", justifyItems: "end" }}>
                        <strong style={{ color: transaction.direction === "IN" ? "#bbf7d0" : "#fecaca", fontSize: "16px", whiteSpace: "nowrap" }}>
                          {transaction.direction === "IN" ? "+" : "-"} {formatMoney(transaction.amount)}
                        </strong>

                      <button
                        onClick={() => startEditingTransaction(transaction)}
                        style={{ background: "rgba(37, 99, 235, 0.16)", border: "1px solid rgba(96, 165, 250, 0.32)", borderRadius: "999px", color: "#bfdbfe", cursor: "pointer", font: "inherit", fontSize: "12px", fontWeight: 900, padding: "8px 12px" }}
                        type="button"
                      >
                        Editar
                      </button>
                      </div>
                    </div>

                    {transaction.person || transaction.event || transaction.asaasId || transaction.nfseId ? (
                      <p style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.5, margin: 0 }}>
                        {transaction.person ? `Pessoa: ${transaction.person.name}. ` : ""}
                        {transaction.event ? `Evento: ${transaction.event.title}. ` : ""}
                        {transaction.asaasId ? `Asaas: ${transaction.asaasId}. ` : ""}
                        {transaction.nfseId ? `NFS-e: ${transaction.nfseId}.` : ""}
                      </p>
                    ) : null}
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
