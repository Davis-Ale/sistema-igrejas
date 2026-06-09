import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const LOCAL_CHURCH_NAME = "Igreja Local";
const LOCAL_CHURCH_SLUG = "igreja-local";
const LOCAL_USER_EMAIL = "pastor@sistemaigrejas.local";
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
      trialStartedAt,
      trialEndsAt,
      status: "ACTIVE"
    },
    create: {
      churchId,
      email: LOCAL_USER_EMAIL,
      trialStartedAt,
      trialEndsAt,
      status: "ACTIVE"
    }
  });
}

async function upsertLocalCampus(churchId: string) {
  return prisma.campus.upsert({
    where: {
      churchId_name: {
        churchId,
        name: "Campus Principal"
      }
    },
    update: {
      isMain: true
    },
    create: {
      churchId,
      name: "Campus Principal",
      isMain: true
    }
  });
}

async function upsertLocalPastor(churchId: string, campusId: string) {
  return prisma.member.upsert({
    where: {
      churchId_email: {
        churchId,
        email: LOCAL_USER_EMAIL
      }
    },
    update: {
      campusId,
      fullName: "Pastor Local",
      status: "ACTIVE"
    },
    create: {
      churchId,
      campusId,
      fullName: "Pastor Local",
      email: LOCAL_USER_EMAIL,
      status: "ACTIVE"
    }
  });
}

async function upsertLocalUserAccount(churchId: string, memberId: string) {
  const passwordHash = await bcrypt.hash(LOCAL_USER_PASSWORD, 10);

  return prisma.userAccount.upsert({
    where: {
      email: LOCAL_USER_EMAIL
    },
    update: {
      churchId,
      memberId,
      passwordHash,
      role: "PASTOR",
      status: "ACTIVE"
    },
    create: {
      churchId,
      memberId,
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
