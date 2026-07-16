export type BrazilState = {
  id: number;
  code: string;
  name: string;
};

export type BrazilCity = {
  id: number;
  name: string;
};

export type PostalCodeLocation = {
  postalCode: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  ibgeCode: string | null;
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

export async function listBrazilStates(
  apiBaseUrl: string,
  token: string
): Promise<BrazilState[]> {
  const response = await fetch(`${apiBaseUrl}/api/locations/states`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return readResponse<BrazilState[]>(response);
}

export async function listBrazilCities(
  apiBaseUrl: string,
  token: string,
  state: string
): Promise<BrazilCity[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/locations/cities?state=${encodeURIComponent(state)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return readResponse<BrazilCity[]>(response);
}

export async function lookupBrazilPostalCode(
  apiBaseUrl: string,
  token: string,
  postalCode: string
): Promise<PostalCodeLocation> {
  const response = await fetch(
    `${apiBaseUrl}/api/locations/postal-codes/${encodeURIComponent(postalCode)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return readResponse<PostalCodeLocation>(response);
}
