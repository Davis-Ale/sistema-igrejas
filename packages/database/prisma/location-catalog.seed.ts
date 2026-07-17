import type { PrismaClient } from "@prisma/client";
import { CURITIBA_LOCATION } from "./data/curitiba-neighborhoods.js";

function normalizeLocationName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export async function upsertCuritibaLocationCatalog(prisma: PrismaClient) {
  const city = await prisma.locationCity.upsert({
    where: {
      ibgeCode: CURITIBA_LOCATION.ibgeCode
    },
    update: {
      countryCode: CURITIBA_LOCATION.countryCode,
      stateCode: CURITIBA_LOCATION.stateCode,
      name: CURITIBA_LOCATION.name,
      normalizedName: normalizeLocationName(CURITIBA_LOCATION.name)
    },
    create: {
      countryCode: CURITIBA_LOCATION.countryCode,
      stateCode: CURITIBA_LOCATION.stateCode,
      ibgeCode: CURITIBA_LOCATION.ibgeCode,
      name: CURITIBA_LOCATION.name,
      normalizedName: normalizeLocationName(CURITIBA_LOCATION.name)
    }
  });

  for (const neighborhood of CURITIBA_LOCATION.neighborhoods) {
    const normalizedName = normalizeLocationName(neighborhood);

    await prisma.locationNeighborhood.upsert({
      where: {
        cityId_normalizedName: {
          cityId: city.id,
          normalizedName
        }
      },
      update: {
        name: neighborhood,
        active: true
      },
      create: {
        cityId: city.id,
        name: neighborhood,
        normalizedName,
        active: true
      }
    });
  }

  return city;
}
