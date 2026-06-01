export default function DashboardPage() {
  return (
    <main
      style={{
        margin: "0 auto",
        maxWidth: "960px",
        minHeight: "100vh",
        padding: "48px 24px"
      }}
    >
      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "24px",
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.08)",
          padding: "32px"
        }}
      >
        <p
          style={{
            color: "#2563eb",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            margin: "0 0 12px",
            textTransform: "uppercase"
          }}
        >
          Painel
        </p>

        <h1
          style={{
            color: "#0f172a",
            fontSize: "32px",
            lineHeight: 1.1,
            margin: 0
          }}
        >
          Sistema Igrejas
        </h1>
      </section>
    </main>
  );
}
