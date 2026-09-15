export type DashboardSession = {
  user: {
    email: string;
    role: string;
  };
  church: {
    name: string;
    status: string;
    trialEndsAt: string | null;
  };
};
