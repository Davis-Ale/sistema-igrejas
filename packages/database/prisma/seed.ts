import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const adapter = new PrismaPg({
  connectionString: databaseUrl
});

const prisma = new PrismaClient({
  adapter
});

const LOCAL_CHURCH_NAME = "Igreja Local";
const LOCAL_CHURCH_SLUG = "igreja-local";
const LOCAL_USER_EMAIL = "pastor@sistemaigrejas.local";
const LOCAL_USER_PHONE = "00000000000";
const LOCAL_USER_PASSWORD = "12345678";

function getTrialDates() {
  const trialStartedAt = new Date();
  const trialEndsAt = new Date(trialStartedAt);
  trialEndsAt.setDate(trialEndsAt.getDate() + 15);

  return {
    trialStartedAt,
    trialEndsAt
  };
}

async function upsertLocalChurch() {
  const trialDates = getTrialDates();

  return prisma.church.upsert({
    where: {
      slug: LOCAL_CHURCH_SLUG
    },
    update: {
      name: LOCAL_CHURCH_NAME,
      plan: "DEMO",
      status: "TRIAL",
      locale: "pt-BR",
      trialStartedAt: trialDates.trialStartedAt,
      trialEndsAt: trialDates.trialEndsAt,
      subscriptionStartedAt: null,
      subscriptionEndsAt: null,
      blockedAt: null,
      blockReason: null
    },
    create: {
      name: LOCAL_CHURCH_NAME,
      slug: LOCAL_CHURCH_SLUG,
      plan: "DEMO",
      status: "TRIAL",
      locale: "pt-BR",
      trialStartedAt: trialDates.trialStartedAt,
      trialEndsAt: trialDates.trialEndsAt
    }
  });
}

async function upsertLocalTrialSignup(
  churchId: string,
  trialStartedAt: Date | null,
  trialEndsAt: Date | null
) {
  return prisma.trialSignup.upsert({
    where: {
      email: LOCAL_USER_EMAIL
    },
    update: {
      churchId,
      startedAt: trialStartedAt ?? undefined,
      endsAt: trialEndsAt,
      status: "ACTIVE"
    },
    create: {
      churchId,
      email: LOCAL_USER_EMAIL,
      startedAt: trialStartedAt ?? undefined,
      endsAt: trialEndsAt,
      status: "ACTIVE"
    }
  });
}

async function upsertLocalCampus(churchId: string) {
  const existingCampus = await prisma.campus.findFirst({
    where: {
      churchId,
      name: "Campus Principal"
    }
  });

  if (existingCampus) {
    return prisma.campus.update({
      where: {
        id: existingCampus.id
      },
      data: {
        isHeadquarters: true
      }
    });
  }

  return prisma.campus.create({
    data: {
      churchId,
      name: "Campus Principal",
      isHeadquarters: true
    }
  });
}

async function upsertLocalPastor(churchId: string, campusId: string) {
  const existingPastor = await prisma.person.findFirst({
    where: {
      churchId,
      email: LOCAL_USER_EMAIL
    }
  });

  if (existingPastor) {
    return prisma.person.update({
      where: {
        id: existingPastor.id
      },
      data: {
        campusId,
        name: "Pastor Local",
        phone: LOCAL_USER_PHONE,
        role: "PASTOR"
      }
    });
  }

  return prisma.person.create({
    data: {
      churchId,
      campusId,
      name: "Pastor Local",
      phone: LOCAL_USER_PHONE,
      email: LOCAL_USER_EMAIL,
      role: "PASTOR"
    }
  });
}

async function upsertLocalUserAccount(churchId: string, personId: string) {
  const passwordHash = await bcrypt.hash(LOCAL_USER_PASSWORD, 10);

  return prisma.userAccount.upsert({
    where: {
      email: LOCAL_USER_EMAIL
    },
    update: {
      churchId,
      personId,
      passwordHash,
      role: "PASTOR",
      status: "ACTIVE"
    },
    create: {
      churchId,
      personId,
      email: LOCAL_USER_EMAIL,
      passwordHash,
      role: "PASTOR",
      status: "ACTIVE"
    }
  });
}

async function main(): Promise<void> {
  const church = await upsertLocalChurch();
  const campus = await upsertLocalCampus(church.id);
  const pastor = await upsertLocalPastor(church.id, campus.id);
  await upsertLocalUserAccount(church.id, pastor.id);
  await upsertLocalTrialSignup(church.id, church.trialStartedAt, church.trialEndsAt);

  console.log("Seed concluido.");
  console.log(`Igreja: ${LOCAL_CHURCH_NAME}`);
  console.log("Plano: DEMO");
  console.log("Status: TRIAL");
  console.log(`Trial termina em: ${church.trialEndsAt?.toISOString()}`);
  console.log(`Trial signup: ${LOCAL_USER_EMAIL}`);
  console.log(`E-mail: ${LOCAL_USER_EMAIL}`);
  console.log(`Senha: ${LOCAL_USER_PASSWORD}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
