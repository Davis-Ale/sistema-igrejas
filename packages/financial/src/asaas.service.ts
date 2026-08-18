import type { PrismaClient } from "@prisma/client";
import { createAsaasClient } from "./asaas.client.js";
import { updateTransaction } from "./financial.service.js";

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


export async function getAsaasPayment(
  paymentId: string,
  client: AsaasClient = createAsaasClient()
): Promise<AsaasPaymentResponse> {
  return client.request<AsaasPaymentResponse>({
    method: "GET",
    path:
      `/payments/${encodeURIComponent(paymentId)}`
  });
}

export type AsaasPixQrCode = {
  encodedImage: string;
  payload: string;
  expirationDate: string;
};

export async function getAsaasPixQrCode(
  paymentId: string
): Promise<AsaasPixQrCode> {
  const client = createAsaasClient();

  return client.request<AsaasPixQrCode>({
    method: "GET",
    path:
      `/payments/${encodeURIComponent(paymentId)}/pixQrCode`
  });
}

export type CreateAsaasChargeForExistingTransactionInput = {
  transactionId: string;
  referenceId: string;
  billingType: "BOLETO" | "PIX" | "CREDIT_CARD";
  customer: {
    cpfCnpj?: string;
    email?: string;
    mobilePhone?: string;
    name: string;
  };
  description?: string;
  dueDate: string;
  value: number;
};

export async function createAsaasChargeForExistingTransaction(
  prisma: PrismaClient,
  churchId: string,
  input: CreateAsaasChargeForExistingTransactionInput
) {
  const transaction =
    await prisma.transaction.findFirst({
      where: {
        id: input.transactionId,
        churchId,
        status: "ACTIVE"
      },
      select: {
        id: true,
        amount: true,
        asaasId: true
      }
    });

  if (!transaction) {
    throw new Error(
      "TRANSACTION_NOT_FOUND"
    );
  }

  if (
    Number(transaction.amount) !==
    input.value
  ) {
    throw new Error(
      "TRANSACTION_AMOUNT_MISMATCH"
    );
  }

  /*
    Se uma tentativa anterior criou a cobrança no Asaas
    e gravou o ID na Transaction, reutilizamos o mesmo ID.
    Isso impede uma segunda cobrança após retry.
  */
  if (transaction.asaasId) {
    const payment =
      await getAsaasPayment(
        transaction.asaasId
      );

    const pixQrCode =
      payment.billingType === "PIX" &&
      payment.status !== "RECEIVED"
        ? await getAsaasPixQrCode(
            transaction.asaasId
          )
        : null;

    return {
      payment,
      paymentId: transaction.asaasId,
      pixQrCode,
      invoiceUrl:
        payment.invoiceUrl ?? null,
      reused: true
    };
  }

  await prisma.transaction.update({
    where: {
      id: transaction.id
    },
    data: {
      method:
        input.billingType === "PIX"
          ? "PIX"
          : "CARD"
    }
  });

  const customerInput: CreateAsaasCustomerInput = {
    externalReference:
      `${churchId}:${input.referenceId}:customer`,
    name: input.customer.name
  };

  if (input.customer.cpfCnpj) {
    customerInput.cpfCnpj =
      input.customer.cpfCnpj;
  }

  if (input.customer.email) {
    customerInput.email =
      input.customer.email;
  }

  if (input.customer.mobilePhone) {
    customerInput.mobilePhone =
      input.customer.mobilePhone;
  }

  const customer =
    await createAsaasCustomer(
      customerInput
    );

  const paymentInput: CreateAsaasPaymentInput = {
    billingType: input.billingType,
    customerId: customer.id,
    dueDate: input.dueDate,
    externalReference:
      `${churchId}:${input.referenceId}:payment`,
    value: input.value
  };

  if (input.description) {
    paymentInput.description =
      input.description;
  }

  const payment =
    await createAsaasPayment(
      paymentInput
    );

  await updateTransaction(
    prisma,
    churchId,
    transaction.id,
    {
      asaasId: payment.id
    }
  );

  const pixQrCode =
    input.billingType === "PIX"
      ? await getAsaasPixQrCode(payment.id)
      : null;

  return {
    customer,
    payment,
    paymentId: payment.id,
    pixQrCode,
    invoiceUrl:
      payment.invoiceUrl ?? null,
    reused: false
  };
}
