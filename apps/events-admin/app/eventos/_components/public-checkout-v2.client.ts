// Browser-only protocol preparation. No page imports/creates this client today.
// Never import server services/Prisma or read legacy checkout/session tokens here.
export type CheckoutMethod = "PIX" | "CREDIT_CARD" | "DEBIT_CARD";
export type CheckoutTarget = { eventId: string; churchSlug: string; eventSlug: string };
export type CheckoutRegistrationInput = {
  name: string; phone: string; email: string; cpf?: string; paymentMethod?: CheckoutMethod;
  ticketId: string; ticketBatchId: string; discountCode?: string;
  answers: Array<{ fieldId: string; value: string | string[] }>;
};
export type CheckoutPayment = { method: "PIX"; pix: { encodedImage: string; payload: string; expirationDate: string } } |
  { method: "CREDIT_CARD" | "DEBIT_CARD"; redirectUrl: string };
export type CheckoutRegistration = {
  id: string; status: "PENDING" | "CONFIRMED" | "CANCELLED" | "CHECKED_IN";
  paymentStatus: string; waitlistedAt: string | null; checkInToken: string | null;
  paymentCheckout?: CheckoutPayment;
  event: { id: string; title: string; slug: string; publicSlug: string | null; date: string; isPaid: boolean;
    church: { name: string; slug: string } };
};
export type CheckoutPhase = "IDLE" | "READY" | "REGISTRATION_UNCERTAIN" | "RECONCILIATION_REQUIRED" |
  "EXPIRED" | "ACCESS_DENIED" | "STORAGE_UNAVAILABLE" | "VALIDATION_FAILED" | "FAILED";
export type CheckoutSnapshot = { phase: CheckoutPhase; registration: CheckoutRegistration | null;
  expiresAt: string | null; busy: boolean; message: string | null; needsCpf: boolean; hasSession: boolean };
type StoredSession = { version: 2; key: string; deadline: number; registrationId: string | null; reconciliation: boolean };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
export type CheckoutV2ClientOptions = {
  apiBaseUrl: string; target: CheckoutTarget; storage: Storage;
  fetch?: typeof fetch; crypto?: Pick<Crypto, "getRandomValues">; clock?: () => number; timeoutMs?: number;
};
const TTL = 24 * 60 * 60 * 1000;
const keyPattern = /^ec2_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const messages = {
  EXPIRED: "O acesso ao checkout expirou. Solicite atendimento para recuperar sua inscrição.",
  ACCESS_DENIED: "Este acesso está indisponível ou foi revogado. Solicite atendimento para recuperar sua inscrição.",
  RECONCILIATION_REQUIRED: "O pagamento precisa de conferência. Não faça outra inscrição ou pagamento; procure o atendimento.",
  REGISTRATION_UNCERTAIN: "Não foi possível confirmar a resposta da inscrição. Verifique o status antes de tentar novamente.",
  STORAGE_UNAVAILABLE: "Não foi possível manter o acesso seguro nesta aba. Habilite o armazenamento da sessão antes de continuar.",
  FAILED: "Não foi possível concluir esta operação agora. Verifique o status ou procure o atendimento.",
  CONFLICT: "Os dados desta tentativa não podem ser alterados. Verifique o status ou procure o atendimento.",
  CPF_REQUIRED: "Informe o CPF do participante para retomar o pagamento.",
  VALIDATION_FAILED: "Revise os dados da inscrição e tente novamente."
};
export class CheckoutV2Error extends Error {
  constructor(public readonly code: keyof typeof messages) { super(messages[code]); }
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value.length) throw new CheckoutV2Error("FAILED");
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CheckoutV2Error("FAILED");
  return value as Record<string, unknown>;
}
function normalize(value: CheckoutRegistrationInput): CheckoutRegistrationInput {
  // Explicit allowlist; no contact lookup, amount, provider ID or caller credential.
  const method = value.paymentMethod;
  if (method !== undefined && !["PIX", "CREDIT_CARD", "DEBIT_CARD"].includes(method)) throw new CheckoutV2Error("FAILED");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email?.trim() ?? "")) throw new CheckoutV2Error("FAILED");
  const answers = value.answers.map(answer => ({ fieldId: string(answer.fieldId),
    value: Array.isArray(answer.value) ? answer.value.map(v => typeof v === "string" ? v : string(v)) : typeof answer.value === "string" ? answer.value : string(answer.value) })).sort((a, b) => a.fieldId.localeCompare(b.fieldId));
  if (new Set(answers.map(a => a.fieldId)).size !== answers.length) throw new CheckoutV2Error("FAILED");
  return { name: string(value.name.trim()), phone: string(value.phone.replace(/\D/g, "") || value.phone.trim()),
    email: value.email.trim().toLowerCase(), ticketId: string(value.ticketId), ticketBatchId: string(value.ticketBatchId),
    ...(value.cpf !== undefined ? { cpf: value.cpf.replace(/\D/g, "") } : {}),
    ...(method ? { paymentMethod: method } : {}),
    ...(value.discountCode !== undefined ? { discountCode: value.discountCode.trim().toUpperCase() } : {}), answers };
}

export function createPublicCheckoutV2Client(options: CheckoutV2ClientOptions) {
  const target = { ...options.target }, clock = options.clock ?? Date.now, transport = options.fetch ?? globalThis.fetch;
  for (const item of Object.values(target)) string(item);
  const base = new URL(options.apiBaseUrl);
  if (base.username || base.password || base.search || base.hash ||
    !(base.protocol === "https:" || (base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)))) throw new CheckoutV2Error("FAILED");
  const endpoint = `${base.href.replace(/\/$/, "")}/public/churches/${encodeURIComponent(target.churchSlug)}/events/${encodeURIComponent(target.eventSlug)}`;
  const storageKey = `events.checkout.v2:${encodeURIComponent(target.eventId)}:${encodeURIComponent(target.churchSlug)}:${encodeURIComponent(target.eventSlug)}`;
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new CheckoutV2Error("FAILED");
  let session: StoredSession | null = null, originalBody: string | null = null, disposed = false, rejectedInput = false;
  let state: CheckoutSnapshot = { phase: "IDLE", registration: null, expiresAt: null, busy: false, message: null, needsCpf: false, hasSession: false };
  let running: { identity: string; promise: Promise<CheckoutRegistration> } | null = null;
  const listeners = new Set<(value: CheckoutSnapshot) => void>(), controllers = new Set<AbortController>();
  const snapshot = () => structuredClone(state);
  const publish = (patch: Partial<CheckoutSnapshot>) => { if (disposed) return; state = { ...state, ...patch }; for (const fn of listeners) fn(snapshot()); };
  function fail(code: keyof typeof messages): never { throw new CheckoutV2Error(code); }
  function terminal(phase: "EXPIRED" | "ACCESS_DENIED" | "STORAGE_UNAVAILABLE") {
    session = null; originalBody = null; rejectedInput = false;
    for (const controller of controllers) controller.abort();
    try { options.storage.setItem(storageKey, JSON.stringify({ version: 2, terminal: phase })); } catch { /* No fallback to persistent storage or legacy. */ }
    publish({ phase, registration: null, expiresAt: null, hasSession: false, needsCpf: false, message: messages[phase] });
  }
  function retain() {
    try { const value = JSON.stringify(session); options.storage.setItem(storageKey, value);
      if (options.storage.getItem(storageKey) !== value) throw new Error(); }
    catch { terminal("STORAGE_UNAVAILABLE"); fail("STORAGE_UNAVAILABLE"); }
  }
  function requireSession() {
    if (disposed) fail("ACCESS_DENIED");
    if (session && clock() >= session.deadline) terminal("EXPIRED");
    if (["EXPIRED", "ACCESS_DENIED", "STORAGE_UNAVAILABLE"].includes(state.phase)) fail(state.phase as "EXPIRED" | "ACCESS_DENIED" | "STORAGE_UNAVAILABLE");
    if (!session) fail("ACCESS_DENIED");
    if (clock() >= session.deadline) { terminal("EXPIRED"); fail("EXPIRED"); }
    return session;
  }
  try {
    const saved = options.storage.getItem(storageKey);
    if (saved !== null) {
      const data = object(JSON.parse(saved));
      if (data.version === 2 && (data.terminal === "EXPIRED" || data.terminal === "ACCESS_DENIED")) { terminal(data.terminal); }
      else {
      if (data.version !== 2 || typeof data.key !== "string" || !keyPattern.test(data.key) ||
        typeof data.deadline !== "number" || !Number.isFinite(data.deadline) || data.deadline > clock() + TTL ||
        !(data.registrationId === null || typeof data.registrationId === "string") || typeof data.reconciliation !== "boolean") throw new Error();
      session = { version: 2, key: data.key, deadline: data.deadline, registrationId: data.registrationId, reconciliation: data.reconciliation };
      state = { ...state, phase: session.reconciliation ? "RECONCILIATION_REQUIRED" : "READY", expiresAt: new Date(session.deadline).toISOString(),
        hasSession: true, message: session.reconciliation ? messages.RECONCILIATION_REQUIRED : null };
      if (clock() >= session.deadline) terminal("EXPIRED");
      }
    }
  } catch { terminal("STORAGE_UNAVAILABLE"); }

  function parseRegistration(value: unknown): CheckoutRegistration {
    const data = object(value), event = object(data.event), church = object(event.church), current = requireSession();
    if (event.id !== target.eventId || event.slug !== target.eventSlug || church.slug !== target.churchSlug ||
      (current.registrationId !== null && data.id !== current.registrationId) ||
      !["PENDING", "CONFIRMED", "CANCELLED", "CHECKED_IN"].includes(String(data.status)) ||
      typeof event.isPaid !== "boolean" || !(data.waitlistedAt === null || typeof data.waitlistedAt === "string")) fail("FAILED");
    const registration: CheckoutRegistration = { id: string(data.id), status: data.status as CheckoutRegistration["status"],
      paymentStatus: string(data.paymentStatus), waitlistedAt: data.waitlistedAt as string | null, checkInToken: null,
      event: { id: target.eventId, slug: target.eventSlug, title: string(event.title), date: string(event.date),
        publicSlug: typeof event.publicSlug === "string" ? event.publicSlug : null, isPaid: event.isPaid,
        church: { slug: target.churchSlug, name: string(church.name) } } };
    const eligible = !registration.waitlistedAt && ["CONFIRMED", "CHECKED_IN"].includes(registration.status) && ["PAID", "NOT_REQUIRED"].includes(registration.paymentStatus);
    if (eligible && typeof data.checkInToken === "string") registration.checkInToken = data.checkInToken;
    if (registration.paymentStatus === "PENDING" && registration.status !== "CANCELLED" && !registration.waitlistedAt && data.paymentCheckout) {
      const payment = object(data.paymentCheckout);
      if (payment.method === "PIX") { const pix = object(payment.pix); registration.paymentCheckout = { method: "PIX",
        pix: { encodedImage: string(pix.encodedImage), payload: string(pix.payload), expirationDate: string(pix.expirationDate) } }; }
      else if (payment.method === "CREDIT_CARD" || payment.method === "DEBIT_CARD") {
        const url = new URL(string(payment.redirectUrl));
        if (url.protocol !== "https:" || url.username || url.password || /ec2_|checkoutToken|x-event-checkout-key/i.test(url.href)) fail("FAILED");
        registration.paymentCheckout = { method: payment.method, redirectUrl: url.href };
      } else fail("FAILED");
    }
    return registration;
  }
  function receive(value: unknown, action: "register" | "status" | "resume") {
    const current = requireSession(), data = object(value), registration = parseRegistration(data);
    if (action === "register") {
      const deadline = Date.parse(string(data.expiresAt));
      if (!Number.isFinite(deadline) || deadline > clock() + TTL) fail("FAILED");
      current.deadline = Math.min(current.deadline, deadline); // Never renew on replay/poll/reload.
      if (clock() >= current.deadline) { terminal("EXPIRED"); fail("EXPIRED"); }
    }
    current.registrationId = registration.id;
    originalBody = null; rejectedInput = false;
    const blocked = current.reconciliation && registration.paymentStatus === "PENDING" && registration.status !== "CANCELLED" && !registration.waitlistedAt;
    if (blocked) delete registration.paymentCheckout;
    else if (action === "status" && registration.paymentStatus === "PENDING" && registration.status !== "CANCELLED" && !registration.waitlistedAt && state.registration?.id === registration.id) {
      if (state.registration.paymentCheckout) registration.paymentCheckout = state.registration.paymentCheckout; // Memory only; never restore a cached payment from browser storage.
    }
    retain();
    publish({ phase: blocked ? "RECONCILIATION_REQUIRED" : "READY", registration, expiresAt: new Date(current.deadline).toISOString(),
      hasSession: true, needsCpf: state.needsCpf && registration.paymentStatus === "PENDING" && !registration.paymentCheckout, message: blocked ? messages.RECONCILIATION_REQUIRED : null });
    return structuredClone(registration);
  }
  function handleError(error: unknown, action: string): never {
    if (disposed) fail("ACCESS_DENIED");
    if (["EXPIRED", "ACCESS_DENIED", "STORAGE_UNAVAILABLE"].includes(state.phase)) fail(state.phase as "EXPIRED" | "ACCESS_DENIED" | "STORAGE_UNAVAILABLE");
    const safe = error instanceof CheckoutV2Error && !(action === "resume" && error.code === "FAILED") ? error : new CheckoutV2Error(action === "register" ? "REGISTRATION_UNCERTAIN" : action === "resume" ? "RECONCILIATION_REQUIRED" : "FAILED");
    if (safe.code === "ACCESS_DENIED" || safe.code === "EXPIRED" || safe.code === "STORAGE_UNAVAILABLE") terminal(safe.code);
    else if (safe.code === "RECONCILIATION_REQUIRED") {
      if (session) { session.reconciliation = true; retain(); }
      const held = state.registration ? { ...state.registration, checkInToken: null } : null;
      if (held) delete held.paymentCheckout;
      publish({ phase: "RECONCILIATION_REQUIRED", registration: held, message: safe.message });
    } else publish({ phase: safe.code === "REGISTRATION_UNCERTAIN" ? "REGISTRATION_UNCERTAIN" : safe.code === "VALIDATION_FAILED" ? "VALIDATION_FAILED" : state.phase === "RECONCILIATION_REQUIRED" ? state.phase : "FAILED",
      message: safe.message, needsCpf: safe.code === "CPF_REQUIRED" });
    throw safe;
  }
  async function request(action: "register" | "status" | "resume", body: string) {
    const current = requireSession(), controller = new AbortController(); controllers.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new CheckoutV2Error(action === "register" ? "REGISTRATION_UNCERTAIN" : "FAILED")); }, Math.min(timeoutMs, Math.max(1, current.deadline - clock()))); });
    const work = async () => {
      const response = await transport(`${endpoint}/${action === "register" ? "register" : `checkout/${action}`}`, {
        method: "POST", cache: "no-store", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-event-checkout-key": current.key }, body });
      if (controller.signal.aborted || disposed) fail(action === "register" ? "REGISTRATION_UNCERTAIN" : "FAILED");
      requireSession();
      if (response.status === 401 || response.status === 403 || response.status === 404) fail("ACCESS_DENIED");
      const data: unknown = await response.json();
      if (controller.signal.aborted || disposed) fail(action === "register" ? "REGISTRATION_UNCERTAIN" : "FAILED");
      if (!response.ok) {
        const code = object(data).error;
        // The v2 contract rejects schema validation before committing a registration.
        // A definitive 400 allows manual correction with the SAME retained key.
        if (action === "register" && response.status === 400 && code === "VALIDATION_ERROR" && current.registrationId === null) { rejectedInput = true; fail("VALIDATION_FAILED"); }
        if (response.status === 401 || response.status === 403 || code === "CHECKOUT_ACCESS_DENIED") fail("ACCESS_DENIED");
        if (["CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED", "CHECKOUT_ASSISTANCE_REQUIRED"].includes(String(code))) fail("RECONCILIATION_REQUIRED");
        if (code === "PAYMENT_CUSTOMER_CPF_REQUIRED") fail("CPF_REQUIRED");
        if (code === "CHECKOUT_ATTEMPT_CONFLICT") fail("CONFLICT");
        fail(action === "register" && response.status >= 500 ? "REGISTRATION_UNCERTAIN" : "FAILED");
      }
      return receive(data, action);
    };
    try { return await Promise.race([work(), timeout]); }
    finally { if (timer) clearTimeout(timer); controllers.delete(controller); }
  }
  function run(action: "register" | "status" | "resume", body: string): Promise<CheckoutRegistration> {
    const identity = `${action}:${body}`;
    if (running) return running.identity === identity ? running.promise : Promise.reject(new CheckoutV2Error("CONFLICT"));
    publish({ busy: true });
    const promise = request(action, body).catch(error => handleError(error, action)).finally(() => { running = null; publish({ busy: false }); });
    running = { identity, promise }; return promise;
  }
  return {
    getSnapshot() { if (session && clock() >= session.deadline) terminal("EXPIRED"); return snapshot(); },
    subscribe(listener: (value: CheckoutSnapshot) => void) { listeners.add(listener); listener(snapshot()); return () => { listeners.delete(listener); }; },
    async register(input: CheckoutRegistrationInput) {
      try {
        if (disposed || ["EXPIRED", "ACCESS_DENIED", "STORAGE_UNAVAILABLE"].includes(state.phase)) requireSession();
        const body = JSON.stringify(normalize(input));
        if (session) {
          requireSession();
          if (session.registrationId || (!rejectedInput && (!originalBody || originalBody !== body))) fail("CONFLICT");
          if (rejectedInput) { originalBody = body; rejectedInput = false; }
          if (session.reconciliation) fail("RECONCILIATION_REQUIRED");
        } else {
          const bytes = new Uint8Array(32); (options.crypto ?? globalThis.crypto).getRandomValues(bytes);
          const key = `ec2_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
          bytes.fill(0);
          session = { version: 2, key, deadline: clock() + TTL, registrationId: null, reconciliation: false };
          originalBody = body; retain(); publish({ hasSession: true, expiresAt: new Date(session!.deadline).toISOString() });
        }
        return run("register", body);
      } catch (error) { return handleError(error, "register"); }
    },
    status() { return run("status", "{}"); },
    resume(input: { cpf?: string } = {}) {
      try {
        const current = requireSession();
        if (current.reconciliation) fail("RECONCILIATION_REQUIRED");
        if (!current.registrationId || !state.registration || state.registration.status === "CANCELLED" || state.registration.waitlistedAt || state.registration.paymentStatus !== "PENDING") fail("CONFLICT");
        // Method/provider/financial IDs and contacts can never override a resume.
        const cpf = input.cpf?.replace(/\D/g, "");
        if (cpf !== undefined && cpf.length !== 11) fail("CPF_REQUIRED");
        return run("resume", JSON.stringify(cpf ? { cpf } : {}));
      } catch (error) { try { handleError(error, "resume"); } catch (safe) { return Promise.reject(safe); } }
    },
    dispose() { disposed = true; for (const c of controllers) c.abort(); controllers.clear(); session = null; originalBody = null; rejectedInput = false; listeners.clear(); state = { phase: "ACCESS_DENIED", registration: null, expiresAt: null, busy: false, message: messages.ACCESS_DENIED, needsCpf: false, hasSession: false }; }
  };
}
export type PublicCheckoutV2Client = ReturnType<typeof createPublicCheckoutV2Client>;
export type PublicCheckoutV2Factory = (target: CheckoutTarget) => PublicCheckoutV2Client;
