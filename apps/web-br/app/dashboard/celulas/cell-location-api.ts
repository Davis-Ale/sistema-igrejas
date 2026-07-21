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
  apiBaseUrl: string,
  token: string
): Promise<ChurchBaseLocation> {
  const response = await fetch(`${apiBaseUrl}/api/locations/base`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return readResponse<ChurchBaseLocation>(response);
}
