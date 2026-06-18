import { createAsaasClient } from "./asaas.client.js";

type AsaasClient = ReturnType<typeof createAsaasClient>;

export type AsaasBillingType = "BOLETO" | "PIX" | "CREDIT_CARD" | "UNDEFINED";

export type CreateAsaasCustomerInput = {
  cpfCnpj?: string;
  email?: string;
  externalReference: string;
  mobilePhone?: string;
  name: string;
  notificationDisabled?: boolean;
};

export type AsaasCustomerResponse = {
  cpfCnpj?: string | null;
  email?: string | null;
  externalReference?: string | null;
  id: string;
  mobilePhone?: string | null;
  name: string;
};

export type CreateAsaasPaymentInput = {
  billingType: AsaasBillingType;
  customerId: string;
  description?: string;
  dueDate: string;
  externalReference: string;
  value: number;
};

export type AsaasPaymentResponse = {
  bankSlipUrl?: string | null;
  billingType: string;
  customer: string;
  description?: string | null;
  dueDate: string;
  externalReference?: string | null;
  id: string;
  invoiceUrl?: string | null;
  status: string;
  value: number;
};

export async function createAsaasCustomer(
  input: CreateAsaasCustomerInput,
  client: AsaasClient = createAsaasClient()
): Promise<AsaasCustomerResponse> {
  return client.request<AsaasCustomerResponse>({
    body: {
      cpfCnpj: input.cpfCnpj,
      email: input.email,
      externalReference: input.externalReference,
      mobilePhone: input.mobilePhone,
      name: input.name,
      notificationDisabled: input.notificationDisabled ?? true
    },
    method: "POST",
    path: "/customers"
  });
}

export async function createAsaasPayment(
  input: CreateAsaasPaymentInput,
  client: AsaasClient = createAsaasClient()
): Promise<AsaasPaymentResponse> {
  return client.request<AsaasPaymentResponse>({
    body: {
      billingType: input.billingType,
      customer: input.customerId,
      description: input.description,
      dueDate: input.dueDate,
      externalReference: input.externalReference,
      value: input.value
    },
    method: "POST",
    path: "/payments"
  });
}
