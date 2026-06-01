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
            margin: 0
          }}
        >
          Base inicial do frontend criada. O próximo passo será ligar a tela de login
          à API real, usando o acesso da igreja em período de degustação.
        </p>
      </section>
    </main>
  );
}
