export const EVENTS_ACCESS_MODES = ["CHURCH_SUITE", "EVENTS_SAAS"] as const;

export type EventsAccessMode = (typeof EVENTS_ACCESS_MODES)[number];

export const EVENTS_PRODUCT_ACCESS = {
  implementation: "single",
  app: "apps/events-admin",
  domainPackage: "packages/events",
  churchHandoffHost: "apps/web-br",
  preserve: [
    "screens",
    "features",
    "contracts",
    "data",
    "rbac",
    "checkout",
    "flows"
  ],
  forbidden: [
    "duplicate-events-in-web-br",
    "redesign-or-rebuild-screens",
    "drop-church-suite-handoff",
    "require-church-dashboard-for-events-saas",
    "second-checkout-or-rbac"
  ],
  modes: {
    CHURCH_SUITE: {
      hostApp: "apps/web-br",
      entryPath: "/dashboard/eventos",
      handoffPath: "/auth/handoff",
      destinationPath: "/dashboard/eventos",
      appUrlEnv: "NEXT_PUBLIC_EVENTS_APP_URL",
      churchAppUrlEnv: "NEXT_PUBLIC_CHURCH_APP_URL"
    },
    EVENTS_SAAS: {
      hostApp: "apps/events-admin",
      entryPath: "/login",
      destinationPath: "/dashboard/eventos",
      apiBaseEnv: "NEXT_PUBLIC_API_BASE_URL"
    }
  }
} as const;
