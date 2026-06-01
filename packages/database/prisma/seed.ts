import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/sistema_igrejas?schema=public";

const adapter = new PrismaPg({
  connectionString: databaseUrl
});

const prisma = new PrismaClient({
  adapter
});

function getTrialDates(): {
  trialStartedAt: Date;
  trialEndsAt: Date;
} {
  const trialStartedAt = new Date();
  const trialEndsAt = new Date(trialStartedAt);

  trialEndsAt.setDate(trialEndsAt.getDate() + 15);

  return {
    trialStartedAt,
    trialEndsAt
  };
}

async function upsertDemoChurch() {
  const trialDates = getTrialDates();

  return prisma.church.upsert({
    where: {
      slug: "igreja-demo"
    },
    update: {
      name: "Igreja Demo",
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
      name: "Igreja Demo",
      slug: "igreja-demo",
      plan: "DEMO",
      status: "TRIAL",
      locale: "pt-BR",
      trialStartedAt: trialDates.trialStartedAt,
      trialEndsAt: trialDates.trialEndsAt
    }
  });
}

async function upsertDemoTrialSignup(
  churchId: string,
  trialStartedAt: Date | null,
  trialEndsAt: Date | null
) {
  return prisma.trialSignup.upsert({
    where: {
      email: "pastor@sistemaigrejas.local"
    },
    update: {
      churchId,
      status: "ACTIVE",
      startedAt: trialStartedAt ?? new Date(),
      endsAt: trialEndsAt,
      convertedAt: null,
      blockedAt: null
    },
    create: {
      email: "pastor@sistemaigrejas.local",
      churchId,
      status: "ACTIVE",
      startedAt: trialStartedAt ?? new Date(),
      endsAt: trialEndsAt
    }
  });
}

async function upsertDemoCampus(churchId: string) {
  const existingCampus = await prisma.campus.findFirst({
    where: {
      churchId,
      name: "Sede"
    }
  });

  if (existingCampus) {
    return prisma.campus.update({
      where: {
        id: existingCampus.id
      },
      data: {
        name: "Sede",
        isHeadquarters: true
      }
    });
  }

  return prisma.campus.create({
    data: {
      churchId,
      name: "Sede",
      isHeadquarters: true
    }
  });
}

async function upsertDemoPastor(churchId: string, campusId: string) {
  const existingPerson = await prisma.person.findFirst({
    where: {
      churchId,
      phone: "11999999999"
    }
  });

  if (existingPerson) {
    return prisma.person.update({
      where: {
        id: existingPerson.id
      },
      data: {
        campusId,
        name: "Pastor Demo",
        email: "pastor@sistemaigrejas.local",
        role: "PASTOR"
      }
    });
  }

  return prisma.person.create({
    data: {
      churchId,
      campusId,
      name: "Pastor Demo",
      phone: "11999999999",
      email: "pastor@sistemaigrejas.local",
      role: "PASTOR"
    }
  });
}

async function upsertDemoUserAccount(churchId: string, personId: string) {
  const passwordHash = await hash("12345678", 12);

  return prisma.userAccount.upsert({
    where: {
      email: "pastor@sistemaigrejas.local"
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
      email: "pastor@sistemaigrejas.local",
      passwordHash,
      role: "PASTOR",
      status: "ACTIVE"
    }
  });
}

async function main(): Promise<void> {
  const church = await upsertDemoChurch();
  const campus = await upsertDemoCampus(church.id);
  const pastor = await upsertDemoPastor(church.id, campus.id);
  await upsertDemoUserAccount(church.id, pastor.id);
  await upsertDemoTrialSignup(church.id, church.trialStartedAt, church.trialEndsAt);

  console.log("Seed concluido.");
  console.log("Igreja: Igreja Demo");
  console.log("Plano: DEMO");
  console.log("Status: TRIAL");
  console.log(`Trial termina em: ${church.trialEndsAt?.toISOString()}`);
  console.log("Trial signup: pastor@sistemaigrejas.local");
  console.log("E-mail: pastor@sistemaigrejas.local");
  console.log("Senha: 12345678");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
