import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        alignItems: "center",
        display: "flex",
        minHeight: "100vh",
        padding: "32px"
      }}
    >
      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "24px",
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.08)",
          margin: "0 auto",
          maxWidth: "720px",
          padding: "40px",
          width: "100%"
        }}
      >
        <p
          style={{
            color: "#2563eb",
            fontSize: "14px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            margin: "0 0 16px",
            textTransform: "uppercase"
          }}
        >
          Sistema Igrejas
        </p>

        <h1
          style={{
            color: "#0f172a",
            fontSize: "40px",
            lineHeight: 1.1,
            margin: "0 0 16px"
          }}
        >
          Gestão da igreja em um só lugar.
        </h1>

        <p
          style={{
            color: "#475569",
            fontSize: "18px",
            lineHeight: 1.7,
            margin: "0 0 28px"
          }}
        >
          Entre com o acesso da igreja em período de degustação para testar o
          fluxo real conectado à API.
        </p>

        <Link
          href="/login"
          style={{
            background: "#2563eb",
            borderRadius: "999px",
            color: "#ffffff",
            display: "inline-flex",
            fontSize: "16px",
            fontWeight: 700,
            padding: "14px 22px"
          }}
        >
          Acessar sistema
        </Link>
      </section>
    </main>
  );
}
