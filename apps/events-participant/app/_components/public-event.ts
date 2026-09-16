export type PublicEvent = {
  id: string;
  title: string;
  slug: string;
  publicSlug: string | null;
  date: string;
  capacity: number;
  price: string | number;
  isPaid: boolean;
  publicRegistrationEnabled: boolean;
  waitlistEnabled: boolean;
  church: {
    name: string;
    slug: string;
  };
  registrations: Array<{
    id: string;
    status:
      | "PENDING"
      | "CONFIRMED"
      | "CANCELLED"
      | "CHECKED_IN";
    waitlistedAt: string | null;
  }>;
};
