"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { Camera, CameraOff, RefreshCw } from "lucide-react";

export function QrScanner({ onScan, disabled = false }: { onScan: (token: string) => void; disabled?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => controlsRef.current?.stop(), []);

  async function startCamera() {
    setError("");
    setActive(true);
    try {
      const reader = new BrowserQRCodeReader();
      const video = videoRef.current;
      if (!video) throw new Error("Kamera belum siap.");
      const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
        if (result) {
          controlsRef.current?.stop();
          setActive(false);
          onScan(result.getText());
        }
      });
      controlsRef.current = controls;
    } catch {
      setActive(false);
      setError("Kamera tidak dapat dibuka. Periksa izin kamera atau masukkan token QR secara manual.");
    }
  }

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setActive(false);
  }

  return (
    <div className="scanner-tool">
      <div className={`scanner-video-wrap${active ? " scanner-active" : ""}`}>
        <video ref={videoRef} className="scanner-video" muted playsInline />
        {!active && <div className="scanner-placeholder"><span><CameraOff size={23} /></span><p>Kamera belum aktif</p></div>}
        {active && <span className="scanner-frame" aria-hidden="true" />}
      </div>
      <div className="scanner-controls">
        {!active
          ? <button className="button-primary" onClick={startCamera} disabled={disabled}><Camera size={16} /> Buka kamera</button>
          : <button className="button-secondary" onClick={stopCamera}><CameraOff size={16} /> Tutup kamera</button>}
        <button className="icon-button scanner-retry" onClick={() => { stopCamera(); void startCamera(); }} disabled={disabled} title="Mulai ulang kamera" aria-label="Mulai ulang kamera"><RefreshCw size={16} /></button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}