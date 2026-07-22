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
  neighborhood?: string;
  profile?: string;
  leader?: string;
};

type ApiErrorResponse = {
  message?: string;
};

export async function searchCells(
  apiBaseUrl: string,
  token: string,
  filters: CellListFilters
): Promise<CellListResponse> {
  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize)
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
    const error = (await response.json()) as ApiErrorResponse;

    throw new Error(
      error.message ?? "Não foi possível pesquisar as células."
    );
  }

  return (await response.json()) as CellListResponse;
}
