"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { restoreAuthenticatedSession } from "../lib/session-client";

type DashboardAuthGuardProps = {
  children: ReactNode;
};

export function DashboardAuthGuard({ children }: DashboardAuthGuardProps) {
  const router = useRouter();
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    void restoreAuthenticatedSession().then((session) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setIsAllowed(true);
    });
  }, [router]);

  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
}
