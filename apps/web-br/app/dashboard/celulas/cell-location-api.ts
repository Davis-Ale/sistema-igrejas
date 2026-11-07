import { credentialedFetch } from "../../lib/session-client";

export type LocationNeighborhood = {
  id: string;
  name: string;
};

export type ChurchBaseCity = {
  id: string;
  stateCode: string;
  ibgeCode: string;
  name: string;
  neighborhoods: LocationNeighborhood[];
};

export type ChurchBaseLocation = {
  city: ChurchBaseCity;
};

type ApiErrorResponse = {
  message?: string;
};

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = (await response.json()) as ApiErrorResponse;

    throw new Error(error.message ?? "Não foi possível carregar a localização.");
  }

  return (await response.json()) as T;
}

export async function getChurchBaseLocation(
  apiBaseUrl: string
): Promise<ChurchBaseLocation> {
  const response = await credentialedFetch(`${apiBaseUrl}/api/locations/base`);

  return readResponse<ChurchBaseLocation>(response);
}
