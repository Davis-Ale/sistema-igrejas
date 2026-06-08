"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

type DashboardAuthGuardProps = {
  children: ReactNode;
};

function hasValidSession() {
  const storedSession = localStorage.getItem("sistema-igrejas.session");

  if (!storedSession) {
    return false;
  }

  try {
    const parsedSession = JSON.parse(storedSession) as {
      church?: { name?: string; status?: string; trialEndsAt?: string | null };
      user?: { email?: string; role?: string };
    };

    return Boolean(
      parsedSession.church?.name &&
        parsedSession.church?.status &&
        parsedSession.user?.email &&
        parsedSession.user?.role
    );
  } catch {
    localStorage.removeItem("sistema-igrejas.session");
    return false;
  }
}

export function DashboardAuthGuard({ children }: DashboardAuthGuardProps) {
  const router = useRouter();
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    if (!hasValidSession()) {
      router.replace("/login");
      return;
    }

    setIsAllowed(true);
  }, [router]);

  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
}
