import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@sistema-igrejas/database";
import {
  FINANCIAL_INSTITUTIONS,
  FINANCIAL_INSTITUTIONS_CATALOG_SOURCE,
  findFinancialInstitution,
  searchFinancialInstitutions
} from "@sistema-igrejas/events";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { buildApp } from "../src/app.js";

describe("Event receiving financial institutions", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient | null = null;
  let pastorToken = "";
  let isolatedPastorToken = "";
  let otherTenantToken = "";
  let operatorChurchId = "";
  let isolatedChurchId = "";
  let operatorReceivingAccountIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const loginResponse = await request(app.server)
      .post("/auth/login")
      .send({
        email: "pastor@sistemaigrejas.local",
        password: "12345678"
      });

    expect(loginResponse.status).toBe(200);
    pastorToken = loginResponse.body.token as string;
    operatorChurchId = loginResponse.body.church.id as string;

    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required.");
    }

    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl
      })
    });

    const operatorAccounts = await prisma.eventsReceivingAccount.findMany({
      where: {
        churchId: operatorChurchId
      },
      select: {
        id: true
      }
    });
    operatorReceivingAccountIds = operatorAccounts.map((row) => row.id);

    const isolatedChurch = await prisma.church.create({
      data: {
        name: `E2E Receiving ${Date.now()}`,
        slug: `e2e-receiving-${Date.now()}`,
        plan: "TRIAL",
        status: "ACTIVE"
      }
    });
    isolatedChurchId = isolatedChurch.id;
    isolatedPastorToken = await app.jwt.sign({
      userId: loginResponse.body.user.id as string,
      churchId: isolatedChurchId,
      role: "PASTOR"
    });

    otherTenantToken = await app.jwt.sign({
      userId: loginResponse.body.user.id as string,
      churchId: "other-church",
      role: "SUPER_ADMIN"
    });
  });

  afterAll(async () => {
    if (prisma) {
      if (isolatedChurchId) {
        await prisma.eventsReceivingAccountAudit.deleteMany({
          where: { churchId: isolatedChurchId }
        });
        await prisma.eventsReceivingAccount.deleteMany({
          where: { churchId: isolatedChurchId }
        });
        await prisma.church.delete({
          where: { id: isolatedChurchId }
        });
      }

      await prisma.$disconnect();
    }

    await app.close();
  });

  it("uses the Banco Central STR catalog with textual zero-padded codes", () => {
    expect(FINANCIAL_INSTITUTIONS_CATALOG_SOURCE.name).toBe(
      "Banco Central do Brasil"
    );
    expect(FINANCIAL_INSTITUTIONS_CATALOG_SOURCE.dataset).toBe(
      "Lista de Participantes do STR"
    );
    expect(FINANCIAL_INSTITUTIONS_CATALOG_SOURCE.url).toContain("bcb.gov.br");
    expect(FINANCIAL_INSTITUTIONS.length).toBe(463);

    const brasil = findFinancialInstitution("001");
    expect(brasil?.institutionCode).toBe("001");
    expect(brasil?.institutionCode).not.toBe("1");
    expect(findFinancialInstitution("1")).toBeUndefined();
    expect(brasil?.institutionName).toBe("Banco do Brasil S.A.");
  });

  it("searches by code and by official name for traditional and digital institutions", () => {
    const byCode = searchFinancialInstitutions("001");
    expect(byCode[0]?.institutionCode).toBe("001");
    expect(byCode[0]?.institutionName).toBe("Banco do Brasil S.A.");

    const traditional = searchFinancialInstitutions("Bradesco");
    expect(
      traditional.some((row) => row.institutionCode === "237")
    ).toBe(true);

    const digitalByName = searchFinancialInstitutions("NU PAGAMENTOS");
    expect(digitalByName[0]?.institutionCode).toBe("260");

    const digitalByCode = searchFinancialInstitutions("260");
    expect(digitalByCode[0]?.institutionCode).toBe("260");

    const inter = searchFinancialInstitutions("BANCO INTER");
    expect(inter.some((row) => row.institutionCode === "077")).toBe(true);
  });

  it("does not invent commercial aliases or persist invalid institution text", () => {
    expect(searchFinancialInstitutions("nubank")).toEqual([]);
    expect(searchFinancialInstitutions("zzzz-inexistente")).toEqual([]);
    expect(findFinancialInstitution("999")).toBeUndefined();
    expect(findFinancialInstitution("237")).toBeDefined();
  });

  it("does not treat agency as the institution identifier", () => {
    const agencyLike = searchFinancialInstitutions("1263");
    expect(agencyLike).toEqual([]);
    expect(findFinancialInstitution("1263")).toBeUndefined();
  });

  it("lists and filters institutions from the versioned catalog without an external runtime dependency", async () => {
    const all = await request(app.server)
      .get("/api/events/financial/institutions")
      .set("Authorization", `Bearer ${isolatedPastorToken}`);

    expect(all.status).toBe(200);
    expect(all.body.source.name).toBe("Banco Central do Brasil");
    expect(all.body.total).toBe(463);
    expect(all.body.items).toHaveLength(463);
    expect(all.body.items[0].institutionCode).toBe("001");
    expect(all.body.source.url).toBeUndefined();

    const byCode = await request(app.server)
      .get("/api/events/financial/institutions?q=001")
      .set("Authorization", `Bearer ${isolatedPastorToken}`);

    expect(byCode.status).toBe(200);
    expect(byCode.body.items[0].institutionCode).toBe("001");
    expect(byCode.body.items[0].institutionName).toBe("Banco do Brasil S.A.");

    const byName = await request(app.server)
      .get("/api/events/financial/institutions?q=NU%20PAGAMENTOS")
      .set("Authorization", `Bearer ${isolatedPastorToken}`);

    expect(byName.status).toBe(200);
    expect(byName.body.items[0].institutionCode).toBe("260");

    const missing = await request(app.server)
      .get("/api/events/financial/institutions?q=nubank")
      .set("Authorization", `Bearer ${isolatedPastorToken}`);

    expect(missing.status).toBe(200);
    expect(missing.body.items).toEqual([]);
  });

  it("persists the catalog code, not typed text, and resolves it again on edit", async () => {
    const created = await request(app.server)
      .put("/api/events/financial/receiving-account")
      .set("Authorization", `Bearer ${isolatedPastorToken}`)
      .send({
        bankCode: "001",
        bankAccountType: "CONTA_CORRENTE",
        agency: "237",
        account: "112233",
        accountDigit: "1",
        ownerName: "Igreja Catalogo Teste",
        cpfCnpj: "52998224725"
      });

    expect(created.status).toBe(200);
    expect(created.body.account.bankCode).toBe("001");
    expect(created.body.account.institutionName).toBe("Banco do Brasil S.A.");
    expect(created.body.account.agencyMasked).toBe("**7");
    expect(created.body.account.bankCode).not.toBe("237");

    const stored = await prisma!.eventsReceivingAccount.findUnique({
      where: { churchId: isolatedChurchId },
      select: {
        id: true,
        churchId: true,
        bankCode: true
      }
    });

    expect(stored?.churchId).toBe(isolatedChurchId);
    expect(stored?.bankCode).toBe("001");

    const updated = await request(app.server)
      .put("/api/events/financial/receiving-account")
      .set("Authorization", `Bearer ${isolatedPastorToken}`)
      .send({
        bankCode: "260",
        bankAccountType: "CONTA_POUPANCA",
        agency: "88",
        account: "445566",
        accountDigit: "X",
        ownerName: "Igreja Catalogo Atualizada",
        cpfCnpj: "39042976000171"
      });

    expect(updated.status).toBe(200);
    expect(updated.body.account.bankCode).toBe("260");
    expect(updated.body.account.institutionName).toContain("NU PAGAMENTOS");

    const afterUpdate = await prisma!.eventsReceivingAccount.findMany({
      where: { churchId: isolatedChurchId }
    });

    expect(afterUpdate).toHaveLength(1);
    expect(afterUpdate[0]?.id).toBe(stored?.id);
    expect(afterUpdate[0]?.bankCode).toBe("260");
  });

  it("rejects unknown codes, arbitrary text and cross-tenant writes", async () => {
    const unknownCode = await request(app.server)
      .put("/api/events/financial/receiving-account")
      .set("Authorization", `Bearer ${isolatedPastorToken}`)
      .send({
        bankCode: "999",
        bankAccountType: "CONTA_CORRENTE",
        agency: "1000",
        account: "5555",
        accountDigit: "1",
        ownerName: "Igreja Invalida",
        cpfCnpj: "52998224725"
      });

    expect(unknownCode.status).toBe(400);
    expect(unknownCode.body.error).toBe("VALIDATION_ERROR");

    const invalidText = await request(app.server)
      .put("/api/events/financial/receiving-account")
      .set("Authorization", `Bearer ${isolatedPastorToken}`)
      .send({
        bankCode: "Banco Fake",
        bankAccountType: "CONTA_CORRENTE",
        agency: "1000",
        account: "5555",
        accountDigit: "1",
        ownerName: "Igreja Invalida",
        cpfCnpj: "52998224725"
      });

    expect(invalidText.status).toBe(400);

    const unpadded = await request(app.server)
      .put("/api/events/financial/receiving-account")
      .set("Authorization", `Bearer ${isolatedPastorToken}`)
      .send({
        bankCode: "1",
        bankAccountType: "CONTA_CORRENTE",
        agency: "1000",
        account: "5555",
        accountDigit: "1",
        ownerName: "Igreja Invalida",
        cpfCnpj: "52998224725"
      });

    expect(unpadded.status).toBe(400);

    const otherGet = await request(app.server)
      .get("/api/events/financial/receiving-account")
      .set("Authorization", `Bearer ${otherTenantToken}`);

    expect(otherGet.status).toBe(200);
    expect(otherGet.body.configured).toBe(false);
    expect(otherGet.body.account).toBeNull();

    const otherPut = await request(app.server)
      .put("/api/events/financial/receiving-account")
      .set("Authorization", `Bearer ${otherTenantToken}`)
      .send({
        bankCode: "001",
        bankAccountType: "CONTA_CORRENTE",
        agency: "1000",
        account: "5555",
        accountDigit: "1",
        ownerName: "Outra Igreja",
        cpfCnpj: "39042976000171"
      });

    expect(otherPut.status).toBe(401);
  });

  it("does not leave receiving-account residue on the operator tenant", async () => {
    const remaining = await prisma!.eventsReceivingAccount.findMany({
      where: {
        churchId: operatorChurchId
      },
      select: {
        id: true
      }
    });

    expect(remaining.map((row) => row.id).sort()).toEqual(
      [...operatorReceivingAccountIds].sort()
    );

    const operatorView = await request(app.server)
      .get("/api/events/financial/receiving-account")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(operatorView.status).toBe(200);

    if (operatorReceivingAccountIds.length === 0) {
      expect(operatorView.body.configured).toBe(false);
      expect(operatorView.body.account).toBeNull();
    }
  });
});
