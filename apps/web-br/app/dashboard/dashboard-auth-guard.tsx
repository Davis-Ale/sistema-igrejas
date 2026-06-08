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
      church?: { id?: string; name?: string };
      user?: { id?: string; email?: string };
    };

    return Boolean(
      parsedSession.church?.id &&
        parsedSession.church?.name &&
        parsedSession.user?.id &&
        parsedSession.user?.email
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
