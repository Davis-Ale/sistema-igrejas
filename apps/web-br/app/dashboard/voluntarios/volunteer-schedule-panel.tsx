"use client";

import { FormEvent, useEffect, useState } from "react";
import { credentialedFetch } from "../../lib/session-client";

type Ministry = {
  id: string;
  name: string;
  status: string;
  leader: { id: string; name: string };
  members: Array<{ personId: string; person: { id: string; name: string } }>;
};

type Assignment = {
  personId: string;
  name: string;
  status: "PENDING" | "CONFIRMED" | "DECLINED";
  canConfirm: boolean;
};

type Schedule = {
  id: string;
  ministryName: string;
  serviceDate: string;
  startTime: string;
  endTime: string;
  slots: Array<{ id: string; name: string; assignments: Assignment[] }>;
};

type ApiError = { message?: string };

const statusLabel = { PENDING: "Pendente", CONFIRMED: "Confirmado", DECLINED: "Recusado" };
const fieldStyle = {
  border: "1px solid rgba(148, 163, 184, 0.38)",
  borderRadius: "14px",
  boxSizing: "border-box" as const,
  font: "inherit",
  height: "48px",
  padding: "0 14px",
  width: "100%"
};

function peopleOf(ministry: Ministry | undefined) {
  if (!ministry) return [];
  const people = [ministry.leader, ...ministry.members.map((member) => member.person)];
  return people.filter((person, index) => people.findIndex((item) => item.id === person.id) === index);
}

export function VolunteerSchedulePanel({
  apiBaseUrl,
  volunteers
}: {
  apiBaseUrl: string;
  volunteers: Array<{ id: string; name: string }>;
}) {
  const [ministries, setMinistries] = useState<Ministry[] | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [ministryId, setMinistryId] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [functionName, setFunctionName] = useState("");
  const [personId, setPersonId] = useState("");
  const [blockDate, setBlockDate] = useState("");
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockPersonId, setBlockPersonId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const ministry = ministries?.find((item) => item.id === ministryId);
  const candidates = peopleOf(ministry);

  async function loadSchedules() {
    const response = await credentialedFetch(`${apiBaseUrl}/api/volunteers/schedules`);
    const data = (await response.json()) as Schedule[] | ApiError;
    if (!response.ok) {
      setError("message" in data ? data.message ?? "Não foi possível carregar as escalas." : "Não foi possível carregar as escalas.");
      return;
    }
    setSchedules(data as Schedule[]);
  }

  useEffect(() => {
    let active = true;
    void credentialedFetch(`${apiBaseUrl}/api/ministries`)
      .then(async (response) => {
        if (!active || !response.ok) return;
        const data = (await response.json()) as Ministry[];
        setMinistries(data.filter((item) => item.status === "ACTIVE"));
      })
      .catch(() => undefined);
    void loadSchedules().catch(() => {
      if (active) setError("Não foi possível carregar as escalas.");
    });
    return () => {
      active = false;
    };
  }, [apiBaseUrl]);

  async function handleSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      const created = await credentialedFetch(`${apiBaseUrl}/api/volunteers/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ministryId, serviceDate, startTime, endTime })
      });
      const schedule = (await created.json()) as Schedule | ApiError;
      if (!created.ok) {
        setError("message" in schedule ? schedule.message ?? "Não foi possível criar a escala." : "Não foi possível criar a escala.");
        return;
      }
      const slotResponse = await credentialedFetch(`${apiBaseUrl}/api/volunteers/schedules/${(schedule as Schedule).id}/slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: functionName })
      });
      const slot = (await slotResponse.json()) as { id: string; message?: string };
      if (!slotResponse.ok) {
        setError(slot.message ?? "Não foi possível criar a função.");
        await loadSchedules();
        return;
      }
      const assigned = await credentialedFetch(`${apiBaseUrl}/api/volunteers/schedules/${(schedule as Schedule).id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: slot.id, personId })
      });
      const assignment = (await assigned.json()) as ApiError;
      if (!assigned.ok) {
        setError(assignment.message ?? "Não foi possível designar o voluntário.");
        await loadSchedules();
        return;
      }
      setFunctionName("");
      setNotice("Escala registrada.");
      await loadSchedules();
    } catch {
      setError("Não foi possível registrar a escala.");
    } finally {
      setIsSaving(false);
    }
  }

  async function confirm(scheduleId: string, slotId: string, assignedPersonId: string, status: "CONFIRMED" | "DECLINED") {
    setError(null);
    setNotice(null);
    const response = await credentialedFetch(
      `${apiBaseUrl}/api/volunteers/schedules/${scheduleId}/slots/${slotId}/assignments/${assignedPersonId}/confirmation`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }
    );
    const data = (await response.json()) as ApiError;
    if (!response.ok) {
      setError(data.message ?? "Não foi possível confirmar.");
      return;
    }
    await loadSchedules();
  }

  async function handleBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      const response = await credentialedFetch(`${apiBaseUrl}/api/volunteers/unavailability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(blockPersonId ? { personId: blockPersonId } : {}),
          serviceDate: blockDate,
          startTime: blockStart,
          endTime: blockEnd
        })
      });
      const data = (await response.json()) as ApiError;
      if (!response.ok) {
        setError(data.message ?? "Não foi possível registrar a indisponibilidade.");
        return;
      }
      setNotice("Indisponibilidade registrada.");
    } catch {
      setError("Não foi possível registrar a indisponibilidade.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: "16px" }}>
      {ministries && ministries.length > 0 ? (
        <form onSubmit={handleSchedule} style={{ background: "rgba(15, 23, 42, 0.72)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "22px", display: "grid", gap: "16px", padding: "22px" }}>
          <h2 style={{ color: "#ffffff", fontSize: "20px", margin: 0 }}>Escala</h2>
          <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
              Ministério
              <select onChange={(event) => { setMinistryId(event.target.value); setPersonId(""); }} required style={fieldStyle} value={ministryId}>
                <option value="">Selecione</option>
                {ministries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
              Data
              <input onChange={(event) => setServiceDate(event.target.value)} required style={fieldStyle} type="date" value={serviceDate} />
            </label>
            <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
              Início
              <input onChange={(event) => setStartTime(event.target.value)} required style={fieldStyle} type="time" value={startTime} />
            </label>
            <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
              Fim
              <input onChange={(event) => setEndTime(event.target.value)} required style={fieldStyle} type="time" value={endTime} />
            </label>
            <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
              Função
              <input onChange={(event) => setFunctionName(event.target.value)} required style={fieldStyle} value={functionName} />
            </label>
            <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
              Voluntário
              <select onChange={(event) => setPersonId(event.target.value)} required style={fieldStyle} value={personId}>
                <option value="">Selecione</option>
                {candidates.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </label>
          </div>
          <button disabled={isSaving} style={{ background: "#2563eb", border: 0, borderRadius: "14px", color: "#ffffff", cursor: isSaving ? "not-allowed" : "pointer", font: "inherit", fontWeight: 900, justifySelf: "start", opacity: isSaving ? 0.72 : 1, padding: "13px 18px" }} type="submit">
            {isSaving ? "Salvando..." : "Registrar escala"}
          </button>
        </form>
      ) : null}

      <form onSubmit={handleBlock} style={{ background: "rgba(15, 23, 42, 0.72)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "22px", display: "grid", gap: "16px", padding: "22px" }}>
        <h2 style={{ color: "#ffffff", fontSize: "20px", margin: 0 }}>Indisponibilidade</h2>
        <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {volunteers.length > 0 ? (
            <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
              Voluntário
              <select onChange={(event) => setBlockPersonId(event.target.value)} required style={fieldStyle} value={blockPersonId}>
                <option value="">Selecione</option>
                {volunteers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </label>
          ) : null}
          <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
            Data
            <input onChange={(event) => setBlockDate(event.target.value)} required style={fieldStyle} type="date" value={blockDate} />
          </label>
          <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
            Início
            <input onChange={(event) => setBlockStart(event.target.value)} required style={fieldStyle} type="time" value={blockStart} />
          </label>
          <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
            Fim
            <input onChange={(event) => setBlockEnd(event.target.value)} required style={fieldStyle} type="time" value={blockEnd} />
          </label>
        </div>
        <button disabled={isSaving} style={{ background: "#2563eb", border: 0, borderRadius: "14px", color: "#ffffff", cursor: isSaving ? "not-allowed" : "pointer", font: "inherit", fontWeight: 900, justifySelf: "start", opacity: isSaving ? 0.72 : 1, padding: "13px 18px" }} type="submit">
          Registrar indisponibilidade
        </button>
      </form>

      {error ? <p style={{ background: "rgba(239, 68, 68, 0.14)", border: "1px solid rgba(248, 113, 113, 0.26)", borderRadius: "14px", color: "#fecaca", fontSize: "14px", margin: 0, padding: "12px 14px" }}>{error}</p> : null}
      {notice ? <p style={{ background: "rgba(34, 197, 94, 0.14)", border: "1px solid rgba(74, 222, 128, 0.26)", borderRadius: "14px", color: "#bbf7d0", fontSize: "14px", margin: 0, padding: "12px 14px" }}>{notice}</p> : null}

      <section style={{ background: "rgba(15, 23, 42, 0.58)", border: "1px solid rgba(148, 163, 184, 0.18)", borderRadius: "22px", display: "grid", gap: "10px", padding: "22px" }}>
        <h2 style={{ color: "#ffffff", fontSize: "20px", margin: 0 }}>Escalas</h2>
        {schedules.length === 0 ? <p style={{ color: "#cbd5e1", margin: 0 }}>Nenhuma escala registrada.</p> : null}
        {schedules.map((schedule) => (
          <article key={schedule.id} style={{ display: "grid", gap: "6px" }}>
            <strong style={{ color: "#ffffff" }}>{schedule.serviceDate.split("-").reverse().join("/")} · {schedule.startTime}–{schedule.endTime} · {schedule.ministryName}</strong>
            {schedule.slots.map((slot) => (
              <div key={slot.id} style={{ display: "grid", gap: "6px" }}>
                {slot.assignments.map((assignment) => (
                  <p key={`${slot.id}-${assignment.personId}`} style={{ alignItems: "center", color: "#e2e8f0", display: "flex", gap: "10px", margin: 0 }}>
                    <span>{slot.name} · {assignment.name} · {statusLabel[assignment.status]}</span>
                    {assignment.canConfirm ? (
                      <>
                        <button onClick={() => void confirm(schedule.id, slot.id, assignment.personId, "CONFIRMED")} style={{ background: "transparent", border: "1px solid rgba(74, 222, 128, 0.4)", borderRadius: "12px", color: "#bbf7d0", cursor: "pointer", font: "inherit", fontWeight: 800, padding: "6px 10px" }} type="button">Confirmar</button>
                        <button onClick={() => void confirm(schedule.id, slot.id, assignment.personId, "DECLINED")} style={{ background: "transparent", border: "1px solid rgba(248, 113, 113, 0.4)", borderRadius: "12px", color: "#fecaca", cursor: "pointer", font: "inherit", fontWeight: 800, padding: "6px 10px" }} type="button">Recusar</button>
                      </>
                    ) : null}
                  </p>
                ))}
              </div>
            ))}
          </article>
        ))}
      </section>
    </section>
  );
}
