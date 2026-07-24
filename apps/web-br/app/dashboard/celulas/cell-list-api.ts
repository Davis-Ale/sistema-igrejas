export type CellStatus = "ACTIVE" | "ARCHIVED";
export type CellStatusFilter = CellStatus | "ALL";

export type CellListItem = {
  id: string;
  churchId: string;
  campusId: string | null;
  leaderId: string;
  name: string;
  region: string;
  state: string;
  city: string;
  neighborhood: string;
  meetDay: string;
  meetTime: string;
  profile: string;
  status: CellStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  leader: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  };
};

export type CellListPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CellListResponse = {
  items: CellListItem[];
  pagination: CellListPagination;
};

export type CellListFilters = {
  page: number;
  pageSize: number;
  status: CellStatusFilter;
  neighborhood?: string;
  profile?: string;
  leader?: string;
};

export type CellStatusResponse = {
  id: string;
  status: CellStatus;
  archivedAt: string | null;
  updatedAt: string;
};

type ApiErrorResponse = {
  message?: string;
};

async function readApiError(
  response: Response,
  fallbackMessage: string
): Promise<Error> {
  const error = (await response.json()) as ApiErrorResponse;

  return new Error(error.message ?? fallbackMessage);
}

export async function searchCells(
  apiBaseUrl: string,
  token: string,
  filters: CellListFilters
): Promise<CellListResponse> {
  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
    status: filters.status
  });

  if (filters.neighborhood?.trim()) {
    params.set("neighborhood", filters.neighborhood.trim());
  }

  if (filters.profile?.trim()) {
    params.set("profile", filters.profile.trim());
  }

  if (filters.leader?.trim()) {
    params.set("leader", filters.leader.trim());
  }

  const response = await fetch(
    `${apiBaseUrl}/api/cells/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!response.ok) {
    throw await readApiError(
      response,
      "Não foi possível pesquisar as células."
    );
  }

  return (await response.json()) as CellListResponse;
}

async function updateCellStatus(
  apiBaseUrl: string,
  token: string,
  cellId: string,
  action: "archive" | "reactivate"
): Promise<CellStatusResponse> {
  const response = await fetch(
    `${apiBaseUrl}/api/cells/${encodeURIComponent(cellId)}/${action}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "PATCH"
    }
  );

  if (!response.ok) {
    throw await readApiError(
      response,
      action === "archive"
        ? "Não foi possível arquivar a célula."
        : "Não foi possível reativar a célula."
    );
  }

  return (await response.json()) as CellStatusResponse;
}

export async function archiveCell(
  apiBaseUrl: string,
  token: string,
  cellId: string
): Promise<CellStatusResponse> {
  return updateCellStatus(apiBaseUrl, token, cellId, "archive");
}

export async function reactivateCell(
  apiBaseUrl: string,
  token: string,
  cellId: string
): Promise<CellStatusResponse> {
  return updateCellStatus(apiBaseUrl, token, cellId, "reactivate");
}
