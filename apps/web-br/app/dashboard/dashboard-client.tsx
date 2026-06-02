"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardShell } from "./dashboard-shell";
import { DashboardSession } from "./dashboard-types";

export function DashboardClient() {
  const router = useRouter();
  const [session, setSession] = useState<DashboardSession | null>(null);

  useEffect(() => {
    const storedSession = localStorage.getItem("sistema-igrejas.session");

    if (!storedSession) {
      router.replace("/login");
      return;
    }

    setSession(JSON.parse(storedSession) as DashboardSession);
  }, [router]);

  if (!session) {
    return null;
  }

  return <DashboardShell session={session} />;
}
