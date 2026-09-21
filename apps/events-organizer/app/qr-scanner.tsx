"use client";

import { useEffect, useRef, useState } from "react";

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorConstructor = {
  new(options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

export default function QrScanner({ onRead, onClose }: {
  onRead: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState("Aguardando permissão da câmera…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const video = videoRef.current;
    const stop = () => {
      disposed = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
    const fail = (text: string) => {
      if (disposed) return;
      stop();
      setMessage(text);
      setFailed(true);
    };

    async function start() {
      const BarcodeDetector = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        fail("A câmera precisa de uma conexão HTTPS. Você pode digitar o código abaixo.");
        return;
      }
      if (!BarcodeDetector || !(await BarcodeDetector.getSupportedFormats()).includes("qr_code")) {
        fail("Este navegador não oferece leitura de QR. Digite o código da credencial abaixo.");
        return;
      }
      if (disposed) return;
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false, video: { facingMode: { ideal: "environment" } },
      });
      if (disposed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (!video) { stop(); return; }
      video.srcObject = stream;
      await video.play();
      if (disposed) return;
      setMessage("Enquadre o QR da credencial. Depois, confirme o check-in.");
      async function scan() {
        if (disposed || !video) return;
        try {
          if (video.readyState >= 2) {
            const codes = await detector.detect(video);
            if (disposed) return;
            const code = codes.find((item) => item.rawValue.trim())?.rawValue.trim();
            if (code) { stop(); onRead(code); return; }
          }
          if (!disposed) timer = setTimeout(scan, 200);
        } catch {
          fail("A leitura foi interrompida. Digite o código ou abra a câmera novamente.");
        }
      }
      void scan();
    }
    const onVisibility = () => { if (document.hidden) onClose(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", stop);
    void start().catch((error: unknown) => {
      fail(error instanceof DOMException && error.name === "NotAllowedError"
        ? "Permissão de câmera negada. Autorize no navegador ou digite o código abaixo."
        : "Não foi possível abrir a câmera. Confira se ela está disponível ou digite o código abaixo.");
    });
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", stop);
    };
  }, [onRead, onClose]);

  return <section className="camera" aria-label="Leitor de QR da credencial">
    {!failed && <video ref={videoRef} muted playsInline aria-label="Imagem da câmera" />}
    <p role="status">{message}</p>
    <button className="secondary" type="button" onClick={onClose}>Fechar câmera</button>
  </section>;
}
