"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  logoutSession,
  restoreAuthenticatedSession
} from "../lib/session-client";
import { DashboardShell } from "./dashboard-shell";
import type { DashboardSession } from "./dashboard-types";

export function DashboardClient() {
  const router = useRouter();
  const [session, setSession] =
    useState<DashboardSession | null>(null);

  useEffect(() => {
    void restoreAuthenticatedSession().then((parsedSession) => {
      if (!parsedSession) {
        router.replace("/login");
        return;
      }

      setSession({
        user: {
          email: parsedSession.user.email,
          role: parsedSession.user.role
        },
        church: {
          name: parsedSession.church.name,
          status: parsedSession.church.status,
          trialEndsAt: parsedSession.church.trialEndsAt ?? null
        }
      });
    });
  }, [router]);

  async function handleLogout() {
    await logoutSession();
    setSession(null);
    router.replace("/login");
    router.refresh();
  }

  if (!session) {
    return null;
  }

  return (
    <DashboardShell
      onLogout={handleLogout}
      session={session}
    />
  );
}
