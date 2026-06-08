"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardShell } from "./dashboard-shell";
import { DashboardSession } from "./dashboard-types";

function parseDashboardSession() {
  const storedSession = localStorage.getItem("sistema-igrejas.session");

  if (!storedSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(storedSession) as DashboardSession;

    if (
      !parsedSession.church?.name ||
      !parsedSession.church?.status ||
      !parsedSession.user?.email ||
      !parsedSession.user?.role
    ) {
      localStorage.removeItem("sistema-igrejas.session");
      return null;
    }

    return parsedSession;
  } catch {
    localStorage.removeItem("sistema-igrejas.session");
    return null;
  }
}

export function DashboardClient() {
  const router = useRouter();
  const [session, setSession] = useState<DashboardSession | null>(null);

  useEffect(() => {
    const parsedSession = parseDashboardSession();

    if (!parsedSession) {
      router.replace("/login");
      return;
    }

    setSession(parsedSession);
  }, [router]);

  if (!session) {
    return null;
  }

  return <DashboardShell session={session} />;
}
