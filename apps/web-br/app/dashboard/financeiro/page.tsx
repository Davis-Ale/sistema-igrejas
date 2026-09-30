"use client";

import { PageHeader } from "../ui";
import ui from "../ui.module.css";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Wallet, Plus, SlidersHorizontal, ReceiptText, Pencil, Ban, RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";
import styles from "./financeiro.module.css";
import { DashboardAuthGuard } from "../dashboard-auth-guard";

type LoginSession = {
  token: string;
};

type TransactionType = "TITHE" | "OFFERING" | "EVENT" | "EXPENSE" | "OTHER";
type TransactionDirection = "IN" | "OUT";
type TransactionStatus = "ACTIVE" | "CANCELLED" | "REVERSED";
type PaymentMethod = "PIX" | "CARD" | "CASH" | "BOLETO";

type Transaction = {
  id: string;
  type: TransactionType;
  direction: TransactionDirection;
  status: TransactionStatus;
  amount: number | string;
  method: PaymentMethod;
  costCenter: string;
  asaasId: string | null;
  nfseId: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancelReason: string | null;
  reversalTransactionId: string | null;
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

const transactionStatusLabels: Record<TransactionStatus, string> = {
  ACTIVE: "Ativo",
  CANCELLED: "Cancelado",
  REVERSED: "Estornado"
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function getSummaryBalance(summary: FinancialSummary) {
  return Number(summary.income) - Number(summary.expense);
}

function formatDateInput(value: string) {
  return value.slice(0, 10);
}

function getStatusColor(status: TransactionStatus) {
  if (status === "ACTIVE") {
    return "#bbf7d0";
  }

  if (status === "CANCELLED") {
    return "#fecaca";
  }

  return "#bfdbfe";
}

export default function FinanceiroPage() {
  const entryRef = useRef<HTMLFormElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);

  function focusEntry() {
    entryRef.current?.scrollIntoView({ block: "start" });
    amountInputRef.current?.focus({ preventScroll: true });
  }

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
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMethod, setFilterMethod] = useState("");
  const [filterCostCenter, setFilterCostCenter] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingTransactionId, setProcessingTransactionId] = useState<string | null>(null);
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

    if (filterStatus) {
      params.set("status", filterStatus);
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
    setFilterStatus("");
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

  async function handleTransactionControl(transaction: Transaction, action: "cancel" | "reverse") {
    if (transaction.status !== "ACTIVE") {
      setError("Apenas lançamentos ativos podem ser cancelados ou estornados.");
      return;
    }

    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    const actionLabel = action === "cancel" ? "cancelamento" : "estorno";
    const reason = window.prompt(`Informe o motivo do ${actionLabel}:`);

    if (!reason?.trim()) {
      setError("O motivo é obrigatório para cancelar ou estornar um lançamento.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setProcessingTransactionId(transaction.id);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/financial/transactions/${transaction.id}/${action}`,
        {
          body: JSON.stringify({
            reason: reason.trim()
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? `Não foi possível concluir o ${actionLabel}.`);
        return;
      }

      setEditingTransactionId(null);
      setSuccessMessage(action === "cancel" ? "Lançamento cancelado com sucesso." : "Lançamento estornado com sucesso.");
      await loadFinancialData();
    } catch {
      setError(`Não foi possível concluir o ${actionLabel} agora.`);
    } finally {
      setProcessingTransactionId(null);
    }
  }

  function startEditingTransaction(transaction: Transaction) {
    if (transaction.status !== "ACTIVE") {
      setError("Apenas lançamentos ativos podem ser corrigidos.");
      return;
    }

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
      <main className={`${ui.page} ${styles.page}`}>
        <div className={styles.container}>
          <PageHeader title="Financeiro" description="Acompanhe as movimentações e organize os lançamentos da igreja." icon={Wallet} action={<button className={styles.primaryButton} type="button" onClick={focusEntry}><Plus size={17} aria-hidden="true" />{editingTransactionId ? "Continuar edição" : "Novo lançamento"}</button>} />

          {error && <div className={styles.errorAlert} role="alert"><AlertCircle size={19} aria-hidden="true" /><p>{error}</p></div>}
          {successMessage && <div className={styles.successAlert} role="status"><CheckCircle2 size={19} aria-hidden="true" /><p>{successMessage}</p></div>}

          <section className={styles.summaryGrid} aria-label="Resumo financeiro" aria-busy={isLoading}>
            <article className={styles.summaryCard} data-tone="income">
              <div className={styles.summaryTop}><span>Entradas</span><span className={styles.metricIcon}><ArrowDownLeft size={20} aria-hidden="true" /></span></div>
              <strong>{isLoading ? "—" : formatMoney(summary.income)}</strong><p>Total de entradas na consulta</p>
            </article>
            <article className={styles.summaryCard} data-tone="expense">
              <div className={styles.summaryTop}><span>Saídas</span><span className={styles.metricIcon}><ArrowUpRight size={20} aria-hidden="true" /></span></div>
              <strong>{isLoading ? "—" : formatMoney(summary.expense)}</strong><p>Total de saídas na consulta</p>
            </article>
            <article className={styles.summaryCard} data-tone="balance">
              <div className={styles.summaryTop}><span>Saldo</span><span className={styles.metricIcon}><Wallet size={20} aria-hidden="true" /></span></div>
              <strong>{isLoading ? "—" : formatMoney(getSummaryBalance(summary))}</strong><p>Entradas menos saídas na consulta</p>
            </article>
          </section>

          <div className={styles.workspace}>
            <aside className={styles.entryColumn} aria-label="Lançamento financeiro">
              <form ref={entryRef} onSubmit={handleSubmit} className={styles.entryPanel} id="financial-entry">
                <div className={styles.panelHeading}>
                  <span className={styles.sectionIcon}>{editingTransactionId ? <Pencil size={19} aria-hidden="true" /> : <Plus size={20} aria-hidden="true" />}</span>
                  <div><h2>{editingTransactionId ? "Corrigir lançamento" : "Novo lançamento"}</h2><p>{editingTransactionId ? "Revise os dados antes de salvar." : "Registre uma movimentação."}</p></div>
                </div>
                {editingTransactionId && <p className={styles.editNotice} role="status">Editando um lançamento existente.</p>}
                <div className={styles.entryBody}>
                  <fieldset className={styles.directionPicker}>
                    <legend className={styles.srOnly}>Direção do lançamento</legend>
                    <label className={styles.directionChoice} data-direction="IN"><input className={styles.srOnly} type="radio" name="direction" value="IN" checked={direction === "IN"} onChange={() => setDirection("IN")} required /><ArrowDownLeft size={17} aria-hidden="true" /> Entrada</label>
                    <label className={styles.directionChoice} data-direction="OUT"><input className={styles.srOnly} type="radio" name="direction" value="OUT" checked={direction === "OUT"} onChange={() => setDirection("OUT")} required /><ArrowUpRight size={17} aria-hidden="true" /> Saída</label>
                  </fieldset>
                  <label className={styles.amountField}>
                    <span>Valor do lançamento</span>
                    <span className={styles.amountControl}><span aria-hidden="true">R$</span><input ref={amountInputRef} min="0.01" onChange={(event) => setAmount(event.target.value)} required step="0.01" type="number" inputMode="decimal" value={amount} placeholder="0,00" aria-label="Valor do lançamento em reais" /></span>
                  </label>
                  <div className={styles.entryFields}>
                    <label className={styles.field}><span>Tipo</span><select onChange={(event) => setType(event.target.value as TransactionType)} required value={type}>
                      <option value="TITHE">Dízimo</option><option value="OFFERING">Oferta</option><option value="EVENT">Evento</option><option value="EXPENSE">Despesa</option><option value="OTHER">Outro</option>
                    </select></label>
                    <label className={styles.field}><span>Método</span><select onChange={(event) => setMethod(event.target.value as PaymentMethod)} required value={method}>
                      <option value="PIX">PIX</option><option value="CARD">Cartão</option><option value="CASH">Dinheiro</option><option value="BOLETO">Boleto</option>
                    </select></label>
                    <label className={[styles.field, styles.fullField].join(" ")}><span>Centro de custo</span><input onChange={(event) => setCostCenter(event.target.value)} required type="text" value={costCenter} /></label>
                    <label className={[styles.field, styles.fullField].join(" ")}><span>Data <small>Opcional</small></span><input onChange={(event) => setAt(event.target.value)} type="date" value={at} /></label>
                  </div>
                </div>
                <div className={styles.entryFooter}>
                  <button disabled={isSubmitting} className={styles.primaryButton} type="submit">
                    {isSubmitting ? <span className={styles.spinner} aria-hidden="true" /> : <CheckCircle2 size={17} aria-hidden="true" />}
                    {isSubmitting ? editingTransactionId ? "Salvando correção..." : "Lançando..." : editingTransactionId ? "Salvar correção" : "Lançar transação"}
                  </button>
                  {editingTransactionId && <button disabled={isSubmitting} onClick={cancelEditingTransaction} className={styles.secondaryButton} type="button">Cancelar edição</button>}
                </div>
              </form>
            </aside>

            <div className={styles.ledgerColumn}>
              <form onSubmit={handleFilterSubmit} className={styles.filterPanel}>
                <div className={styles.filterHeading}><div className={styles.sectionTitle}><SlidersHorizontal size={18} aria-hidden="true" /><h2>Filtros</h2></div><span className={styles.filterHint}>Aplicados à lista e ao resumo</span></div>
                <div className={styles.filterGrid}>
                  <label className={styles.field}><span>Tipo</span><select onChange={(event) => setFilterType(event.target.value)} value={filterType}>
                    <option value="">Todos os tipos</option><option value="TITHE">Dízimo</option><option value="OFFERING">Oferta</option><option value="EVENT">Evento</option><option value="EXPENSE">Despesa</option><option value="OTHER">Outro</option>
                  </select></label>
                  <label className={styles.field}><span>Direção</span><select onChange={(event) => setFilterDirection(event.target.value)} value={filterDirection}>
                    <option value="">Todas</option><option value="IN">Entrada</option><option value="OUT">Saída</option>
                  </select></label>
                  <label className={styles.field}><span>Status</span><select onChange={(event) => setFilterStatus(event.target.value)} value={filterStatus}>
                    <option value="">Todos</option><option value="ACTIVE">Ativo</option><option value="CANCELLED">Cancelado</option><option value="REVERSED">Estornado</option>
                  </select></label>
                  <label className={styles.field}><span>Método</span><select onChange={(event) => setFilterMethod(event.target.value)} value={filterMethod}>
                    <option value="">Todos</option><option value="PIX">PIX</option><option value="CARD">Cartão</option><option value="CASH">Dinheiro</option><option value="BOLETO">Boleto</option>
                  </select></label>
                  <label className={[styles.field, styles.costFilter].join(" ")}><span>Centro de custo</span><input onChange={(event) => setFilterCostCenter(event.target.value)} placeholder="Geral, Eventos, Missões..." type="text" value={filterCostCenter} /></label>
                  <label className={styles.field}><span>De</span><input onChange={(event) => setFilterFrom(event.target.value)} type="date" value={filterFrom} /></label>
                  <label className={styles.field}><span>Até</span><input onChange={(event) => setFilterTo(event.target.value)} type="date" value={filterTo} /></label>
                </div>
                <div className={styles.filterActions}>
                  <button disabled={isLoading} onClick={clearFinancialFilters} className={styles.textButton} type="button">Limpar filtros</button>
                  <button disabled={isLoading} className={styles.secondaryButton} type="submit">{isLoading ? <span className={styles.spinner} aria-hidden="true" /> : <SlidersHorizontal size={15} aria-hidden="true" />}Aplicar filtros</button>
                </div>
              </form>

              <section className={styles.transactionsPanel} aria-labelledby="transactions-title" aria-busy={isLoading}>
                <div className={styles.transactionsHeading}>
                  <div><div className={styles.sectionTitle}><h2 id="transactions-title">Transações</h2>{!isLoading && <span className={styles.countBadge}>{transactions.length}</span>}</div><p>Consulte os lançamentos e acompanhe seu status.</p></div>
                  <ReceiptText size={21} className={styles.mutedIcon} aria-hidden="true" />
                </div>
                {isLoading && <div className={styles.emptyState} role="status"><span className={styles.spinner} aria-hidden="true" /><p>Carregando financeiro...</p></div>}
                {!isLoading && transactions.length === 0 && <div className={styles.emptyState}><span className={styles.emptyIcon}><ReceiptText size={27} aria-hidden="true" /></span><h3>Nenhuma transação encontrada</h3><p>Revise os filtros ou registre um novo lançamento.</p><button className={styles.secondaryButton} type="button" onClick={focusEntry}><Plus size={16} aria-hidden="true" /> Novo lançamento</button></div>}
                {!isLoading && transactions.length > 0 && <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <caption className={styles.srOnly}>Lançamentos financeiros da consulta atual</caption>
                    <thead><tr><th scope="col">Lançamento</th><th scope="col">Data</th><th scope="col">Método / centro</th><th scope="col" className={styles.valueHeading}>Valor</th><th scope="col">Status</th><th scope="col" className={styles.actionsHeading}>Ações</th></tr></thead>
                    {transactions.map((transaction) => <tbody key={transaction.id} className={styles.transactionGroup} data-editing={editingTransactionId === transaction.id}>
                      <tr className={styles.transactionRow}>
                        <td className={styles.movementCell}><div className={styles.movement}><span className={styles.directionIcon} data-direction={transaction.direction}>{transaction.direction === "IN" ? <ArrowDownLeft size={17} aria-hidden="true" /> : <ArrowUpRight size={17} aria-hidden="true" />}</span><div><strong>{transactionTypeLabels[transaction.type]}</strong><span>{transactionDirectionLabels[transaction.direction]}</span></div></div></td>
                        <td className={styles.dateCell}><span className={styles.mobileLabel}>Data</span><time dateTime={transaction.at}>{formatDate(transaction.at)}</time></td>
                        <td className={styles.methodCell}><span className={styles.mobileLabel}>Método / centro</span><strong>{paymentMethodLabels[transaction.method]}</strong><span className={styles.costCenter}>{transaction.costCenter}</span></td>
                        <td className={styles.amountCell} data-direction={transaction.direction}><span className={styles.srOnly}>Valor: </span>{transaction.direction === "IN" ? "+" : "−"} {formatMoney(transaction.amount)}</td>
                        <td className={styles.statusCell}><span className={styles.statusBadge} data-status={transaction.status} style={{ color: getStatusColor(transaction.status) }}><span aria-hidden="true" />{transactionStatusLabels[transaction.status]}</span></td>
                        <td className={styles.actionsCell}>
                          {transaction.status === "ACTIVE" ? <div className={styles.rowActions}>
                            <button disabled={processingTransactionId === transaction.id} onClick={() => { startEditingTransaction(transaction); focusEntry(); }} className={styles.rowAction} type="button" title="Editar lançamento" aria-label={"Editar " + transactionTypeLabels[transaction.type] + " de " + formatMoney(transaction.amount)}><Pencil size={15} aria-hidden="true" /><span className={styles.actionLabel}>Editar</span></button>
                            <button disabled={processingTransactionId === transaction.id} onClick={() => handleTransactionControl(transaction, "cancel")} className={styles.rowAction} data-action="cancel" type="button" title="Cancelar lançamento" aria-label={"Cancelar " + transactionTypeLabels[transaction.type] + " de " + formatMoney(transaction.amount)}><Ban size={15} aria-hidden="true" /><span className={styles.actionLabel}>Cancelar</span></button>
                            <button disabled={processingTransactionId === transaction.id} onClick={() => handleTransactionControl(transaction, "reverse")} className={styles.rowAction} data-action="reverse" type="button" title="Estornar lançamento" aria-label={"Estornar " + transactionTypeLabels[transaction.type] + " de " + formatMoney(transaction.amount)}><RotateCcw size={15} aria-hidden="true" /><span className={styles.actionLabel}>Estornar</span></button>
                          </div> : <span className={styles.noActions}>—<span className={styles.srOnly}> Sem ações disponíveis</span></span>}
                          {processingTransactionId === transaction.id && <span className={styles.processingLabel} role="status">Processando...</span>}
                        </td>
                      </tr>
                      {(transaction.cancelledAt || transaction.cancelReason || transaction.person || transaction.event || transaction.asaasId || transaction.nfseId) && <tr className={styles.detailRow}><td colSpan={6}>
                        <div className={styles.transactionDetails}>
                          {transaction.cancelledAt && <span><b>Controle em</b> {formatDateTime(transaction.cancelledAt)}</span>}
                          {transaction.person && <span><b>Pessoa</b> {transaction.person.name}</span>}
                          {transaction.event && <span><b>Evento</b> {transaction.event.title}</span>}
                          {transaction.asaasId && <span><b>Asaas</b> {transaction.asaasId}</span>}
                          {transaction.nfseId && <span><b>NFS-e</b> {transaction.nfseId}</span>}
                          {transaction.cancelReason && <p><b>Motivo</b> {transaction.cancelReason}</p>}
                        </div>
                      </td></tr>}
                    </tbody>)}
                  </table>
                </div>}
              </section>
            </div>
          </div>
        </div>
      </main>
    </DashboardAuthGuard>
  );
}
