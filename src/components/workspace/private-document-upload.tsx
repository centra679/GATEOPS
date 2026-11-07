"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Download, LoaderCircle, Upload } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Panel, type DataRow } from "@/components/workspace/data-display";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxBytes = 10 * 1024 * 1024;

export function PrivateDocumentUpload({ unitId, visits, onComplete }: { unitId: string; visits: DataRow[]; onComplete: (message: string) => void }) {
  const [supabase] = useState(createSupabaseBrowserClient);
  const [visitId, setVisitId] = useState("");
  const [documentType, setDocumentType] = useState("identity");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError("");
    if (selected && !allowedTypes.has(selected.type)) {
      setFile(null);
      event.target.value = "";
      setError("Gunakan JPG, PNG, WebP, atau PDF.");
      return;
    }
    if (selected && selected.size > maxBytes) {
      setFile(null);
      event.target.value = "";
      setError("Ukuran maksimum dokumen adalah 10 MB.");
      return;
    }
    setFile(selected);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!visitId || !file) {
      setError("Pilih kunjungan dan dokumen terlebih dahulu.");
      return;
    }
    setPending(true);
    setError("");
    const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100) || "document";
    const objectPath = `${unitId}/${visitId}/${crypto.randomUUID()}-${safeName}`;

    try {
      const { error: uploadError } = await supabase.storage.from("visitor-documents").upload(objectPath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { error: registerError } = await supabase.rpc("register_visitor_document", {
        p_visit_id: visitId,
        p_document_type: documentType,
        p_object_path: objectPath,
      });
      if (registerError) {
        await supabase.storage.from("visitor-documents").remove([objectPath]);
        throw registerError;
      }

      setFile(null);
      event.currentTarget.reset();
      onComplete("Dokumen tersimpan di bucket privat.");
    } catch (caught) {
      setError(caught && typeof caught === "object" && "message" in caught && typeof caught.message === "string"
        ? caught.message
        : "Dokumen tidak dapat diunggah.");
    } finally {
      setPending(false);
    }
  }

  async function download(path: string) {
    const { data, error: signedUrlError } = await supabase.storage.from("visitor-documents").createSignedUrl(path, 60);
    if (signedUrlError) {
      setError("Dokumen tidak dapat diakses oleh akun ini.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const documents: DataRow[] = visits.flatMap((visit) => Array.isArray(visit.documents)
    ? visit.documents.map((document) => ({ ...(document as DataRow), visitor_name: visit.visitor_name }))
    : []);

  return (
    <Panel title="Dokumentasi tamu" description="Berkas privat, maksimal 10 MB. Link akses ditandatangani berlaku 60 detik.">
      <form className="operation-form form-grid" onSubmit={submit}>
        <label className="form-field"><span>Kunjungan</span><select value={visitId} onChange={(event) => setVisitId(event.target.value)} required><option value="" disabled>Pilih kunjungan...</option>{visits.map((visit) => <option key={String(visit.id)} value={String(visit.id)}>{String(visit.visitor_name ?? visit.id)} · {new Date(String(visit.checked_in_at)).toLocaleString("id-ID")}</option>)}</select></label>
        <label className="form-field"><span>Jenis dokumen</span><select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="identity">Identitas</option><option value="vehicle">Kendaraan</option><option value="other">Lainnya</option></select></label>
        <label className="form-field form-field-wide"><span>File</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={chooseFile} required /><small>{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : "JPG, PNG, WebP, PDF"}</small></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button-primary form-submit" type="submit" disabled={pending || !visits.length}>{pending ? <><LoaderCircle className="spin" size={16} /> Mengunggah...</> : <><Upload size={16} /> Unggah dokumen</>}</button>
      </form>
      <div className="document-list">{documents.map((document) => <div className="document-row" key={String(document.id)}><span><strong>{String(document.visitor_name ?? "Tamu")}</strong><small>{String(document.document_type)} · {new Date(String(document.created_at)).toLocaleString("id-ID")}</small></span><button className="icon-button" onClick={() => void download(String(document.object_path))} title="Unduh dokumen" aria-label="Unduh dokumen"><Download size={16} /></button></div>)}</div>
    </Panel>
  );
}