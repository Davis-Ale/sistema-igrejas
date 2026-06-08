"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

type DashboardAuthGuardProps = {
  children: ReactNode;
};

export function DashboardAuthGuard({ children }: DashboardAuthGuardProps) {
  const router = useRouter();
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    const storedSession = localStorage.getItem("sistema-igrejas.session");

    if (!storedSession) {
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
