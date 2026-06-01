import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main
      style={{
        margin: "0 auto",
        maxWidth: "560px",
        minHeight: "100vh",
        padding: "48px 24px"
      }}
    >
      <LoginForm />
    </main>
  );
}
