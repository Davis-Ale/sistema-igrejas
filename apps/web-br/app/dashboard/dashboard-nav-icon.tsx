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
        display: "inline-flex",
        height: "26px",
        justifyContent: "center",
        width: "26px"
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
