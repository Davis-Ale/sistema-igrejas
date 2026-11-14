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

type AssignmentStatus = "PENDING" | "CONFIRMED" | "DECLINED" | "REPLACED";

type Assignment = {
  personId: string;
  name: string;
  status: AssignmentStatus;
  canConfirm: boolean;
  canSubstitute: boolean;
};

type Substitution = {
  id: string;
  fromName: string;
  toName: string;
};

type Schedule = {
  id: string;
  seriesId: string | null;
  ministryId: string;
  ministryName: string;
  serviceDate: string;
  startTime: string;
  endTime: string;
  slots: Array<{ id: string; name: string; assignments: Assignment[]; substitutions: Substitution[] }>;
};

type ApiError = { message?: string };

const statusLabel: Record<AssignmentStatus, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  DECLINED: "Recusado",
  REPLACED: "Substituído"
};

const statusColor: Record<AssignmentStatus, string> = {
  PENDING: "#fde68a",
  CONFIRMED: "#bbf7d0",
  DECLINED: "#fecaca",
  REPLACED: "#cbd5e1"
};

const fieldStyle = {
  border: "1px solid rgba(148, 163, 184, 0.38)",
  borderRadius: "14px",
  boxSizing: "border-box" as const,
  font: "inherit",
  height: "48px",
  padding: "0 14px",
  width: "100%"
};

const cardStyle = {
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148, 163, 184, 0.2)",
  borderRadius: "22px",
  display: "grid",
  gap: "16px",
  padding: "22px"
};

const buttonStyle = {
  background: "#2563eb",
  border: 0,
  borderRadius: "14px",
  color: "#ffffff",
  font: "inherit",
  fontWeight: 900,
  justifySelf: "start" as const,
  padding: "13px 18px"
};

function peopleOf(ministry: Ministry | undefined) {
  if (!ministry) return [];
  const people = [ministry.leader, ...ministry.members.map((member) => member.person)];
  return people.filter((person, index) => people.findIndex((item) => item.id === person.id) === index);
}

function dayLabel(value: string) {
  return value.split("-").reverse().join("/");
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
  const [weeks, setWeeks] = useState("1");
  const [blockDate, setBlockDate] = useState("");
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockPersonId, setBlockPersonId] = useState("");
  const [swapTarget, setSwapTarget] = useState("");
  const [swapPersonId, setSwapPersonId] = useState("");
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
      if (weeks !== "1") {
        const response = await credentialedFetch(`${apiBaseUrl}/api/volunteers/schedules/recurrence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ministryId,
            serviceDate,
            startTime,
            endTime,
            weeks: Number(weeks),
            slotName: functionName,
            personId
          })
        });
        const data = (await response.json()) as ApiError;
        if (!response.ok) {
          setError(data.message ?? "Não foi possível repetir a escala.");
          return;
        }
        setFunctionName("");
        setNotice("Escala semanal registrada.");
        await loadSchedules();
        return;
      }
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

  async function substitute(scheduleId: string, slotId: string, fromPersonId: string) {
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      const response = await credentialedFetch(
        `${apiBaseUrl}/api/volunteers/schedules/${scheduleId}/slots/${slotId}/assignments/${fromPersonId}/substitution`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId: swapPersonId }) }
      );
      const data = (await response.json()) as ApiError;
      if (!response.ok) {
        setError(data.message ?? "Não foi possível substituir.");
        return;
      }
      setSwapTarget("");
      setSwapPersonId("");
      setNotice("Substituição registrada.");
      await loadSchedules();
    } catch {
      setError("Não foi possível substituir.");
    } finally {
      setIsSaving(false);
    }
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

  const rows = schedules.flatMap((schedule) => {
    const lines = schedule.slots.flatMap((slot) => slot.assignments.map((assignment) => ({ schedule, slot, assignment })));
    return lines.length > 0 ? lines : schedule.slots.map((slot) => ({ schedule, slot, assignment: null }));
  });

  return (
    <section style={{ display: "grid", gap: "16px" }}>
      <section style={{ ...cardStyle, background: "rgba(15, 23, 42, 0.58)" }}>
        <h2 style={{ color: "#ffffff", fontSize: "20px", margin: 0 }}>Escalas</h2>
        {schedules.length === 0 ? <p style={{ color: "#cbd5e1", margin: 0 }}>Nenhuma escala registrada.</p> : null}
        {rows.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", minWidth: "760px", width: "100%" }}>
              <thead>
                <tr>
                  {["Data", "Horário", "Ministério", "Função", "Voluntário", "Situação", ""].map((label) => (
                    <th key={label || "actions"} style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 800, padding: "0 10px 10px 0", textAlign: "left" }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ schedule, slot, assignment }) => {
                  const key = assignment ? `${schedule.id}-${slot.id}-${assignment.personId}` : `${schedule.id}-${slot.id}`;
                  const open = swapTarget === key;
                  const options = peopleOf(ministries?.find((item) => item.id === schedule.ministryId)).filter((person) => person.id !== assignment?.personId);
                  return (
                    <tr key={key} style={{ borderTop: "1px solid rgba(148, 163, 184, 0.16)" }}>
                      <td style={{ color: "#ffffff", padding: "12px 10px 12px 0" }}>{dayLabel(schedule.serviceDate)}{schedule.seriesId ? " · Semanal" : ""}</td>
                      <td style={{ color: "#e2e8f0", padding: "12px 10px 12px 0" }}>{schedule.startTime}–{schedule.endTime}</td>
                      <td style={{ color: "#e2e8f0", padding: "12px 10px 12px 0" }}>{schedule.ministryName}</td>
                      <td style={{ color: "#e2e8f0", padding: "12px 10px 12px 0" }}>{slot.name}</td>
                      <td style={{ color: "#e2e8f0", padding: "12px 10px 12px 0" }}>
                        <div>{assignment?.name ?? "—"}</div>
                        {assignment === null || slot.assignments[0]?.personId === assignment.personId ? slot.substitutions.map((item) => (
                          <div key={item.id} style={{ color: "#94a3b8", fontSize: "12px" }}>{item.fromName} → {item.toName}</div>
                        )) : null}
                      </td>
                      <td style={{ color: assignment ? statusColor[assignment.status] : "#94a3b8", fontWeight: 800, padding: "12px 10px 12px 0" }}>{assignment ? statusLabel[assignment.status] : "—"}</td>
                      <td style={{ padding: "12px 0" }}>
                        {assignment?.canConfirm ? (
                          <span style={{ display: "flex", gap: "8px" }}>
                            <button onClick={() => void confirm(schedule.id, slot.id, assignment.personId, "CONFIRMED")} style={{ background: "transparent", border: "1px solid rgba(74, 222, 128, 0.4)", borderRadius: "12px", color: "#bbf7d0", cursor: "pointer", font: "inherit", fontWeight: 800, padding: "6px 10px" }} type="button">Confirmar</button>
                            <button onClick={() => void confirm(schedule.id, slot.id, assignment.personId, "DECLINED")} style={{ background: "transparent", border: "1px solid rgba(248, 113, 113, 0.4)", borderRadius: "12px", color: "#fecaca", cursor: "pointer", font: "inherit", fontWeight: 800, padding: "6px 10px" }} type="button">Recusar</button>
                          </span>
                        ) : null}
                        {assignment?.canSubstitute ? (
                          <span style={{ display: "flex", gap: "8px", marginTop: assignment.canConfirm ? "8px" : 0 }}>
                            {open ? (
                              <>
                                <select onChange={(event) => setSwapPersonId(event.target.value)} style={{ ...fieldStyle, height: "36px", width: "160px" }} value={swapPersonId}>
                                  <option value="">Selecione</option>
                                  {options.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                                </select>
                                <button disabled={isSaving || !swapPersonId} onClick={() => void substitute(schedule.id, slot.id, assignment.personId)} style={{ background: "#2563eb", border: 0, borderRadius: "12px", color: "#ffffff", cursor: "pointer", font: "inherit", fontWeight: 800, padding: "6px 10px" }} type="button">Trocar</button>
                              </>
                            ) : (
                              <button onClick={() => { setSwapTarget(key); setSwapPersonId(""); }} style={{ background: "transparent", border: "1px solid rgba(96, 165, 250, 0.4)", borderRadius: "12px", color: "#bfdbfe", cursor: "pointer", font: "inherit", fontWeight: 800, padding: "6px 10px" }} type="button">Substituir</button>
                            )}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {ministries && ministries.length > 0 ? (
        <form onSubmit={handleSchedule} style={cardStyle}>
          <h2 style={{ color: "#ffffff", fontSize: "20px", margin: 0 }}>Nova escala</h2>
          <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
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
              Repetir
              <select onChange={(event) => setWeeks(event.target.value)} style={fieldStyle} value={weeks}>
                <option value="1">Esta data</option>
                <option value="4">4 semanas</option>
                <option value="8">8 semanas</option>
                <option value="12">12 semanas</option>
              </select>
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
          <button disabled={isSaving} style={{ ...buttonStyle, cursor: isSaving ? "not-allowed" : "pointer", opacity: isSaving ? 0.72 : 1 }} type="submit">
            {isSaving ? "Salvando..." : "Registrar"}
          </button>
        </form>
      ) : null}

      <form onSubmit={handleBlock} style={cardStyle}>
        <h2 style={{ color: "#ffffff", fontSize: "20px", margin: 0 }}>Indisponibilidade</h2>
        <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
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
        <button disabled={isSaving} style={{ ...buttonStyle, cursor: isSaving ? "not-allowed" : "pointer", opacity: isSaving ? 0.72 : 1 }} type="submit">
          Registrar indisponibilidade
        </button>
      </form>

      {error ? <p style={{ background: "rgba(239, 68, 68, 0.14)", border: "1px solid rgba(248, 113, 113, 0.26)", borderRadius: "14px", color: "#fecaca", fontSize: "14px", margin: 0, padding: "12px 14px" }}>{error}</p> : null}
      {notice ? <p style={{ background: "rgba(34, 197, 94, 0.14)", border: "1px solid rgba(74, 222, 128, 0.26)", borderRadius: "14px", color: "#bbf7d0", fontSize: "14px", margin: 0, padding: "12px 14px" }}>{notice}</p> : null}
    </section>
  );
}
