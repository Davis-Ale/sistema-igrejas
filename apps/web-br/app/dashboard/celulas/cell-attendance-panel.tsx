"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { credentialedFetch } from "../../lib/session-client";

type AttendanceCell = {
  id: string;
  region: string;
  neighborhood: string;
  meetDay: string;
  meetTime: string;
  people: Array<{ id: string; name: string }>;
};

type AttendanceStatus = "PRESENT" | "ABSENT";

type AttendanceMark = {
  personId: string;
  name: string;
  status: AttendanceStatus;
};

type CellMeeting = {
  id: string;
  occurredOn: string;
  presentCount: number;
  absentCount: number;
  marks: AttendanceMark[];
};

type ApiErrorResponse = {
  message?: string;
};

type CellAttendancePanelProps = {
  apiBaseUrl: string;
  cells: AttendanceCell[];
};

function todayInBrazil(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

const fieldStyle = {
  border: "1px solid rgba(148, 163, 184, 0.38)",
  borderRadius: "14px",
  boxSizing: "border-box" as const,
  font: "inherit",
  height: "48px",
  padding: "0 14px",
  width: "100%"
};

export function CellAttendancePanel({ apiBaseUrl, cells }: CellAttendancePanelProps) {
  const [cellId, setCellId] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayInBrazil);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus | "">>({});
  const [meetings, setMeetings] = useState<CellMeeting[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const cell = useMemo(
    () => cells.find((item) => item.id === cellId) ?? null,
    [cellId, cells]
  );
  const members = cell?.people ?? [];

  useEffect(() => {
    if (!cellId) {
      setMeetings([]);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(null);

    void credentialedFetch(`${apiBaseUrl}/api/cells/${cellId}/meetings`)
      .then(async (response) => {
        const data = (await response.json()) as CellMeeting[] | ApiErrorResponse;
        if (!active) return;
        if (!response.ok) {
          setMeetings([]);
          setError("message" in data ? data.message ?? "Não foi possível carregar a frequência." : "Não foi possível carregar a frequência.");
          return;
        }
        setMeetings(data as CellMeeting[]);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar a frequência agora.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [apiBaseUrl, cellId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cell || members.length === 0) return;
    if (members.some((member) => !statuses[member.id])) {
      setSuccessMessage(null);
      setError("Marque presença ou ausência de cada membro.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const response = await credentialedFetch(`${apiBaseUrl}/api/cells/${cell.id}/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occurredOn,
          marks: members.map((member) => ({
            personId: member.id,
            status: statuses[member.id]
          }))
        })
      });
      const data = (await response.json()) as CellMeeting | ApiErrorResponse;
      if (!response.ok) {
        setError("message" in data ? data.message ?? "Não foi possível registrar a frequência." : "Não foi possível registrar a frequência.");
        return;
      }
      const saved = data as CellMeeting;
      setMeetings((current) => [saved, ...current.filter((meeting) => meeting.occurredOn !== saved.occurredOn)]);
      setSuccessMessage("Frequência registrada.");
    } catch {
      setError("Não foi possível registrar a frequência agora.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
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
      <h2 style={{ color: "#ffffff", fontSize: "20px", margin: 0 }}>Frequência</h2>

      <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
          Célula
          <select
            onChange={(event) => {
              setCellId(event.target.value);
              setStatuses({});
              setSuccessMessage(null);
              setError(null);
            }}
            required
            style={fieldStyle}
            value={cellId}
          >
            <option value="">Selecione uma célula</option>
            {cells.map((item) => (
              <option key={item.id} value={item.id}>
                {item.neighborhood || item.region} | {item.meetDay} às {item.meetTime}
              </option>
            ))}
          </select>
        </label>

        <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
          Data do encontro
          <input
            max={todayInBrazil()}
            onChange={(event) => setOccurredOn(event.target.value)}
            required
            style={fieldStyle}
            type="date"
            value={occurredOn}
          />
        </label>
      </div>

      {cell && members.length === 0 ? (
        <p style={{ color: "#cbd5e1", margin: 0 }}>Esta célula não tem membros vinculados.</p>
      ) : null}

      {members.length > 0 ? (
        <div style={{ display: "grid", gap: "10px" }}>
          {members.map((member) => (
            <label key={member.id} style={{ alignItems: "center", color: "#e2e8f0", display: "grid", gap: "12px", gridTemplateColumns: "1fr 180px" }}>
              <span>{member.name}</span>
              <select
                onChange={(event) => setStatuses((current) => ({ ...current, [member.id]: event.target.value as AttendanceStatus | "" }))}
                required
                style={fieldStyle}
                value={statuses[member.id] ?? ""}
              >
                <option value="">Selecione</option>
                <option value="PRESENT">Presente</option>
                <option value="ABSENT">Ausente</option>
              </select>
            </label>
          ))}
        </div>
      ) : null}

      <button
        disabled={isSaving || !cell || members.length === 0}
        style={{
          background: "#2563eb",
          border: 0,
          borderRadius: "14px",
          color: "#ffffff",
          cursor: isSaving || !cell || members.length === 0 ? "not-allowed" : "pointer",
          font: "inherit",
          fontWeight: 900,
          justifySelf: "start",
          opacity: isSaving || !cell || members.length === 0 ? 0.72 : 1,
          padding: "13px 18px"
        }}
        type="submit"
      >
        {isSaving ? "Registrando..." : "Registrar frequência"}
      </button>

      {error ? (
        <p style={{ background: "rgba(239, 68, 68, 0.14)", border: "1px solid rgba(248, 113, 113, 0.26)", borderRadius: "14px", color: "#fecaca", fontSize: "14px", margin: 0, padding: "12px 14px" }}>
          {error}
        </p>
      ) : null}
      {successMessage ? (
        <p style={{ background: "rgba(34, 197, 94, 0.14)", border: "1px solid rgba(74, 222, 128, 0.26)", borderRadius: "14px", color: "#bbf7d0", fontSize: "14px", margin: 0, padding: "12px 14px" }}>
          {successMessage}
        </p>
      ) : null}

      {cell ? (
        <div style={{ display: "grid", gap: "8px" }}>
          <strong style={{ color: "#ffffff" }}>Encontros registrados</strong>
          {isLoading ? <p style={{ color: "#cbd5e1", margin: 0 }}>Carregando frequência...</p> : null}
          {!isLoading && meetings.length === 0 ? <p style={{ color: "#cbd5e1", margin: 0 }}>Nenhum encontro registrado.</p> : null}
          {meetings.map((meeting) => (
            <p key={meeting.id} style={{ color: "#e2e8f0", margin: 0 }}>
              {meeting.occurredOn.split("-").reverse().join("/")} · {meeting.presentCount} presentes · {meeting.absentCount} ausentes
            </p>
          ))}
        </div>
      ) : null}
    </form>
  );
}
