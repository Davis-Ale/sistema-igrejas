import Link from "next/link";
import { DashboardAuthGuard } from "../dashboard-auth-guard";

export default function AssistentePage() {
  return (
    <DashboardAuthGuard>
      <main
        style={{
          background:
            "radial-gradient(circle at top left, rgba(59, 130, 246, 0.22), transparent 34%), linear-gradient(135deg, #0f172a 0%, #111827 45%, #020617 100%)",
          color: "#f8fafc",
          minHeight: "100vh",
          padding: "40px"
        }}
      >
        <section
          style={{
            background:
              "linear-gradient(135deg, rgba(15, 23, 42, 0.86), rgba(30, 41, 59, 0.74))",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            borderRadius: "28px",
            boxShadow: "0 28px 90px rgba(2, 6, 23, 0.36)",
            margin: "0 auto",
            maxWidth: "1040px",
            padding: "28px"
          }}
        >
          <Link
            href="/dashboard"
            style={{
              color: "#93c5fd",
              display: "inline-flex",
              fontSize: "14px",
              fontWeight: 800,
              marginBottom: "22px",
              textDecoration: "none"
            }}
          >
            ← Voltar ao painel
          </Link>


        </section>
      </main>
    </DashboardAuthGuard>
  );
}
