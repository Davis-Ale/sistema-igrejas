import type { PrismaClient } from "@prisma/client";
type IbgeState = {
  id: number;
  sigla: string;
  nome: string;
};

type IbgeCity = {
  id: number;
  nome: string;
};

type ViaCepResponse = {
  erro?: boolean | string;
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
};

const IBGE_BASE_URL = "https://servicodados.ibge.gov.br/api/v1/localidades";
const VIA_CEP_BASE_URL = "https://viacep.com.br/ws";
const REQUEST_TIMEOUT_MS = 5000;

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("LOCATION_PROVIDER_UNAVAILABLE");
    }

    return (await response.json()) as T;
  } catch {
    throw new Error("LOCATION_PROVIDER_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}

export async function listBrazilStates() {
  const states = await fetchJson<IbgeState[]>(
    `${IBGE_BASE_URL}/estados?orderBy=nome`
  );

  return states.map((state) => ({
    id: state.id,
    code: state.sigla,
    name: state.nome
  }));
}

export async function listBrazilCities(state: string) {
  const cities = await fetchJson<IbgeCity[]>(
    `${IBGE_BASE_URL}/estados/${encodeURIComponent(state)}/municipios?orderBy=nome`
  );

  return cities.map((city) => ({
    id: city.id,
    name: city.nome
  }));
}

export async function lookupBrazilPostalCode(postalCode: string) {
  const location = await fetchJson<ViaCepResponse>(
    `${VIA_CEP_BASE_URL}/${postalCode}/json/`
  );

  if (location.erro || !location.localidade || !location.uf) {
    throw new Error("POSTAL_CODE_NOT_FOUND");
  }

  return {
    postalCode: location.cep ?? postalCode,
    state: location.uf,
    city: location.localidade,
    neighborhood: location.bairro ?? "",
    street: location.logradouro ?? "",
    ibgeCode: location.ibge ?? null
  };
}

export async function getChurchBaseLocation(
  prisma: PrismaClient,
  churchId: string
) {
  const church = await prisma.church.findUnique({
    where: {
      id: churchId
    },
    select: {
      baseCity: {
        select: {
          id: true,
          stateCode: true,
          ibgeCode: true,
          name: true,
          neighborhoods: {
            where: {
              active: true
            },
            select: {
              id: true,
              name: true
            },
            orderBy: {
              name: "asc"
            }
          }
        }
      }
    }
  });

  if (!church) {
    throw new Error("CHURCH_NOT_FOUND");
  }

  if (!church.baseCity) {
    throw new Error("BASE_CITY_NOT_CONFIGURED");
  }

  return {
    city: church.baseCity
  };
}
