"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "../event-settings.module.css";

export function EventCoverEditor({ eventId, apiBaseUrl, getToken }: {
  eventId: string; apiBaseUrl: string; getToken: () => string | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [saved, setSaved] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const upload = useRef<AbortController | null>(null);
  const url = `${apiBaseUrl}/api/events/${encodeURIComponent(eventId)}/cover`;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(url, { headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (response.status === 404) return;
      if (!response.ok) throw new Error("Não foi possível carregar a capa salva.");
      const image = await response.blob();
      if (!controller.signal.aborted) setSaved(image);
    }).catch(() => {
      if (!controller.signal.aborted) setError("Não foi possível carregar a capa salva.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); upload.current?.abort(); };
  }, [url, getToken]);

  useEffect(() => {
    const image = file ?? saved;
    if (!image) { setPreview(""); return; }
    const objectUrl = URL.createObjectURL(image);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, saved]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || pending.current) return;
    pending.current = true;
    setBusy(true); setError(""); setMessage("");
    const controller = new AbortController();
    upload.current = controller;
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
        reader.readAsDataURL(file);
      });
      const response = await fetch(url, { method: "PUT", signal: controller.signal,
        headers: { Authorization: `Bearer ${getToken() ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: file.type, dataBase64 }) });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message ?? "Não foi possível salvar a capa.");
      }
      setSaved(file); setFile(null);
      if (input.current) input.current.value = "";
      setMessage("Capa salva. Ela será exibida no Aplicativo do Organizador.");
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível salvar a capa.");
    } finally {
      pending.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <form className={styles.form} onSubmit={save} aria-busy={busy}>
    <label className={styles.field}>
      Imagem de capa do evento
      <input ref={input} className={styles.input} type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png"
        disabled={busy || loading} onChange={(event) => {
          const next = event.target.files?.[0] ?? null;
          setError(""); setMessage(""); setFile(null);
          if (next && (!['image/jpeg', 'image/png'].includes(next.type) || next.size === 0 || next.size > 5 * 1024 * 1024)) {
            setError("Selecione uma imagem JPG ou PNG de até 5 MB.");
            event.target.value = "";
            return;
          }
          setFile(next);
        }} />
      <small>JPG ou PNG, até 5 MB e 16 megapixels. Capa exclusiva do evento, independente da planta.</small>
    </label>
    {preview ? <img src={preview} alt="Pré-visualização da capa do evento"
      style={{ width: "100%", maxWidth: 520, height: 180, objectFit: "contain", background: "#020617", borderRadius: 12 }} /> :
      <p style={{ color: "#94a3b8", margin: 0 }}>{loading ? "Carregando capa…" : "Este evento ainda não tem capa."}</p>}
    {error && <p role="alert" style={{ color: "#fca5a5", margin: 0 }}>{error}</p>}
    {message && <p role="status" style={{ color: "#a7f3d0", margin: 0 }}>{message}</p>}
    <button className={styles.primary} disabled={!file || busy || loading} type="submit">
      {busy ? "Salvando capa…" : "Salvar capa"}
    </button>
  </form>;
}
