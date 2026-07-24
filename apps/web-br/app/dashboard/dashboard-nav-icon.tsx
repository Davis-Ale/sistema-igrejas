import type { ReactNode } from "react";

type DashboardNavIconProps = {
  children: ReactNode;
};

export function DashboardNavIcon({
  children
}: DashboardNavIconProps) {
  return (
    <span
      aria-hidden="true"
      style={{
        alignItems: "center",
        background: "rgba(15, 23, 42, 0.34)",
        border: "1px solid rgba(148, 163, 184, 0.16)",
        borderRadius: "12px",
        display: "inline-flex",
        height: "30px",
        justifyContent: "center",
        width: "30px"
      }}
    >
      <svg
        fill="none"
        height="17"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
        width="17"
      >
        {children}
      </svg>
    </span>
  );
}
