"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { DashboardAuthGuard } from "../dashboard-auth-guard";

type LoginSession = {
  token: string;
};

type MemberRole = "PASTOR" | "LEADER" | "VOLUNTEER" | "MEMBER";

type Member = {
  id: string;
  campusId: string | null;
  name: string;
  phone: string;
  email: string | null;
  role: MemberRole;
  volunteerStatus: string;
  createdAt: string;
  updatedAt: string;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333";

const roleLabels: Record<MemberRole, string> = {
  PASTOR: "Pastor",
  LEADER: "Líder",
  VOLUNTEER: "Voluntário",
  MEMBER: "Membro"
};

export default function MembrosPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("MEMBER");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function getSessionToken() {
    const storedSession = localStorage.getItem("sistema-igrejas.session");

    if (!storedSession) {
      return null;
    }

    try {
      const parsedSession = JSON.parse(storedSession) as LoginSession;

      return parsedSession.token;
    } catch {
      localStorage.removeItem("sistema-igrejas.session");
      return null;
    }
  }

  async function loadMembers() {
    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/members`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível carregar os membros.");
        return;
      }

      const data = (await response.json()) as Member[];

      setMembers(data);
    } catch {
      setError("Não foi possível carregar os membros agora.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/members`, {
        body: JSON.stringify({
          email,
          name,
          phone,
          role
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível cadastrar o membro.");
        return;
      }

      const createdMember = (await response.json()) as Member;

      setMembers((currentMembers) =>
        [...currentMembers, createdMember].sort((firstMember, secondMember) =>
          firstMember.name.localeCompare(secondMember.name, "pt-BR")
        )
      );
      setName("");
      setPhone("");
      setEmail("");
      setRole("MEMBER");
      setSuccessMessage("Membro cadastrado com sucesso.");
    } catch {
      setError("Não foi possível cadastrar o membro agora.");
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    void loadMembers();
  }, []);

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
            display: "grid",
            gap: "28px",
            margin: "0 auto",
            maxWidth: "1120px",
            padding: "28px"
          }}
        >
          <div>
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

            <p
              style={{
                color: "#60a5fa",
                fontSize: "13px",
                fontWeight: 900,
                letterSpacing: "0.08em",
                margin: "0 0 14px",
                textTransform: "uppercase"
              }}
            >
              Membros
            </p>

            <h1
              style={{
                color: "#ffffff",
                fontSize: "30px",
                letterSpacing: "-0.04em",
                lineHeight: 1.12,
                margin: "0 0 12px"
              }}
            >
              Gestão de membros
            </h1>

            <p
              style={{
                color: "#cbd5e1",
                fontSize: "15px",
                lineHeight: 1.6,
                margin: 0,
                maxWidth: "760px"
              }}
            >
              Cadastre e acompanhe membros reais vinculados à igreja autenticada.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{
              background: "rgba(15, 23, 42, 0.72)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "22px",
              display: "grid",
              gap: "16px",
              padding: "22px"
            }}
          >
            <h2
              style={{
                color: "#ffffff",
                fontSize: "20px",
                margin: 0
              }}
            >
              Cadastrar membro
            </h2>

            <div
              style={{
                display: "grid",
                gap: "14px",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
              }}
            >
              <label
                style={{
                  color: "#cbd5e1",
                  display: "grid",
                  fontSize: "14px",
                  fontWeight: 800,
                  gap: "8px"
                }}
              >
                Nome
                <input
                  onChange={(event) => setName(event.target.value)}
                  required
                  style={{
                    border: "1px solid rgba(148, 163, 184, 0.38)",
                    borderRadius: "14px",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="text"
                  value={name}
                />
              </label>

              <label
                style={{
                  color: "#cbd5e1",
                  display: "grid",
                  fontSize: "14px",
                  fontWeight: 800,
                  gap: "8px"
                }}
              >
                Telefone
                <input
                  onChange={(event) => setPhone(event.target.value)}
                  required
                  style={{
                    border: "1px solid rgba(148, 163, 184, 0.38)",
                    borderRadius: "14px",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="tel"
                  value={phone}
                />
              </label>

              <label
                style={{
                  color: "#cbd5e1",
                  display: "grid",
                  fontSize: "14px",
                  fontWeight: 800,
                  gap: "8px"
                }}
              >
                E-mail
                <input
                  onChange={(event) => setEmail(event.target.value)}
                  style={{
                    border: "1px solid rgba(148, 163, 184, 0.38)",
                    borderRadius: "14px",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="email"
                  value={email}
                />
              </label>

              <label
                style={{
                  color: "#cbd5e1",
                  display: "grid",
                  fontSize: "14px",
                  fontWeight: 800,
                  gap: "8px"
                }}
              >
                Perfil
                <select
                  onChange={(event) => setRole(event.target.value as MemberRole)}
                  style={{
                    border: "1px solid rgba(148, 163, 184, 0.38)",
                    borderRadius: "14px",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  value={role}
                >
                  <option value="MEMBER">Membro</option>
                  <option value="LEADER">Líder</option>
                  <option value="VOLUNTEER">Voluntário</option>
                  <option value="PASTOR">Pastor</option>
                </select>
              </label>
            </div>

            {error ? (
              <p
                style={{
                  background: "rgba(127, 29, 29, 0.42)",
                  border: "1px solid rgba(248, 113, 113, 0.32)",
                  borderRadius: "14px",
                  color: "#fecaca",
                  margin: 0,
                  padding: "12px 14px"
                }}
              >
                {error}
              </p>
            ) : null}

            {successMessage ? (
              <p
                style={{
                  background: "rgba(20, 83, 45, 0.42)",
                  border: "1px solid rgba(74, 222, 128, 0.32)",
                  borderRadius: "14px",
                  color: "#bbf7d0",
                  margin: 0,
                  padding: "12px 14px"
                }}
              >
                {successMessage}
              </p>
            ) : null}

            <button
              disabled={isSubmitting}
              style={{
                background: isSubmitting ? "#64748b" : "#2563eb",
                border: 0,
                borderRadius: "999px",
                color: "#ffffff",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                font: "inherit",
                fontWeight: 900,
                justifySelf: "start",
                padding: "13px 22px"
              }}
              type="submit"
            >
              {isSubmitting ? "Cadastrando..." : "Cadastrar membro"}
            </button>
          </form>

          <section
            style={{
              background: "rgba(15, 23, 42, 0.72)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "22px",
              overflow: "hidden"
            }}
          >
            <div
              style={{
                alignItems: "center",
                borderBottom: "1px solid rgba(148, 163, 184, 0.16)",
                display: "flex",
                justifyContent: "space-between",
                padding: "18px 20px"
              }}
            >
              <h2
                style={{
                  color: "#ffffff",
                  fontSize: "20px",
                  margin: 0
                }}
              >
                Membros cadastrados
              </h2>

              <span
                style={{
                  color: "#93c5fd",
                  fontSize: "14px",
                  fontWeight: 900
                }}
              >
                {members.length} registro(s)
              </span>
            </div>

            {isLoading ? (
              <p
                style={{
                  color: "#cbd5e1",
                  margin: 0,
                  padding: "20px"
                }}
              >
                Carregando membros...
              </p>
            ) : members.length === 0 ? (
              <p
                style={{
                  color: "#cbd5e1",
                  margin: 0,
                  padding: "20px"
                }}
              >
                Nenhum membro cadastrado ainda.
              </p>
            ) : (
              <div
                style={{
                  display: "grid"
                }}
              >
                {members.map((member) => (
                  <article
                    key={member.id}
                    style={{
                      borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
                      display: "grid",
                      gap: "8px",
                      padding: "18px 20px"
                    }}
                  >
                    <strong
                      style={{
                        color: "#ffffff",
                        fontSize: "16px"
                      }}
                    >
                      {member.name}
                    </strong>

                    <span
                      style={{
                        color: "#cbd5e1",
                        fontSize: "14px"
                      }}
                    >
                      {member.phone}
                      {member.email ? ` · ${member.email}` : ""}
                    </span>

                    <span
                      style={{
                        color: "#93c5fd",
                        fontSize: "13px",
                        fontWeight: 900
                      }}
                    >
                      {roleLabels[member.role]}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </main>
    </DashboardAuthGuard>
  );
}
