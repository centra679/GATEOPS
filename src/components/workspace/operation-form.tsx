"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, Printer, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useWorkspaceContext } from "@/components/workspace/app-shell";
import { Panel, type DataRow } from "@/components/workspace/data-display";
import { QrScanner } from "@/components/workspace/qr-scanner";
import type { SectionKey } from "@/lib/gateops/navigation";
import type { EffectiveRole } from "@/lib/auth/roles";

type Choices = { personnel?: DataRow[]; families?: DataRow[]; posts?: DataRow[]; qr?: DataRow[]; accounts?: DataRow[]; assignments?: DataRow[]; visits?: DataRow[] };

type Props = {
  section: SectionKey;
  role: EffectiveRole;
  choices?: Choices;
  profileName?: string;
  inviteToken?: string;
  onComplete: (message: string) => void;
};

export function OperationForm({ section, role, choices = {}, profileName = "", inviteToken = "", onComplete }: Props) {
  const [supabase] = useState(createSupabaseBrowserClient);
  const { unitId, userId, unitName, activeAssignment, branding } = useWorkspaceContext();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [issuedQr, setIssuedQr] = useState<{ token: string; id: string; postName: string } | null>(null);
  const [issuedInvite, setIssuedInvite] = useState("");
  const [scanToken, setScanToken] = useState("");
  const [qrAction, setQrAction] = useState("create");
  const [qrPostId, setQrPostId] = useState("");
  const [editAccountId, setEditAccountId] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editNrp, setEditNrp] = useState("");
  const [editRank, setEditRank] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editRelatedPersonnelId, setEditRelatedPersonnelId] = useState("");
  const [brandingDraft, setBrandingDraft] = useState(() => ({
    name: branding.name || unitName,
    tagline: branding.tagline,
    copyright: branding.copyright,
    accentColor: branding.accentColor,
    whiteLabelEnabled: branding.whiteLabelEnabled,
    showGateopsBrand: branding.showGateopsBrand,
  }));

  function value(data: FormData, key: string) {
    return String(data.get(key) ?? "").trim();
  }

  function selectAccountForEdit(accountId: string) {
    setEditAccountId(accountId);
    const accounts = section === "personnel" ? choices.personnel : choices.families;
    const selected = accounts?.find((account) => String(account.id) === accountId);
    setEditDisplayName(String(selected?.display_name ?? ""));
    setEditNrp(String(selected?.nrp ?? ""));
    setEditRank(String(selected?.rank ?? ""));
    setEditPosition(String(selected?.position ?? ""));
    setEditRelatedPersonnelId(String(selected?.related_personnel_id ?? ""));
  }

  async function submitScan(token: string) {
    if (!token.trim()) {
      setError("Token QR wajib diisi.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const location = await readCurrentPosition();
      const { data, error: rpcError } = await supabase.rpc("process_qr_scan", {
        p_qr_token: token.trim(),
        p_request_id: crypto.randomUUID(),
        p_latitude: location?.latitude ?? null,
        p_longitude: location?.longitude ?? null,
        p_accuracy_meters: location?.accuracy ?? null,
        p_captured_at: location?.capturedAt ?? null,
      });
      if (rpcError) throw rpcError;
      const result = data as { event?: string } | null;
      setScanToken("");
      window.dispatchEvent(new Event("gateops:movement-updated"));
      onComplete(result?.event === "return" ? "Kepulangan tercatat. Sesi GPS telah diakhiri." : "Keluar tercatat. Sesi GPS telah dimulai.");
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setPending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    try {
      if (section === "plans") {
        const departure = value(form, "departure_at");
        const plannedReturn = value(form, "planned_return_at");
        if (!departure || !plannedReturn || new Date(plannedReturn) <= new Date(departure)) throw new Error("Waktu kembali harus setelah waktu keluar.");
        const { error: rpcError } = await supabase.rpc("create_movement_plan", {
          p_unit_id: unitId,
          p_departure_at: new Date(departure).toISOString(),
          p_planned_return_at: new Date(plannedReturn).toISOString(),
          p_destination: value(form, "destination"),
          p_purpose: value(form, "purpose"),
          p_notes: value(form, "notes") || null,
        });
        if (rpcError) throw rpcError;
        onComplete("Rencana izin tersimpan dan otomatis disetujui.");
      } else if (section === "scan") {
        setPending(false);
        await submitScan(value(form, "qr_token"));
        return;
      } else if (section === "profile") {
        const { error: updateError } = await supabase.from("profiles").update({ display_name: value(form, "display_name") }).eq("id", userId);
        if (updateError) throw updateError;
        onComplete("Profil berhasil diperbarui.");
      } else if (section === "personnel" || section === "family") {
        if (value(form, "action") === "update") {
          if (section === "personnel") {
            const { error: invokeError } = await supabase.functions.invoke("manage-personnel", {
              body: {
                userId: value(form, "account_user_id"),
                unitId,
                nrp: value(form, "nrp"),
                displayName: value(form, "display_name"),
                rank: value(form, "rank"),
                position: value(form, "position"),
                reason: value(form, "reason"),
              },
            });
            if (invokeError) throw invokeError;
            onComplete("Data personel dan identitas NRP berhasil diperbarui.");
          } else {
            const { error: rpcError } = await supabase.rpc("admin_update_family_account", {
              p_unit_id: unitId,
              p_family_user_id: value(form, "account_user_id"),
              p_display_name: value(form, "display_name"),
              p_related_personnel_id: value(form, "related_personnel_id"),
              p_reason: value(form, "reason"),
            });
            if (rpcError) throw rpcError;
            onComplete("Profil dan relasi akun keluarga berhasil diperbarui.");
          }
          return;
        }
        const body = {
          role: section === "personnel" ? "personnel" : "family",
          identifier: value(form, section === "personnel" ? "nrp" : "family_code"),
          pin: value(form, "pin"),
          displayName: value(form, "display_name"),
          unitId,
          relatedPersonnelNrp: section === "family" ? value(form, "related_personnel_nrp") : undefined,
          rank: section === "personnel" ? value(form, "rank") : undefined,
          position: section === "personnel" ? value(form, "position") : undefined,
          reason: value(form, "reason"),
        };
        const { error: invokeError } = await supabase.functions.invoke("provision-account", { body });
        if (invokeError) throw invokeError;
        formElement.reset();
        onComplete("Akun berhasil dibuat.");
      } else if (section === "accounts") {
        if (value(form, "access_type") === "membership") {
          const { error: rpcError } = await supabase.rpc("admin_set_unit_membership_status", {
            p_user_id: value(form, "user_id"),
            p_unit_id: unitId,
            p_status: value(form, "status"),
            p_reason: value(form, "reason"),
          });
          if (rpcError) throw rpcError;
          onComplete("Status keanggotaan satuan diperbarui.");
        } else {
          const { error: invokeError } = await supabase.functions.invoke("manage-account", {
            body: { userId: value(form, "user_id"), unitId, status: value(form, "status"), reason: value(form, "reason") },
          });
          if (invokeError) throw invokeError;
          onComplete("Status akun diperbarui dan sesi autentikasi disinkronkan.");
        }
      } else if (section === "reports") {
        const { error: rpcError } = await supabase.rpc("generate_guard_report", {
          p_assignment_id: value(form, "assignment_id"),
        });
        if (rpcError) throw rpcError;
        onComplete("Laporan tugas berhasil dibuat.");
      } else if (section === "units") {
        const { error: rpcError } = await supabase.rpc("admin_manage_unit", {
          p_unit_id: unitId, p_name: value(form, "name"), p_reason: value(form, "reason"),
        });
        if (rpcError) throw rpcError;
        onComplete("Nama satuan diperbarui.");
      } else if (section === "posts") {
        const action = value(form, "action") || "create";
        const { error: rpcError } = await supabase.rpc("admin_manage_post", {
          p_action: action,
          p_unit_id: unitId,
          p_post_id: value(form, "post_id") || null,
          p_name: value(form, "name") || null,
          p_description: value(form, "description") || null,
          p_latitude: value(form, "latitude") ? Number(value(form, "latitude")) : null,
          p_longitude: value(form, "longitude") ? Number(value(form, "longitude")) : null,
          p_radius_meters: value(form, "radius_meters") ? Number(value(form, "radius_meters")) : null,
          p_reason: value(form, "reason"),
        });
        if (rpcError) throw rpcError;
        onComplete(action === "create" ? "Pos berhasil dibuat." : "Data pos diperbarui.");
      } else if (section === "qr") {
        const action = value(form, "action") || "create";
        setIssuedQr(null);
        const { data, error: rpcError } = await supabase.rpc("admin_manage_qr", {
          p_action: action,
          p_post_id: value(form, "post_id"),
          p_qr_id: value(form, "qr_id") || null,
          p_reason: value(form, "reason"),
        });
        if (rpcError) throw rpcError;
        const result = data as { id?: string; token?: string } | null;
        if (action === "create") {
          if (!result?.token || !result.id) throw new Error("Token atau identitas QR tidak diterima dari server.");
          const selectedPost = choices.posts?.find((post) => String(post.id) === value(form, "post_id"));
          setIssuedQr({ token: result.token, id: result.id, postName: String(selectedPost?.name ?? "Pos") });
        }
        onComplete(action === "create" ? "QR dibuat. Token hanya tersedia pada sesi ini." : "Status QR diperbarui.");
      } else if (section === "guards") {
        const startsAt = value(form, "starts_at");
        const endsAt = value(form, "ends_at");
        if (new Date(endsAt) <= new Date(startsAt)) throw new Error("Waktu akhir harus setelah waktu mulai.");
        const { data, error: rpcError } = await supabase.rpc("admin_create_guard_invite", {
          p_personnel_user_id: value(form, "personnel_user_id"),
          p_post_id: value(form, "post_id"),
          p_starts_at: new Date(startsAt).toISOString(),
          p_ends_at: new Date(endsAt).toISOString(),
          p_note: value(form, "note") || null,
          p_reason: value(form, "reason"),
        });
        if (rpcError) throw rpcError;
        const result = data as { token?: string } | null;
        setIssuedInvite(result?.token ?? "");
        onComplete("Undangan tugas dibuat dan dikirimkan ke akun Personel.");
      } else if (section === "guard-invites") {
        const { error: rpcError } = await supabase.rpc("accept_guard_invite", { p_token: value(form, "token") });
        if (rpcError) throw rpcError;
        onComplete("Undangan diterima. Hak tugas aktif sesuai jadwal.");
      } else if (section === "visitors") {
        if (role !== "temporary_guard") throw new Error("Pencatatan kunjungan memerlukan assignment jaga aktif.");
        const vehicleType = value(form, "vehicle_type");
        const vehicle = vehicleType ? {
          vehicle_type: vehicleType,
          make_model: value(form, "make_model") || null,
          color: value(form, "color") || null,
          plate_number: value(form, "plate_number") || null,
        } : null;
        const { error: rpcError } = await supabase.rpc("create_visitor_visit", {
          p_unit_id: unitId,
          p_post_id: value(form, "post_id") || activeAssignment?.post_id,
          p_full_name: value(form, "full_name"),
          p_identity_type: value(form, "identity_type"),
          p_identity_number: value(form, "identity_number"),
          p_purpose: value(form, "purpose"),
          p_host_name: value(form, "host_name") || null,
          p_phone: value(form, "phone") || null,
          p_vehicle: vehicle,
        });
        if (rpcError) throw rpcError;
        formElement.reset();
        onComplete("Kunjungan tamu tercatat.");
      } else if (section === "settings") {
        const reason = value(form, "reason");
        const genericKey = value(form, "setting_key");
        const brandSaveList: Array<{ key: string; value: unknown }> = [];
        const brandName = value(form, "brand_name");
        const brandTagline = value(form, "brand_tagline");
        const brandCopyright = value(form, "brand_copyright");
        const brandColor = value(form, "brand_color");
        const whiteLabelValue = value(form, "brand_white_label");
        const showGateopsValue = value(form, "brand_show_gateops");

        if (brandName) brandSaveList.push({ key: "unit.brand.name", value: brandName });
        if (brandTagline) brandSaveList.push({ key: "unit.brand.tagline", value: brandTagline });
        if (brandCopyright) brandSaveList.push({ key: "unit.brand.copyright", value: brandCopyright });
        if (brandColor) brandSaveList.push({ key: "unit.brand.accent_color", value: brandColor });
        if (whiteLabelValue) brandSaveList.push({ key: "unit.brand.white_label_enabled", value: whiteLabelValue === "true" });
        if (showGateopsValue) brandSaveList.push({ key: "unit.brand.show_gateops_brand", value: showGateopsValue === "true" });

        if (!genericKey && brandSaveList.length === 0) throw new Error("Pilih minimal salah satu pengaturan branding atau masukkan kunci pengaturan khusus.");

        if (genericKey) {
          const genericRaw = value(form, "setting_value");
          if (!genericRaw) throw new Error("Nilai JSON umum tidak boleh kosong.");
          let parsedGenericValue: unknown;
          try { parsedGenericValue = JSON.parse(genericRaw); } catch { throw new Error("Nilai JSON umum harus valid."); }
          brandSaveList.push({ key: genericKey, value: parsedGenericValue });
        }

        for (const item of brandSaveList) {
          const { error: rpcError } = await supabase.rpc("admin_manage_setting", {
            p_unit_id: unitId,
            p_setting_key: item.key,
            p_setting_value: item.value,
            p_reason: reason,
          });
          if (rpcError) throw rpcError;
        }
        window.dispatchEvent(new Event("gateops:branding-updated"));
        onComplete("Pengaturan satuan diperbarui.");
      }
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setPending(false);
    }
  }

  if (section === "scan") return (
    <Panel title="Scan QR pos" description="Scan pertama mencatat keluar, scan berikutnya mencatat kepulangan.">
      <form className="operation-form" onSubmit={handleSubmit}>
        <QrScanner disabled={pending} onScan={(token) => { setScanToken(token); void submitScan(token); }} />
        <div className="form-divider"><span>ATAU MASUKKAN TOKEN</span></div>
        <Field label="Token QR" name="qr_token" value={scanToken} onChange={setScanToken} placeholder="Token dari QR Code pos" required />
        {error && <p className="form-error" role="alert">{error}</p>}
        <SubmitButton pending={pending} label="Proses scan" />
      </form>
    </Panel>
  );

  if (section === "plans") return <Panel title="Buat rencana izin" description="Rencana otomatis disetujui setelah validasi sistem."><form className="operation-form form-grid" onSubmit={handleSubmit}>
    <Field label="Waktu keluar" name="departure_at" type="datetime-local" required />
    <Field label="Perkiraan kembali" name="planned_return_at" type="datetime-local" required />
    <Field label="Tujuan" name="destination" placeholder="Kota atau lokasi tujuan" maxLength={240} required />
    <Field label="Keperluan" name="purpose" placeholder="Keperluan perjalanan" maxLength={500} required />
    <TextArea label="Keterangan tambahan" name="notes" maxLength={2000} />
    <FormFeedback error={error} />
    <SubmitButton pending={pending} label="Ajukan rencana" />
  </form></Panel>;

  if (section === "profile") return <Panel title="Informasi profil" description="Perubahan nama dicatat pada audit log."><form className="operation-form" onSubmit={handleSubmit}>
    <Field label="Nama" name="display_name" defaultValue={profileName} maxLength={160} required />
    <FormFeedback error={error} />
    <SubmitButton pending={pending} label="Simpan profil" />
  </form></Panel>;

  if (section === "personnel" || section === "family") return <>
    <Panel title={section === "personnel" ? "Tambah personel" : "Tambah akun keluarga"} description="Akun dibuat oleh Supabase Auth. PIN tidak disimpan sebagai teks biasa."><form className="operation-form form-grid" onSubmit={handleSubmit}>
      <input type="hidden" name="action" value="create" />
      {section === "personnel" ? <>
        <Field label="NRP" name="nrp" inputMode="numeric" pattern="[0-9]{1,20}" maxLength={20} required />
        <Field label="Pangkat" name="rank" maxLength={80} />
        <Field label="Jabatan" name="position" maxLength={120} />
      </> : <>
        <Field label="Kode akun keluarga" name="family_code" pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,63}" maxLength={64} required />
        <SelectField label="NRP personel penghubung" name="related_personnel_nrp" options={choices.personnel ?? []} optionValue="nrp" optionLabel={(row) => `${String(row.nrp ?? "")} · ${String(row.display_name ?? "Personel")}`} required />
      </>}
      <Field label="Nama lengkap" name="display_name" maxLength={160} required />
      <Field label="PIN (6-72 digit)" name="pin" type="password" inputMode="numeric" pattern="[0-9]{6,72}" minLength={6} maxLength={72} required />
      <TextArea label="Alasan administrasi" name="reason" maxLength={1000} required />
      <FormFeedback error={error} />
      <SubmitButton pending={pending} label="Buat akun" />
    </form></Panel>
    <Panel title={section === "personnel" ? "Ubah data personel" : "Ubah akun keluarga"} description={section === "personnel" ? "Perubahan NRP disinkronkan dengan identitas login dan dicatat pada audit log." : "Nama dan personel penghubung dapat diubah; kode login keluarga tetap."}>
      <form className="operation-form form-grid" onSubmit={handleSubmit}>
        <input type="hidden" name="action" value="update" />
        <SelectField label={section === "personnel" ? "Personel" : "Akun keluarga"} name="account_user_id" value={editAccountId} onChange={selectAccountForEdit} options={section === "personnel" ? choices.personnel ?? [] : choices.families ?? []} optionValue="id" optionLabel={(row) => section === "personnel" ? `${String(row.nrp ?? "")} · ${String(row.display_name ?? "Personel")}` : `${String(row.family_code ?? "")} · ${String(row.display_name ?? "Keluarga")}`} required />
        <Field label="Nama lengkap" name="display_name" value={editDisplayName} onChange={setEditDisplayName} maxLength={160} required />
        {section === "personnel" ? <>
          <Field label="NRP" name="nrp" value={editNrp} onChange={setEditNrp} inputMode="numeric" pattern="[0-9]{1,20}" maxLength={20} required />
          <Field label="Pangkat" name="rank" value={editRank} onChange={setEditRank} maxLength={80} />
          <Field label="Jabatan" name="position" value={editPosition} onChange={setEditPosition} maxLength={120} />
        </> : <SelectField label="Personel penghubung" name="related_personnel_id" value={editRelatedPersonnelId} onChange={setEditRelatedPersonnelId} options={choices.personnel ?? []} optionValue="id" optionLabel={(row) => `${String(row.nrp ?? "")} · ${String(row.display_name ?? "Personel")}`} required />}
        <TextArea label="Alasan perubahan" name="reason" maxLength={1000} required />
        <FormFeedback error={error} />
        <SubmitButton pending={pending} label="Simpan perubahan" />
      </form>
    </Panel>
  </>;

  if (section === "accounts") return <Panel title="Ubah status akun atau akses satuan" description="Status akun mencabut sesi Auth; status membership membatasi satuan ini."><form className="operation-form" onSubmit={handleSubmit}>
    <SelectField label="Akun" name="user_id" options={choices.accounts ?? []} optionValue="id" optionLabel={(row) => `${String(row.display_name ?? row.id)} · ${String(row.account_role ?? "")}`} required />
    <SelectField label="Cakupan perubahan" name="access_type" options={[{ id: "profile", label: "Akun dan sesi autentikasi" }, { id: "membership", label: "Akses ke satuan ini" }]} optionValue="id" optionLabel={(row) => String(row.label)} required />
    <SelectField label="Status" name="status" options={[{ id: "disabled", label: "Nonaktifkan" }, { id: "active", label: "Aktifkan kembali" }]} optionValue="id" optionLabel={(row) => String(row.label)} required />
    <TextArea label="Alasan tindakan" name="reason" maxLength={1000} required />
    <FormFeedback error={error} />
    <SubmitButton pending={pending} label="Simpan status" />
  </form></Panel>;

  if (section === "units") return <Panel title="Ubah nama satuan" description="Perubahan dibatasi pada satuan yang menjadi kewenangan akun ini."><form className="operation-form" onSubmit={handleSubmit}>
    <Field label="Nama satuan" name="name" defaultValue={unitName} maxLength={160} required />
    <TextArea label="Alasan perubahan" name="reason" maxLength={1000} required />
    <FormFeedback error={error} />
    <SubmitButton pending={pending} label="Perbarui satuan" />
  </form></Panel>;

  if (section === "posts") return <Panel title="Tambah pos" description="Koordinat dan radius digunakan sebagai referensi lokasi pos."><form className="operation-form form-grid" onSubmit={handleSubmit}>
    <input type="hidden" name="action" value="create" />
    <Field label="Nama pos" name="name" maxLength={120} required />
    <Field label="Radius (meter)" name="radius_meters" type="number" min="1" />
    <Field label="Latitude" name="latitude" type="number" min="-90" max="90" step="any" />
    <Field label="Longitude" name="longitude" type="number" min="-180" max="180" step="any" />
    <TextArea label="Keterangan" name="description" maxLength={1000} />
    <TextArea label="Alasan administrasi" name="reason" maxLength={1000} required />
    <FormFeedback error={error} />
    <SubmitButton pending={pending} label="Tambah pos" />
  </form></Panel>;

  if (section === "qr") return <Panel title="Kelola QR Code" description="Token QR ditampilkan sekali saat dibuat. Cetak QR dan pasang di pos yang sesuai."><form className="operation-form" onSubmit={handleSubmit}>
    <SelectField label="Aksi" name="action" defaultValue="create" onChange={(action) => { setQrAction(action); setIssuedQr(null); }} options={[{ id: "create", label: "Buat QR baru" }, { id: "enable", label: "Aktifkan QR" }, { id: "disable", label: "Nonaktifkan QR" }, { id: "revoke", label: "Cabut QR" }]} optionValue="id" optionLabel={(row) => String(row.label)} required />
    <SelectField label="Pos" name="post_id" onChange={setQrPostId} options={choices.posts ?? []} optionValue="id" optionLabel={(row) => String(row.name ?? row.id)} required />
    {qrAction !== "create" && <SelectField label="QR Code" name="qr_id" options={(choices.qr ?? []).filter((qr) => String(qr.post_id) === qrPostId)} optionValue="id" optionLabel={(qr) => `${String(qr.status ?? "")} · ${String(qr.id)}`} required />}
    <TextArea label="Alasan tindakan" name="reason" maxLength={1000} required />
    <FormFeedback error={error} />
    <SubmitButton pending={pending} label="Jalankan aksi QR" />
  </form>
    {issuedQr && <div className="issued-secret qr-issued">
      <div className="qr-print-sheet">
        <p>{branding.name || unitName}</p>
        <h2>{issuedQr.postName}</h2>
        <QRCodeSVG value={issuedQr.token} size={280} level="Q" includeMargin />
        <span>ID QR · {issuedQr.id}</span>
        <small>QR statis pos penjagaan</small>
      </div>
      <div className="qr-print-actions">
        <strong>QR baru · token hanya tersedia pada sesi ini</strong>
        <code>{issuedQr.token}</code>
        <button className="button-secondary button-compact" type="button" onClick={() => window.print()}><Printer size={15} /> Cetak QR pos</button>
      </div>
    </div>}
  </Panel>;

  if (section === "guards") return <Panel title="Undang petugas jaga" description="Undangan hanya dapat diterima akun Personel yang dituju."><form className="operation-form" onSubmit={handleSubmit}>
    <SelectField label="Personel" name="personnel_user_id" options={choices.personnel ?? []} optionValue="id" optionLabel={(row) => `${String(row.display_name ?? "Personel")} · ${String(row.nrp ?? "")}`} required />
    <SelectField label="Pos" name="post_id" options={choices.posts ?? []} optionValue="id" optionLabel={(row) => String(row.name ?? row.id)} required />
    <Field label="Mulai tugas" name="starts_at" type="datetime-local" required />
    <Field label="Akhir tugas" name="ends_at" type="datetime-local" required />
    <TextArea label="Keterangan" name="note" maxLength={1000} />
    <TextArea label="Alasan penugasan" name="reason" maxLength={1000} required />
    <FormFeedback error={error} />
    <SubmitButton pending={pending} label="Buat undangan" />
  </form>
    {issuedInvite && <div className="issued-secret"><strong>Tautan undangan · token hanya ditampilkan sekali</strong><code>{typeof window === "undefined" ? issuedInvite : `${window.location.origin}/app/guard-invites?token=${encodeURIComponent(issuedInvite)}`}</code><QRCodeSVG value={issuedInvite} size={160} level="Q" includeMargin /></div>}
  </Panel>;

  if (section === "guard-invites") return <Panel title="Terima undangan tugas" description="Gunakan token pribadi yang diberikan admin satuan."><form className="operation-form" onSubmit={handleSubmit}>
    <Field label="Token undangan" name="token" defaultValue={inviteToken} minLength={32} maxLength={128} required />
    <FormFeedback error={error} />
    <SubmitButton pending={pending} label="Terima tugas" />
  </form></Panel>;

  if (section === "visitors") return <Panel title="Catat kunjungan tamu" description="Identitas dicatat sebelum tamu memasuki satuan."><form className="operation-form form-grid" onSubmit={handleSubmit}>
    {role === "admin" && <SelectField label="Pos" name="post_id" options={choices.posts ?? []} optionValue="id" optionLabel={(row) => String(row.name ?? row.id)} required />}
    <Field label="Nama lengkap" name="full_name" maxLength={160} required />
    <SelectField label="Jenis identitas" name="identity_type" options={[{ id: "ktp", label: "KTP" }, { id: "passport", label: "Paspor" }, { id: "other", label: "Lainnya" }]} optionValue="id" optionLabel={(row) => String(row.label)} required />
    <Field label="Nomor identitas" name="identity_number" maxLength={80} required />
    <Field label="Nomor telepon" name="phone" type="tel" maxLength={40} />
    <Field label="Pihak yang dikunjungi" name="host_name" maxLength={160} />
    <Field label="Keperluan" name="purpose" maxLength={500} required />
    <div className="vehicle-fields"><p className="form-subheading">Kendaraan (opsional)</p>
      <Field label="Jenis kendaraan" name="vehicle_type" maxLength={80} />
      <Field label="Merek / tipe" name="make_model" maxLength={120} />
      <Field label="Warna" name="color" maxLength={60} />
      <Field label="Nomor polisi" name="plate_number" maxLength={24} />
    </div>
    <FormFeedback error={error} />
    <SubmitButton pending={pending} label="Catat tamu masuk" />
  </form></Panel>;

  if (section === "settings") return role === "admin"
    ? <Panel title="Branding & White Label" description="Pengaturan berlaku untuk satuan aktif dan digunakan di seluruh workspace."><form className="operation-form form-grid" onSubmit={handleSubmit}>
      <Field label="Nama satuan tampilan" name="brand_name" value={brandingDraft.name} onChange={(name) => setBrandingDraft((current) => ({ ...current, name }))} maxLength={120} />
      <Field label="Tagline satuan" name="brand_tagline" value={brandingDraft.tagline} onChange={(tagline) => setBrandingDraft((current) => ({ ...current, tagline }))} maxLength={120} />
      <Field label="Hak cipta" name="brand_copyright" value={brandingDraft.copyright} onChange={(copyright) => setBrandingDraft((current) => ({ ...current, copyright }))} maxLength={160} />
      <Field label="Warna aksen" name="brand_color" type="color" value={brandingDraft.accentColor} onChange={(accentColor) => setBrandingDraft((current) => ({ ...current, accentColor }))} />
      <SelectField label="Mode white label" name="brand_white_label" defaultValue={String(brandingDraft.whiteLabelEnabled)} options={[{ id: "true", label: "Aktif (branding satuan diutamakan)" }, { id: "false", label: "Nonaktif (GateOps diutamakan)" }]} optionValue="id" optionLabel={(row) => String(row.label)} onChange={(value) => setBrandingDraft((current) => ({ ...current, whiteLabelEnabled: value === "true" }))} />
      <SelectField label="Tampilkan brand GateOps" name="brand_show_gateops" defaultValue={String(brandingDraft.showGateopsBrand)} options={[{ id: "true", label: "Ya, tampilkan identitas GateOps" }, { id: "false", label: "Sembunyikan brand GateOps" }]} optionValue="id" optionLabel={(row) => String(row.label)} onChange={(value) => setBrandingDraft((current) => ({ ...current, showGateopsBrand: value === "true" }))} />
      <div className="branding-preview" style={{ borderColor: brandingDraft.accentColor }}>
        <div className="branding-preview-mark" style={{ backgroundColor: brandingDraft.accentColor }}><ShieldCheck size={18} /></div>
        <div className="branding-preview-copy"><strong>{brandingDraft.whiteLabelEnabled ? brandingDraft.name || unitName : "GateOps"}</strong><span>{brandingDraft.tagline}</span><small>{brandingDraft.copyright}</small></div>
        {brandingDraft.showGateopsBrand && <span className="brand-badge">GateOps</span>}
      </div>
      <Field label="Kunci pengaturan khusus" name="setting_key" placeholder="Contoh: unit.brand.name" maxLength={81} />
      <TextArea label="Nilai JSON umum" name="setting_value" placeholder="Isi jika menyimpan kunci khusus" maxLength={16000} />
      <TextArea label="Alasan perubahan" name="reason" maxLength={1000} required />
      <FormFeedback error={error} />
      <SubmitButton pending={pending} label="Simpan branding" />
    </form></Panel>
    : <Panel title="Pengaturan akun"><p className="quiet-copy">Pengaturan akun yang dapat diubah saat ini terbatas pada nama profil. PIN dapat diganti melalui kebijakan autentikasi yang dikelola administrator.</p></Panel>;

  if (section === "reports") return <Panel title="Buat laporan tugas jaga" description="Laporan berisi kunjungan dan kendaraan yang ditangani pada penugasan."><form className="operation-form" onSubmit={handleSubmit}>
    <SelectField label="Penugasan" name="assignment_id" options={choices.assignments ?? []} optionValue="id" optionLabel={(row) => `${String(row.post_name ?? row.post_id ?? "Pos")} · ${String(row.display_name ?? row.personnel_user_id ?? "Personel")}`} required />
    <FormFeedback error={error} />
    <SubmitButton pending={pending} label="Buat / segarkan laporan" />
  </form></Panel>;

  if (section === "guard-report") return <Panel title="Laporan tugas saya" description="Laporan dibuat otomatis setelah masa tugas berakhir."><p className="quiet-copy">Laporan tugas tersedia setelah penugasan selesai dan pemeliharaan terjadwal dijalankan.</p></Panel>;

  if (section === "notifications") return <Panel title="Notifikasi" description="Pembaruan aktivitas akun dan satuan."><p className="quiet-copy">Notifikasi dibaca dari pusat data GateOps.</p></Panel>;

  return null;
}

function Field({ label, name, type = "text", placeholder, required = false, defaultValue, value, onChange, ...attributes }: {
  label: string; name: string; type?: string; placeholder?: string; required?: boolean; defaultValue?: string; value?: string; onChange?: (value: string) => void;
  inputMode?: "text" | "numeric" | "tel" | "decimal" | "email" | "search" | "url";
  pattern?: string; minLength?: number; maxLength?: number; min?: string | number; max?: string | number; step?: string | number;
}) {
  return <label className="form-field"><span>{label}{required && <i> *</i>}</span><input name={name} type={type} placeholder={placeholder} required={required} defaultValue={defaultValue} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} {...attributes} /></label>;
}

function TextArea({ label, name, required = false, defaultValue, maxLength, placeholder }: { label: string; name: string; required?: boolean; defaultValue?: string; maxLength?: number; placeholder?: string }) {
  return <label className="form-field form-field-wide"><span>{label}{required && <i> *</i>}</span><textarea name={name} required={required} defaultValue={defaultValue} maxLength={maxLength} placeholder={placeholder} rows={3} /></label>;
}

function SelectField({ label, name, options, optionValue, optionLabel, required = false, defaultValue, value, onChange }: { label: string; name: string; options: DataRow[]; optionValue: string; optionLabel: (row: DataRow) => string; required?: boolean; defaultValue?: string; value?: string; onChange?: (value: string) => void }) {
  return <label className="form-field"><span>{label}{required && <i> *</i>}</span><select name={name} required={required} defaultValue={value === undefined ? defaultValue ?? "" : undefined} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined}><option value="" disabled>Pilih...</option>{options.map((option) => <option key={String(option[optionValue])} value={String(option[optionValue])}>{optionLabel(option)}</option>)}</select></label>;
}

function SubmitButton({ label, pending }: { label: string; pending: boolean }) {
  return <button className="button-primary form-submit" type="submit" disabled={pending}>{pending ? <><LoaderCircle className="spin" size={16} /> Memproses...</> : <>{label}<ArrowRight size={16} /></>}</button>;
}

function FormFeedback({ error }: { error: string }) {
  return error ? <p className="form-error" role="alert">{error}</p> : null;
}

function friendlyError(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    if (code === "42501") return "Akses tidak diizinkan untuk akun atau satuan ini.";
    if (code === "23505") return "Data ini sudah tercatat atau bertentangan dengan aktivitas aktif.";
    if (code === "22023") return "Data tidak valid atau status transaksi sudah berubah.";
    if (code === "PGRST116") return "Data tidak ditemukan atau tidak berada dalam cakupan akun.";
  }
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Permintaan gagal. Periksa data dan coba lagi.";
}

async function readCurrentPosition(): Promise<{ latitude: number; longitude: number; accuracy: number; capturedAt: string } | null> {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => navigator.geolocation.getCurrentPosition(
    (position) => resolve({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      capturedAt: new Date(position.timestamp).toISOString(),
    }),
    () => resolve(null),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
  ));
}
