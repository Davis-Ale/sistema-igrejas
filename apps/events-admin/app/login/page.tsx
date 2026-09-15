import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main
      style={{
        alignItems: "center",
        background:
          "radial-gradient(circle at top left, rgba(59, 130, 246, 0.24), transparent 34%), linear-gradient(135deg, #0f172a 0%, #111827 45%, #020617 100%)",
        display: "grid",
        minHeight: "100vh",
        padding: "24px"
      }}
    >
      <div
        style={{
          margin: "0 auto",
          maxWidth: "520px",
          width: "100%"
        }}
      >
        <LoginForm />
      </div>
    </main>
  );
}
