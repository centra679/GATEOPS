"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RefreshCw, Search, MapPin, ArrowUpRight, FileSpreadsheet, FileText, Fingerprint, QrCode, History, ShieldCheck } from "lucide-react";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import { OperationForm } from "@/components/workspace/operation-form";
import { PrivateDocumentUpload } from "@/components/workspace/private-document-upload";
import { DataTable, EmptyState, ErrorState, LoadingState, MetricGrid, Panel, SectionHeading, StatusTag, Toast, type DataColumn, type DataRow } from "@/components/workspace/data-display";
import { useWorkspaceContext, type BrandingConfig } from "@/components/workspace/app-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { roleLabels, type AccountRole, type EffectiveRole } from "@/lib/auth/roles";
import { getNavigation, getSectionLabel, type SectionKey } from "@/lib/gateops/navigation";

const LiveLocationMap = dynamic(
  () => import("@/components/workspace/live-location-map").then((module) => module.LiveLocationMap),
  { ssr: false, loading: () => <div className="map-loading"><span className="loading-mark" />Memuat peta...</div> },
);
const LocationHistoryMap = dynamic(
  () => import("@/components/workspace/live-location-map").then((module) => module.LocationHistoryMap),
  { ssr: false, loading: () => <div className="map-loading"><span className="loading-mark" />Memuat jejak GPS...</div> },
);

type SectionState = {
  rows: DataRow[];
  summary: DataRow | null;
  choices: { personnel: DataRow[]; families: DataRow[]; posts: DataRow[]; qr: DataRow[]; accounts: DataRow[]; assignments: DataRow[]; visits: DataRow[] };
};

const emptyState: SectionState = { rows: [], summary: null, choices: { personnel: [], families: [], posts: [], qr: [], accounts: [], assignments: [], visits: [] } };

const personalSections = new Set<SectionKey>(["profile", "plans", "scan", "journey", "history", "guard-invites", "notifications", "settings"]);
const dateFilterFields: Partial<Record<SectionKey, string>> = {
  reports: "generated_at",
  "guard-report": "generated_at",
  history: "started_at",
  movements: "started_at",
  visitors: "checked_in_at",
  "active-visits": "checked_in_at",
  "visit-history": "checked_in_at",
  vehicles: "created_at",
};
type TableFilter = { key: string; label: string; kind: "text" | "select" };
const tableFilters: Partial<Record<SectionKey, TableFilter[]>> = {
  reports: [{ key: "display_name", label: "Petugas", kind: "text" }, { key: "nrp", label: "NRP", kind: "text" }, { key: "post_name", label: "Pos", kind: "select" }],
  "guard-report": [{ key: "display_name", label: "Petugas", kind: "text" }, { key: "nrp", label: "NRP", kind: "text" }, { key: "post_name", label: "Pos", kind: "select" }],
  movements: [
    { key: "display_name", label: "Nama", kind: "text" }, { key: "nrp", label: "NRP", kind: "text" },
    { key: "family_code", label: "Kode keluarga", kind: "text" }, { key: "account_role", label: "Jenis pengguna", kind: "select" },
    { key: "post_name", label: "Pos", kind: "select" }, { key: "status", label: "Status perjalanan", kind: "select" },
  ],
  history: [{ key: "destination", label: "Tujuan", kind: "text" }, { key: "status", label: "Status perjalanan", kind: "select" }],
  visitors: [{ key: "visitor_name", label: "Nama tamu", kind: "text" }, { key: "post_name", label: "Pos", kind: "select" }, { key: "status", label: "Status tamu", kind: "select" }],
  "active-visits": [{ key: "visitor_name", label: "Nama tamu", kind: "text" }, { key: "post_name", label: "Pos", kind: "select" }],
  "visit-history": [{ key: "visitor_name", label: "Nama tamu", kind: "text" }, { key: "post_name", label: "Pos", kind: "select" }, { key: "status", label: "Status tamu", kind: "select" }],
  vehicles: [{ key: "visitor_name", label: "Nama tamu", kind: "text" }, { key: "vehicle_type", label: "Jenis kendaraan", kind: "select" }],
};

const columnsBySection: Partial<Record<SectionKey, DataColumn[]>> = {
  personnel: [
    { key: "nrp", label: "NRP" }, { key: "display_name", label: "Nama" }, { key: "rank", label: "Pangkat" },
    { key: "position", label: "Jabatan" }, { key: "status", label: "Akun" }, { key: "membership_status", label: "Akses satuan" },
  ],
  family: [
    { key: "family_code", label: "Kode akun" }, { key: "display_name", label: "Nama" },
    { key: "related_nrp", label: "NRP personel" }, { key: "status", label: "Akun" }, { key: "membership_status", label: "Akses satuan" },
  ],
  accounts: [
    { key: "display_name", label: "Nama" }, { key: "account_role", label: "Jenis akun" },
    { key: "unit_name", label: "Satuan" }, { key: "status", label: "Status" }, { key: "created_at", label: "Dibuat" },
  ],
  units: [{ key: "name", label: "Nama satuan" }, { key: "created_at", label: "Dibuat" }],
  posts: [
    { key: "name", label: "Pos" }, { key: "description", label: "Keterangan" },
    { key: "latitude", label: "Latitude" }, { key: "longitude", label: "Longitude" }, { key: "status", label: "Status" },
  ],
  qr: [
    { key: "post_name", label: "Pos" }, { key: "status", label: "Status" }, { key: "created_at", label: "Dibuat" },
    { key: "disabled_at", label: "Dinonaktifkan" }, { key: "revoked_at", label: "Dicabut" },
  ],
  plans: [
    { key: "departure_at", label: "Rencana keluar" }, { key: "planned_return_at", label: "Perkiraan kembali" },
    { key: "destination", label: "Tujuan" }, { key: "purpose", label: "Keperluan" }, { key: "status", label: "Status" },
  ],
  history: [
    { key: "started_at", label: "Waktu keluar" }, { key: "ended_at", label: "Waktu kembali" },
    { key: "destination", label: "Tujuan" }, { key: "purpose", label: "Keperluan" },
    { key: "duration_minutes", label: "Durasi", format: (_value, row) => formatDuration(row.started_at, row.ended_at) },
    { key: "status", label: "Status perjalanan" },
  ],
  movements: [
    { key: "display_name", label: "Pengguna" }, { key: "account_role", label: "Jenis" }, { key: "status", label: "Status" },
    { key: "started_at", label: "Keluar" }, { key: "ended_at", label: "Kembali" }, { key: "movement_session_id", label: "Sesi" },
  ],
  visitors: [
    { key: "visitor_name", label: "Nama tamu" }, { key: "identity_type", label: "Jenis identitas" },
    { key: "identity_number", label: "Nomor identitas" }, { key: "purpose", label: "Keperluan" },
    { key: "post_name", label: "Pos" }, { key: "checked_in_at", label: "Masuk" }, { key: "checked_out_at", label: "Keluar" }, { key: "status", label: "Status" },
  ],
  "active-visits": [
    { key: "visitor_name", label: "Nama tamu" }, { key: "identity_number", label: "Nomor identitas" },
    { key: "purpose", label: "Keperluan" }, { key: "post_name", label: "Pos" }, { key: "checked_in_at", label: "Masuk" },
  ],
  "visit-history": [
    { key: "visitor_name", label: "Nama tamu" }, { key: "identity_number", label: "Nomor identitas" },
    { key: "purpose", label: "Keperluan" }, { key: "checked_in_at", label: "Masuk" }, { key: "checked_out_at", label: "Keluar" }, { key: "status", label: "Status" },
  ],
  vehicles: [
    { key: "visitor_name", label: "Nama tamu" }, { key: "vehicle_type", label: "Jenis" },
    { key: "make_model", label: "Merek / tipe" }, { key: "color", label: "Warna" }, { key: "plate_number", label: "Nomor polisi" },
  ],
  guards: [
    { key: "record_type", label: "Jenis catatan" }, { key: "display_name", label: "Personel" }, { key: "post_name", label: "Pos" },
    { key: "starts_at", label: "Mulai" }, { key: "ends_at", label: "Selesai" }, { key: "status", label: "Status" }, { key: "revoked_at", label: "Dicabut" },
  ],
  "guard-invites": [
    { key: "post_name", label: "Pos" }, { key: "starts_at", label: "Mulai" }, { key: "ends_at", label: "Selesai" },
    { key: "status", label: "Status" }, { key: "created_at", label: "Dibuat" },
  ],
  reports: [
    { key: "post_name", label: "Pos" }, { key: "display_name", label: "Petugas" },
    { key: "generated_at", label: "Dibuat" }, { key: "visitor_entries", label: "Tamu masuk" },
    { key: "visitor_exits", label: "Tamu keluar" }, { key: "visitors_not_checked_out", label: "Belum keluar" },
  ],
  "guard-report": [
    { key: "post_name", label: "Pos" }, { key: "generated_at", label: "Dibuat" },
    { key: "visitor_entries", label: "Tamu masuk" }, { key: "visitor_exits", label: "Tamu keluar" },
    { key: "visitors_not_checked_out", label: "Belum keluar" },
  ],
  audit: [
    { key: "created_at", label: "Waktu" }, { key: "action", label: "Tindakan" },
    { key: "entity_type", label: "Objek" }, { key: "entity_id", label: "ID objek" }, { key: "reason", label: "Alasan" },
  ],
  notifications: [
    { key: "created_at", label: "Waktu" }, { key: "notification_type", label: "Notifikasi" },
    { key: "payload_summary", label: "Detail" }, { key: "read_at", label: "Dibaca" },
  ],
  settings: [
    { key: "setting_key", label: "Kunci" }, { key: "setting_value_text", label: "Nilai" }, { key: "updated_at", label: "Diperbarui" },
  ],
};

export function WorkspaceSection({ section, inviteToken = "" }: { section: SectionKey; inviteToken?: string }) {
  const { unitId, unitName, userId, accountRole, effectiveRole, displayName, branding } = useWorkspaceContext();
  const [supabase] = useState(createSupabaseBrowserClient);
  const [state, setState] = useState<SectionState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [criteriaFilters, setCriteriaFilters] = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [toast, setToast] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await loadSectionData(supabase, section, unitId, userId, effectiveRole, accountRole, unitName);
        if (active) setState(result);
      } catch (caught) {
        if (active) setError(readError(caught));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const shouldPoll = section === "live-locations" || (section === "dashboard" && effectiveRole === "admin");
    const interval = shouldPoll ? window.setInterval(() => { void load(); }, 30_000) : undefined;
    return () => { active = false; if (interval) window.clearInterval(interval); };
  }, [supabase, section, unitId, userId, effectiveRole, accountRole, unitName, revision]);

  useEffect(() => {
    if (section !== "notifications") return;
    const channel = supabase.channel(`notifications:${userId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      }, () => setRevision((value) => value + 1))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [section, supabase, userId]);

  const label = getSectionLabel(effectiveRole, section);
  const allowed = getNavigation(effectiveRole).some((item) => item.key === section)
    || (accountRole === "personnel" && personalSections.has(section));
  if (!allowed) return <><SectionHeading eyebrow={roleLabels[effectiveRole].toUpperCase()} title={label} /><Panel><EmptyState title="Menu tidak tersedia" description="Akses menu ini tidak diberikan untuk role aktif." /></Panel></>;

  const dateField = dateFilterFields[section];
  const activeFilters = (tableFilters[section] ?? []).filter((criterion) => state.rows.some((row) => row[criterion.key] !== null && row[criterion.key] !== undefined && String(row[criterion.key]) !== ""));
  const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
  const toTime = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
  const visibleRows = state.rows.filter((row) => {
    const matchesText = !filter || Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(filter.toLowerCase()));
    if (!matchesText) return false;
    const matchesCriteria = activeFilters.every((criterion) => {
      const selectedValue = criteriaFilters[criterion.key] ?? "";
      const rowValue = String(row[criterion.key] ?? "");
      return !selectedValue || (criterion.kind === "text"
        ? rowValue.toLowerCase().includes(selectedValue.toLowerCase())
        : rowValue === selectedValue);
    });
    if (!matchesCriteria) return false;
    if (!dateField || (fromTime === null && toTime === null)) return true;
    const timestamp = typeof row[dateField] === "string" ? Date.parse(String(row[dateField])) : Number.NaN;
    return Number.isFinite(timestamp) && (fromTime === null || timestamp >= fromTime) && (toTime === null || timestamp <= toTime);
  });
  const columns = columnsBySection[section] ?? [];

  function showSuccess(message: string) {
    setToast(message);
    setRevision((value) => value + 1);
  }

  async function runAction(action: () => Promise<void>, successMessage: string) {
    try {
      await action();
      showSuccess(successMessage);
      return true;
    } catch (caught) {
      setError(readError(caught));
      return false;
    }
  }

  function rowActions(row: DataRow) {
    if (section === "movements" && accountRole === "admin" && !row.ended_at) {
      return <ReasonAction label="Tutup sesi" placeholder="Alasan penutupan admin" onSubmit={(reason) => runAction(async () => {
        const { error: rpcError } = await supabase.rpc("admin_force_close_movement", {
          p_movement_session_id: String(row.id),
          p_reason: reason.trim(),
        });
        if (rpcError) throw rpcError;
      }, "Sesi perjalanan ditutup dan dicatat pada audit log.")} />;
    }
    if (section === "plans" && accountRole !== "admin" && row.status === "approved") {
      return <button className="row-action" onClick={() => runAction(async () => {
        const { error: rpcError } = await supabase.rpc("cancel_movement_plan", { p_plan_id: row.id, p_reason: "Dibatalkan oleh pemilik rencana" });
        if (rpcError) throw rpcError;
      }, "Rencana izin dibatalkan.")}>Batalkan</button>;
    }
    if (["visitors", "active-visits"].includes(section) && row.status === "active") {
      return <button className="row-action" onClick={() => void runAction(async () => {
        const { error: rpcError } = await supabase.rpc("record_visitor_exit", { p_visit_id: row.id, p_notes: null });
        if (rpcError) throw rpcError;
      }, "Waktu keluar tamu tercatat.")}>Catat keluar</button>;
    }
    if (section === "guards" && row.record_type === "Assignment" && !row.revoked_at) {
      return <ReasonAction label="Cabut" placeholder="Alasan pencabutan" onSubmit={(reason) => runAction(async () => {
          const { error: rpcError } = await supabase.rpc("revoke_guard_assignment", { p_assignment_id: row.id, p_reason: reason.trim() });
          if (rpcError) throw rpcError;
        }, "Penugasan jaga dicabut.")} />;
    }
    if (section === "posts" && row.status === "active") {
      return <ReasonAction label="Nonaktifkan" placeholder="Alasan" onSubmit={(reason) => runAction(async () => {
        const { error: rpcError } = await supabase.rpc("admin_manage_post", {
          p_action: "disable", p_unit_id: unitId, p_post_id: row.id,
          p_name: null, p_description: null, p_latitude: null, p_longitude: null,
          p_radius_meters: null, p_reason: reason.trim(),
        });
        if (rpcError) throw rpcError;
      }, "Pos dinonaktifkan.")} />;
    }
    if (section === "notifications" && !row.read_at) {
      return <button className="row-action" onClick={() => runAction(async () => {
        const { error: updateError } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", row.id).eq("user_id", userId);
        if (updateError) throw updateError;
      }, "Notifikasi ditandai dibaca.")}>Tandai dibaca</button>;
    }
    return null;
  }

  const hasRows = columns.length > 0;
  const hasForm = ["plans", "scan", "profile", "personnel", "family", "accounts", "units", "posts", "qr", "guards", "guard-invites", "settings", "reports"].includes(section)
    || (section === "visitors" && effectiveRole === "temporary_guard");

  return (
    <div className="workspace-section">
      <SectionHeading
        eyebrow={unitName.toUpperCase()}
        title={section === "dashboard" ? `Selamat datang, ${displayName}` : label}
        description={sectionDescription(section, effectiveRole)}
        action={<button className="icon-button refresh-button" onClick={() => setRevision((value) => value + 1)} title="Muat ulang" aria-label="Muat ulang"><RefreshCw size={17} /></button>}
      />

      {error && <ErrorState message={error} onRetry={() => setRevision((value) => value + 1)} />}

      {section === "dashboard" && <Dashboard role={effectiveRole} accountRole={accountRole} summary={state.summary} unitName={unitName} branding={branding} />}
      {section === "guard-dashboard" && <GuardDashboard summary={state.summary} rows={state.rows} />}
      {section === "journey" && <JourneyStatus summary={state.summary} />}
      {section === "live-locations" && <LiveLocationView rows={state.rows} unitId={unitId} />}
      {section === "scan" && <ScanNotice />}
      {["visitors", "active-visits", "visit-history"].includes(section) && <PrivateDocumentUpload unitId={unitId} visits={state.rows} onComplete={showSuccess} />}

      {hasForm && <OperationForm
        key={`${section}:${unitId}:${JSON.stringify(branding)}`}
        section={section}
        role={effectiveRole}
        choices={state.choices}
        profileName={typeof state.summary?.display_name === "string" ? state.summary.display_name : displayName}
        inviteToken={inviteToken}
        onComplete={showSuccess}
      />}

      {hasRows && <Panel
        title={tableTitle(section)}
        description={`${visibleRows.length.toLocaleString("id-ID")} baris${state.rows.length !== visibleRows.length ? ` dari ${state.rows.length.toLocaleString("id-ID")}` : ""}`}
        action={exportableSection(section) && <ExportActions rows={visibleRows} title={label} />}
      >
        <div className="table-toolbar">
          <label className="table-search"><Search size={16} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Cari dalam data" aria-label="Cari dalam data" /></label>
          {dateField && <div className="table-date-filters">
            <label><span>Dari</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Tanggal mulai" /></label>
            <label><span>Sampai</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Tanggal akhir" /></label>
          </div>}
          {activeFilters.length > 0 && <div className="table-advanced-filters">{activeFilters.map((criterion) => {
            const options = [...new Set(state.rows.map((row) => String(row[criterion.key] ?? "")).filter(Boolean))].sort((first, second) => first.localeCompare(second, "id"));
            return <label className="table-advanced-filter" key={criterion.key}><span>{criterion.label}</span>{criterion.kind === "select"
              ? <select value={criteriaFilters[criterion.key] ?? ""} onChange={(event) => setCriteriaFilters((current) => ({ ...current, [criterion.key]: event.target.value }))}><option value="">Semua</option>{options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select>
              : <input value={criteriaFilters[criterion.key] ?? ""} onChange={(event) => setCriteriaFilters((current) => ({ ...current, [criterion.key]: event.target.value }))} placeholder={`Cari ${criterion.label.toLowerCase()}`} />}</label>;
          })}</div>}
        </div>
        {loading ? <LoadingState /> : <DataTable
          rows={visibleRows}
          columns={columns}
          renderActions={rowActions}
          emptyTitle={emptyTitle(section)}
          emptyDescription={emptyDescription(section)}
        />}
      </Panel>}

      {section === "profile" && <ProfileDetails summary={state.summary} />}
      {loading && !hasRows && !hasForm && <LoadingState />}
      {!loading && !hasRows && !hasForm && !["dashboard", "guard-dashboard", "journey", "live-locations", "scan", "profile"].includes(section) && (
        <Panel><EmptyState title={emptyTitle(section)} description={emptyDescription(section)} /></Panel>
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}

async function loadSectionData(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  section: SectionKey,
  unitId: string,
  userId: string,
  effectiveRole: EffectiveRole,
  accountRole: AccountRole,
  unitName: string,
): Promise<SectionState> {
  const result: SectionState = { ...emptyState, choices: { ...emptyState.choices } };
  const requireUnit = () => {
    if (!unitId) throw new Error("Akun belum terhubung ke satuan aktif.");
  };

  if (section === "dashboard") {
    if (effectiveRole === "admin") {
      requireUnit();
      const { data, error } = await supabase.rpc("get_admin_dashboard", { p_unit_id: unitId });
      if (error) throw error;
      result.summary = asRow(data);
    } else {
      const { data, error } = await supabase.rpc("get_my_movement_status");
      if (error) throw error;
      result.summary = asRow(data);
    }
    return result;
  }

  if (section === "guard-dashboard") {
    requireUnit();
    const now = new Date().toISOString();
    const { data: assignment, error: assignmentError } = await supabase.from("temporary_assignments")
      .select("id, unit_id, post_id, starts_at, ends_at")
      .eq("personnel_user_id", userId).eq("unit_id", unitId).is("revoked_at", null)
      .lte("starts_at", now).gt("ends_at", now).limit(1).maybeSingle();
    if (assignmentError) throw assignmentError;
    const { count, error: visitError } = await supabase.from("visitor_visits")
      .select("id", { count: "exact", head: true }).eq("assignment_id", assignment?.id ?? "00000000-0000-0000-0000-000000000000").eq("status", "active");
    if (visitError) throw visitError;
    result.summary = { assignment: assignment ?? null, active_visitors: count ?? 0 };
    return result;
  }

  if (["journey", "history", "scan"].includes(section)) {
    const { data, error } = await supabase.rpc("get_my_movement_status");
    if (error) throw error;
    result.summary = asRow(data);
    const status = asRow(data);
    if (section === "history") result.rows = asRows(status?.history).map((session) => {
      const plan = asRow(session.plan);
      return { ...session, destination: plan?.destination, purpose: plan?.purpose };
    });
    return result;
  }

  if (section === "profile") {
    const { data: profile, error } = await supabase.from("profiles").select("id,display_name,account_role,status,created_at,updated_at").eq("id", userId).maybeSingle();
    if (error) throw error;
    let detail: DataRow = {};
    if (accountRole === "personnel") {
      const { data, error: detailError } = await supabase.from("personnel").select("nrp,rank,position").eq("id", userId).maybeSingle();
      if (detailError) throw detailError;
      detail = data ?? {};
    } else if (accountRole === "family") {
      const { data, error: detailError } = await supabase.from("family_accounts").select("family_code,related_personnel_id,unit_id").eq("id", userId).maybeSingle();
      if (detailError) throw detailError;
      detail = data ?? {};
    }
    const { data: memberships, error: membershipError } = await supabase.from("unit_memberships").select("unit_id, units(name)").eq("user_id", userId).eq("status", "active");
    if (membershipError) throw membershipError;
    result.summary = { ...(profile ?? {}), ...detail, memberships: memberships ?? [] };
    result.rows = profile ? [{ ...profile, ...detail }] : [];
    return result;
  }

  if (section === "plans") {
    const query = supabase.from("movement_plans").select("id,user_id,unit_id,departure_at,planned_return_at,destination,purpose,notes,status,created_at,used_at,completed_at").order("created_at", { ascending: false }).limit(200);
    const { data, error } = effectiveRole === "admin" ? await query.eq("unit_id", unitId) : await query.eq("user_id", userId);
    if (error) throw error;
    result.rows = asRows(data);
    return result;
  }

  if (section === "live-locations") {
    requireUnit();
    const { data, error } = await supabase.rpc("get_admin_live_locations", { p_unit_id: unitId });
    if (error) throw error;
    result.rows = asRows(data);
    return result;
  }

  if (section === "personnel" || section === "family") {
    requireUnit();
    const people = await loadPeople(supabase, unitId, section);
    result.rows = people;
    if (section === "personnel") result.choices.personnel = people;
    else {
      result.choices.families = people;
      result.choices.personnel = (await loadPeople(supabase, unitId, "personnel"))
        .filter((row) => row.status === "active" && row.membership_status === "active");
    }
    return result;
  }

  if (section === "accounts") {
    requireUnit();
    const { data: memberships, error: membershipError } = await supabase.from("unit_memberships").select("user_id,status,created_at").eq("unit_id", unitId);
    if (membershipError) throw membershipError;
    const ids = asRows(memberships).map((row) => String(row.user_id));
    if (ids.length) {
      const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id,display_name,account_role,status,created_at").in("id", ids);
      if (profilesError) throw profilesError;
      const membershipStatus = new Map(asRows(memberships).map((row) => [String(row.user_id), row.status]));
      result.rows = asRows(profiles).map((profile) => ({ ...profile, unit_name: unitName, membership_status: membershipStatus.get(String(profile.id)) ?? "unknown" }));
      result.choices.accounts = result.rows.filter((row) => row.id !== userId);
    }
    return result;
  }

  if (section === "units") {
    const { data, error } = await supabase.from("units").select("id,name,created_at").order("name");
    if (error) throw error;
    result.rows = asRows(data);
    return result;
  }

  if (["posts", "qr"].includes(section)) {
    requireUnit();
    const { data: posts, error: postsError } = await supabase.from("posts").select("id,unit_id,name,description,latitude,longitude,radius_meters,status,created_at").eq("unit_id", unitId).order("name");
    if (postsError) throw postsError;
    const postRows = asRows(posts);
    result.choices.posts = postRows.filter((row) => row.status === "active");
    if (section === "posts") result.rows = postRows;
    else if (postRows.length) {
      const { data, error } = await supabase.from("post_qr_codes").select("id,post_id,status,created_at,disabled_at,revoked_at").in("post_id", postRows.map((row) => String(row.id))).order("created_at", { ascending: false });
      if (error) throw error;
      const names = new Map(postRows.map((row) => [String(row.id), String(row.name)]));
      result.rows = asRows(data).map((row) => ({ ...row, post_name: names.get(String(row.post_id)) ?? "" }));
    }
    if (section === "qr") result.choices.qr = result.rows;
    return result;
  }

  if (section === "movements") {
    requireUnit();
    const { data: movements, error } = await supabase.from("movement_sessions").select("id,user_id,unit_id,plan_id,departure_post_id,status,started_at,ended_at").eq("unit_id", unitId).order("started_at", { ascending: false }).limit(300);
    if (error) throw error;
    const movementRows = asRows(movements);
    const userIds = [...new Set(movementRows.map((row) => String(row.user_id)))];
    const planIds = [...new Set(movementRows.map((row) => String(row.plan_id)))];
      const personnelIds = userIds;
      const familyIds = userIds;
      const postIds = [...new Set(movementRows.map((row) => String(row.departure_post_id ?? "")).filter(Boolean))];
      const [{ data: profiles }, { data: plans }, { data: personnel }, { data: families }, { data: posts }] = await Promise.all([
      userIds.length ? supabase.from("profiles").select("id,display_name,account_role").in("id", userIds) : Promise.resolve({ data: [] }),
      planIds.length ? supabase.from("movement_plans").select("id,destination,purpose").in("id", planIds) : Promise.resolve({ data: [] }),
        personnelIds.length ? supabase.from("personnel").select("id,nrp").in("id", personnelIds) : Promise.resolve({ data: [] }),
        familyIds.length ? supabase.from("family_accounts").select("id,family_code").in("id", familyIds) : Promise.resolve({ data: [] }),
        postIds.length ? supabase.from("posts").select("id,name").in("id", postIds) : Promise.resolve({ data: [] }),
    ]);
    const people = new Map(asRows(profiles).map((row) => [String(row.id), row]));
    const purposes = new Map(asRows(plans).map((row) => [String(row.id), row]));
    const nrps = new Map(asRows(personnel).map((row) => [String(row.id), row.nrp]));
    const familyCodes = new Map(asRows(families).map((row) => [String(row.id), row.family_code]));
    const postsById = new Map(asRows(posts).map((row) => [String(row.id), row.name]));
    result.rows = movementRows.map((row) => ({
      ...row,
      movement_session_id: row.id,
      ...(people.get(String(row.user_id)) ?? {}),
      ...(purposes.get(String(row.plan_id)) ?? {}),
      nrp: nrps.get(String(row.user_id)),
      family_code: familyCodes.get(String(row.user_id)),
      post_name: postsById.get(String(row.departure_post_id)),
    }));
    return result;
  }

  if (["visitors", "active-visits", "visit-history"].includes(section)) {
    requireUnit();
    const visitQuery = supabase.from("visitor_visits").select("id,visitor_id,unit_id,post_id,assignment_id,handled_by_user_id,purpose,host_name,checked_in_at,checked_out_at,status").eq("unit_id", unitId).order("checked_in_at", { ascending: false }).limit(300);
    const { data: visits, error } = section === "active-visits" ? await visitQuery.eq("status", "active") : await visitQuery;
    if (error) throw error;
    const visitRows = asRows(visits);
    const enriched: DataRow[] = await enrichVisits(supabase, visitRows);
    const visitIds = visitRows.map((row) => String(row.id));
    if (visitIds.length) {
      const { data: documents, error: documentError } = await supabase.from("visitor_documents").select("id,visit_id,document_type,object_path,created_at").in("visit_id", visitIds);
      if (documentError) throw documentError;
      const documentsByVisit = new Map<string, DataRow[]>();
      for (const document of asRows(documents)) {
        const visitId = String(document.visit_id);
        documentsByVisit.set(visitId, [...(documentsByVisit.get(visitId) ?? []), document]);
      }
      result.rows = enriched.map((visit) => ({ ...visit, documents: documentsByVisit.get(String(visit.id)) ?? [] }));
    } else result.rows = enriched;
    return result;
  }

  if (section === "vehicles") {
    requireUnit();
    const { data: visits, error: visitsError } = await supabase.from("visitor_visits").select("id,visitor_id,unit_id").eq("unit_id", unitId);
    if (visitsError) throw visitsError;
    const visitRows = asRows(visits);
    if (visitRows.length) {
      const { data: vehicles, error } = await supabase.from("visitor_vehicles").select("id,visit_id,vehicle_type,make_model,color,plate_number,created_at").in("visit_id", visitRows.map((row) => String(row.id)));
      if (error) throw error;
      const visitsById = new Map(visitRows.map((row) => [String(row.id), row]));
      const visitorIds = [...new Set(visitRows.map((row) => String(row.visitor_id)))];
      const { data: visitors } = visitorIds.length ? await supabase.from("visitors").select("id,full_name").in("id", visitorIds) : { data: [] };
      const names = new Map(asRows(visitors).map((row) => [String(row.id), String(row.full_name)]));
      result.rows = asRows(vehicles).map((vehicle) => {
        const visit = visitsById.get(String(vehicle.visit_id));
        return { ...vehicle, visitor_name: names.get(String(visit?.visitor_id)) ?? "" };
      });
    }
    return result;
  }

  if (section === "guards" || section === "guard-invites" || section === "guard-report" || section === "reports") {
    requireUnit();
    let assignments: DataRow[] = [];
    if (section === "guards" || section === "reports") {
      const { data, error } = await supabase.from("temporary_assignments").select("id,invite_id,unit_id,post_id,personnel_user_id,starts_at,ends_at,revoked_at").eq("unit_id", unitId).order("starts_at", { ascending: false });
      if (error) throw error;
      assignments = asRows(data);
    } else if (section === "guard-report") {
      const { data, error } = await supabase.from("temporary_assignments").select("id,invite_id,unit_id,post_id,personnel_user_id,starts_at,ends_at,revoked_at").eq("personnel_user_id", userId).eq("unit_id", unitId).order("starts_at", { ascending: false });
      if (error) throw error;
      assignments = asRows(data);
    }
    if (assignments.length) {
      const [personnel, posts] = await Promise.all([
        loadPeople(supabase, unitId, "personnel"),
        loadPosts(supabase, unitId),
      ]);
      const personnelById = new Map(personnel.map((row) => [String(row.id), row]));
      const postsById = new Map(posts.map((row) => [String(row.id), row]));
      result.choices.assignments = assignments.map((row) => ({ ...row, display_name: personnelById.get(String(row.personnel_user_id))?.display_name, nrp: personnelById.get(String(row.personnel_user_id))?.nrp, post_name: postsById.get(String(row.post_id))?.name }));
      result.rows = result.choices.assignments;
      if (section === "guards") {
        result.choices.personnel = personnel.filter((row) => row.status === "active" && row.membership_status === "active");
        result.choices.posts = posts.filter((post) => post.status === "active");
        const { data: invites, error: inviteError } = await supabase.from("guard_invites").select("id,unit_id,post_id,personnel_user_id,status,starts_at,ends_at,created_at,revoked_at").eq("unit_id", unitId).order("created_at", { ascending: false });
        if (inviteError) throw inviteError;
        const assignmentRows = result.rows.map((row) => ({ ...row, record_type: "Assignment", status: row.revoked_at ? "revoked" : "active" }));
        const inviteRows = asRows(invites).map((row) => ({ ...row, record_type: "Undangan", display_name: personnelById.get(String(row.personnel_user_id))?.display_name, post_name: postsById.get(String(row.post_id))?.name }));
        result.rows = [...assignmentRows, ...inviteRows];
      }
      if (["reports", "guard-report"].includes(section)) {
        const assignmentIds = assignments.map((row) => String(row.id));
        const { data: reports, error } = await supabase.from("guard_reports").select("id,assignment_id,unit_id,report_data,generated_at").in("assignment_id", assignmentIds).order("generated_at", { ascending: false });
        if (error) throw error;
        const reportByAssignment = new Map(asRows(reports).map((row) => [String(row.assignment_id), row]));
        result.rows = result.choices.assignments.flatMap((assignment) => {
          const report = reportByAssignment.get(String(assignment.id));
          if (!report) return [];
          const payload = asRow(report.report_data) ?? {};
          return [{ ...report, ...payload, post_name: payload.post_name ?? assignment.post_name, display_name: payload.personnel_name ?? assignment.display_name, nrp: assignment.nrp }];
        });
      }
    }
    if (section === "guard-invites") {
      const { data, error } = await supabase.from("guard_invites").select("id,unit_id,post_id,personnel_user_id,status,starts_at,ends_at,note,created_by,created_at,accepted_at,revoked_at").eq("personnel_user_id", userId).eq("unit_id", unitId).order("created_at", { ascending: false });
      if (error) throw error;
      const posts = await loadPosts(supabase, unitId);
      const postsById = new Map(posts.map((row) => [String(row.id), row]));
      result.rows = asRows(data).map((row) => ({ ...row, post_name: postsById.get(String(row.post_id))?.name }));
    }
    return result;
  }

  if (section === "audit") {
    requireUnit();
    const { data, error } = await supabase.from("audit_logs").select("id,actor_user_id,unit_id,action,entity_type,entity_id,reason,created_at,before_data,after_data").eq("unit_id", unitId).order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    result.rows = asRows(data);
    return result;
  }

  if (section === "notifications") {
    const { data, error } = await supabase.from("notifications").select("id,user_id,unit_id,notification_type,payload,created_at,read_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    result.rows = asRows(data).map((row) => ({ ...row, payload_summary: Object.entries(asRow(row.payload) ?? {}).map(([key, value]) => `${key}: ${String(value)}`).join(" · ") || "-" }));
    return result;
  }

  if (section === "settings") {
    if (effectiveRole !== "admin") return result;
    requireUnit();
    const { data, error } = await supabase.from("system_settings").select("id,unit_id,setting_key,setting_value,updated_by,updated_at").eq("unit_id", unitId).order("setting_key");
    if (error) throw error;
    result.rows = asRows(data).map((row) => ({ ...row, setting_value_text: JSON.stringify(row.setting_value) }));
    return result;
  }

  return result;
}

async function loadPeople(supabase: ReturnType<typeof createSupabaseBrowserClient>, unitId: string, type: "personnel" | "family"): Promise<DataRow[]> {
  if (type === "personnel") {
    const { data: personnel, error } = await supabase.from("personnel").select("id,nrp,rank,position,created_at,updated_at").order("nrp");
    if (error) throw error;
    const rows = asRows(personnel);
    const ids = rows.map((row) => String(row.id));
    const [{ data: profiles }, { data: memberships }] = await Promise.all([
      ids.length ? supabase.from("profiles").select("id,display_name,status,account_role").in("id", ids) : Promise.resolve({ data: [] }),
      unitId ? supabase.from("unit_memberships").select("user_id,status").eq("unit_id", unitId) : Promise.resolve({ data: [] }),
    ]);
    const profileById = new Map(asRows(profiles).map((row) => [String(row.id), row]));
    const membershipByUser = new Map(asRows(memberships).map((row) => [String(row.user_id), String(row.status)]));
    return rows.filter((row) => !unitId || membershipByUser.has(String(row.id))).map((row) => ({ ...row, ...(profileById.get(String(row.id)) ?? {}), membership_status: membershipByUser.get(String(row.id)) ?? "unknown" }));
  }

  const { data: families, error } = await supabase.from("family_accounts").select("id,family_code,related_personnel_id,unit_id,created_at,updated_at").eq("unit_id", unitId).order("family_code");
  if (error) throw error;
  const rows = asRows(families);
  const ids = rows.map((row) => String(row.id));
  const personnelIds = [...new Set(rows.map((row) => String(row.related_personnel_id)))];
  const [{ data: profiles }, { data: personnel }] = await Promise.all([
    ids.length ? supabase.from("profiles").select("id,display_name,status,account_role").in("id", ids) : Promise.resolve({ data: [] }),
    personnelIds.length ? supabase.from("personnel").select("id,nrp").in("id", personnelIds) : Promise.resolve({ data: [] }),
  ]);
  const profileById = new Map(asRows(profiles).map((row) => [String(row.id), row]));
  const nrpById = new Map(asRows(personnel).map((row) => [String(row.id), String(row.nrp)]));
  const { data: memberships } = await supabase.from("unit_memberships").select("user_id,status").eq("unit_id", unitId);
  const membershipByUser = new Map(asRows(memberships).map((row) => [String(row.user_id), String(row.status)]));
  return rows.map((row) => ({ ...row, ...(profileById.get(String(row.id)) ?? {}), related_nrp: nrpById.get(String(row.related_personnel_id)) ?? "", membership_status: membershipByUser.get(String(row.id)) ?? "unknown" }));
}

async function loadPosts(supabase: ReturnType<typeof createSupabaseBrowserClient>, unitId: string) {
  const { data, error } = await supabase.from("posts").select("id,unit_id,name,description,latitude,longitude,radius_meters,status,created_at").eq("unit_id", unitId).order("name");
  if (error) throw error;
  return asRows(data);
}

async function enrichVisits(supabase: ReturnType<typeof createSupabaseBrowserClient>, visits: DataRow[]) {
  if (!visits.length) return [];
  const visitorIds = [...new Set(visits.map((row) => String(row.visitor_id)))];
  const postIds = [...new Set(visits.map((row) => String(row.post_id)))];
  const visitIds = visits.map((row) => String(row.id));
  const [{ data: visitors }, { data: posts }, { data: vehicles }] = await Promise.all([
    supabase.from("visitors").select("id,full_name,identity_type,identity_number,phone").in("id", visitorIds),
    supabase.from("posts").select("id,name").in("id", postIds),
    supabase.from("visitor_vehicles").select("visit_id,vehicle_type,make_model,color,plate_number").in("visit_id", visitIds),
  ]);
  const visitorById = new Map(asRows(visitors).map((row) => [String(row.id), row]));
  const postById = new Map(asRows(posts).map((row) => [String(row.id), row]));
  const vehiclesByVisit = new Map<string, DataRow[]>();
  for (const vehicle of asRows(vehicles)) {
    const visitId = String(vehicle.visit_id);
    vehiclesByVisit.set(visitId, [...(vehiclesByVisit.get(visitId) ?? []), vehicle]);
  }
  return visits.map((visit) => {
    const visitor = visitorById.get(String(visit.visitor_id)) ?? {};
    const firstVehicle = vehiclesByVisit.get(String(visit.id))?.[0] ?? {};
    return { ...visit, visitor_name: visitor.full_name, identity_type: visitor.identity_type, identity_number: visitor.identity_number, phone: visitor.phone, post_name: postById.get(String(visit.post_id))?.name, vehicle_summary: firstVehicle.plate_number ?? firstVehicle.vehicle_type ?? "-" };
  });
}

function Dashboard({ role, accountRole, summary, unitName, branding }: { role: EffectiveRole; accountRole: AccountRole; summary: DataRow | null; unitName: string; branding: BrandingConfig }) {
  const brandName = branding.whiteLabelEnabled || !branding.showGateopsBrand ? branding.name || unitName : "GateOps";
  if (role === "admin") {
    const metrics = [
      ["Total personel", summary?.total_personnel], ["Total keluarga", summary?.total_family], ["Pengguna aktif", summary?.active_users],
      ["Personel di dalam", summary?.personnel_inside], ["Personel di luar", summary?.personnel_out],
      ["Keluarga di dalam", summary?.family_inside], ["Keluarga di luar", summary?.family_out], ["Izin berjalan", summary?.active_plans],
      ["Tamu di dalam", summary?.active_visitors], ["Petugas jaga aktif", summary?.active_guards],
    ].map(([label, value]) => ({ label: String(label), value: typeof value === "number" ? value : "—" }));
    return <>
      <div className="dashboard-hero-shell">
        <div className="dashboard-hero-copy">
          <span className="dashboard-hero-badge">{branding.whiteLabelEnabled ? "WHITE LABEL" : "GATEOPS PLATFORM"} • {unitName.toUpperCase()}</span>
          <h2>Operasional satuan dalam satu kontrol terpusat</h2>
          <p>{branding.tagline}. Operasional satuan, akses personel, dan aktivitas pos dalam satu workspace.</p>
        </div>
        <div className="dashboard-hero-brand">
          <div className="dashboard-brand-mark"><ShieldCheck size={20} /></div>
          <div>
            <strong>{brandName}</strong>
            <span>{branding.showGateopsBrand ? "Powered by GateOps" : branding.tagline}</span>
          </div>
        </div>
      </div>
      <MetricGrid metrics={metrics} />
      <Panel title={`Cakupan ${unitName}`} description="Angka berasal dari RPC dashboard dan mengikuti hak akses satuan."><div className="dashboard-shortcuts"><Shortcut href="/app/live-locations" icon={<MapPin size={17} />} label="Pantau lokasi" /><Shortcut href="/app/movements" icon={<ArrowUpRight size={17} />} label="Riwayat keluar-masuk" /><Shortcut href="/app/reports" icon={<FileText size={17} />} label="Laporan tugas" /></div></Panel>
    </>;
  }

  if (role === "temporary_guard") {
    const assignment = asRow(summary?.assignment);
    return <>
      <div className="dashboard-hero-shell compact">
        <div className="dashboard-hero-copy">
          <span className="dashboard-hero-badge">{branding.whiteLabelEnabled ? "WHITE LABEL" : "GATEOPS PLATFORM"} • JAGA</span>
          <h2>Mode penugasan aktif Anda</h2>
          <p>{branding.tagline}. Informasi tugas dan kunjungan mengikuti cakupan satuan aktif.</p>
        </div>
        <div className="dashboard-hero-brand">
          <div className="dashboard-brand-mark"><ShieldCheck size={20} /></div>
          <div>
            <strong>{brandName}</strong>
            <span>{branding.showGateopsBrand ? "Powered by GateOps" : branding.tagline}</span>
          </div>
        </div>
      </div>
      <MetricGrid metrics={[
        { label: "Penugasan", value: assignment ? "Aktif" : "—", detail: assignment ? `Berakhir ${new Date(String(assignment.ends_at)).toLocaleString("id-ID")}` : "Tidak ada assignment aktif" },
        { label: "Tamu aktif", value: typeof summary?.active_visitors === "number" ? summary.active_visitors : "—" },
      ]} /><Panel title="Tugas berjalan" description="Status diverifikasi ulang oleh backend pada setiap tindakan."><div className="dashboard-shortcuts"><Shortcut href="/app/visitors" icon={<Fingerprint size={17} />} label="Catat tamu" /><Shortcut href="/app/active-visits" icon={<UsersRoundIcon />} label="Tamu di dalam" /><Shortcut href="/app/visit-history" icon={<HistoryIcon />} label="Riwayat kunjungan" /></div></Panel></>;
  }

  const active = asRow(summary?.active_session);
  const plans = asRows(summary?.plans);
  const approvedPlans = plans.filter((plan) => plan.status === "approved").length;
  const roleLabel = roleLabels[accountRole];
  return <>
    <div className="dashboard-hero-shell compact">
      <div className="dashboard-hero-copy">
        <span className="dashboard-hero-badge">{branding.whiteLabelEnabled ? "WHITE LABEL" : "GATEOPS PLATFORM"} • {unitName.toUpperCase()}</span>
        <h2>Selamat datang di {brandName}</h2>
        <p>{branding.tagline}. Informasi operasional ditampilkan sesuai peran dan satuan aktif Anda.</p>
      </div>
      <div className="dashboard-hero-brand">
        <div className="dashboard-brand-mark"><ShieldCheck size={20} /></div>
        <div>
          <strong>{brandName}</strong>
          <span>{branding.showGateopsBrand ? "GateOps Platform" : branding.tagline}</span>
        </div>
      </div>
    </div>
    <MetricGrid metrics={[
      { label: "Status perjalanan", value: active ? "Di luar" : "Di dalam", tone: active ? "amber" : "green" },
      { label: "Rencana disetujui", value: approvedPlans },
      { label: "Riwayat perjalanan", value: asRows(summary?.history).length },
    ]} /><Panel title={`Aktivitas ${roleLabel}`} description="Informasi pribadi hanya diambil untuk akun yang sedang masuk."><div className="dashboard-shortcuts"><Shortcut href="/app/plans" icon={<ClipboardIcon />} label="Rencana izin" /><Shortcut href="/app/scan" icon={<QrIcon />} label="Scan QR" /><Shortcut href="/app/history" icon={<HistoryIcon />} label="Riwayat pribadi" /></div></Panel></>;
}

function GuardDashboard({ summary, rows }: { summary: DataRow | null; rows: DataRow[] }) {
  const assignment = asRow(summary?.assignment);
  return <><MetricGrid metrics={[
    { label: "Kunjungan aktif", value: rows.filter((row) => row.status === "active").length },
    { label: "Assignment", value: assignment ? "Aktif" : "Tidak aktif" },
    { label: "Pos", value: String(assignment?.post_id ?? "—") },
  ]} /><Panel title="Operasi jaga" description="Pencatatan hanya tersedia selama assignment masih aktif."><div className="dashboard-shortcuts"><Shortcut href="/app/visitors" icon={<Fingerprint size={17} />} label="Catat tamu" /><Shortcut href="/app/active-visits" icon={<UsersRoundIcon />} label="Tamu di dalam" /></div></Panel></>;
}

function JourneyStatus({ summary }: { summary: DataRow | null }) {
  const active = asRow(summary?.active_session);
  const plan = asRow(active?.plan);
  const location = asRow(active?.location);
  if (!active) return <Panel title="Status perjalanan"><div className="journey-empty"><StatusTag value="Di dalam" /><p>Tidak ada sesi keluar aktif.</p><Link className="button-primary" href="/app/plans">Buat rencana izin</Link></div></Panel>;
  return <Panel title="Perjalanan aktif" description="Sesi berakhir setelah scan kepulangan yang sah atau tindakan admin."><div className="journey-card"><StatusTag value="Di luar" /><dl>
    <div><dt>Waktu keluar</dt><dd>{formatDate(active.started_at)}</dd></div>
    <div><dt>Tujuan</dt><dd>{String(plan?.destination ?? "-")}</dd></div>
    <div><dt>Keperluan</dt><dd>{String(plan?.purpose ?? "-")}</dd></div>
    <div><dt>Status GPS</dt><dd>{String(location?.status ?? "Aktif")}</dd></div>
    <div><dt>Pembaruan terakhir</dt><dd>{formatDate(location?.last_received_at)}</dd></div>
  </dl><Link className="button-primary" href="/app/scan"><QrCode size={16} /> Scan QR kepulangan</Link></div></Panel>;
}

function LiveLocationView({ rows, unitId }: { rows: DataRow[]; unitId: string }) {
  const [supabase] = useState(createSupabaseBrowserClient);
  const [selectedLocation, setSelectedLocation] = useState<DataRow | null>(null);
  const [historyRows, setHistoryRows] = useState<DataRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const locations = rows.map((row) => ({ ...row, latitude: numeric(row.latitude), longitude: numeric(row.longitude) }));

  async function showHistory(location: DataRow) {
    setSelectedLocation(location);
    setHistoryRows([]);
    setHistoryError("");
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_admin_location_history", {
        p_unit_id: unitId,
        p_user_id: String(location.user_id),
        p_limit: 500,
      });
      if (error) throw error;
      setHistoryRows(asRows(data));
    } catch (caught) {
      setHistoryError(readError(caught));
    } finally {
      setHistoryLoading(false);
    }
  }

  return <>
    <div className="location-layout">
      <Panel title="Peta lokasi" description="Posisi terakhir pengguna dengan sesi perjalanan aktif."><LiveLocationMap locations={locations} /></Panel>
      <Panel title="Pembaruan terakhir" description="Waktu pengambilan dan penerimaan lokasi dicatat terpisah."><DataTable rows={rows} columns={[
        { key: "display_name", label: "Pengguna" }, { key: "account_role", label: "Jenis" }, { key: "nrp", label: "NRP" },
        { key: "family_code", label: "Kode keluarga" }, { key: "started_at", label: "Waktu keluar" },
        { key: "destination", label: "Tujuan" },
        { key: "location_status", label: "Status GPS", format: (_value, row) => <StatusTag value={gpsDisplayStatus(row)} /> },
        { key: "accuracy_meters", label: "Akurasi (m)" }, { key: "captured_at", label: "Diambil" }, { key: "received_at", label: "Diterima" },
      ]} renderActions={(row) => <button className="row-action" type="button" disabled={historyLoading || !row.user_id} onClick={() => void showHistory(row)}><History size={14} /> Riwayat GPS</button>} emptyTitle="Tidak ada pengguna di luar" emptyDescription="Lokasi muncul setelah transaksi keluar berhasil dan koordinat diterima." /></Panel>
    </div>
    {selectedLocation && <Panel title={`Riwayat GPS · ${String(selectedLocation.display_name ?? "Pengguna")}`} description={`Keluar ${formatDate(selectedLocation.started_at)} · Tujuan ${String(selectedLocation.destination ?? "-")}`} action={<button className="text-action" onClick={() => { setSelectedLocation(null); setHistoryRows([]); setHistoryError(""); }}>Tutup</button>}>
      {historyError ? <ErrorState message={historyError} onRetry={() => void showHistory(selectedLocation)} />
        : historyLoading ? <LoadingState label="Memuat riwayat lokasi..." />
          : <>{historyRows.length > 0 && <LocationHistoryMap points={historyRows} />}<DataTable rows={historyRows} columns={[
            { key: "captured_at", label: "Waktu pengambilan" }, { key: "received_at", label: "Waktu diterima" },
            { key: "latitude", label: "Latitude", format: (value) => formatCoordinate(value) },
            { key: "longitude", label: "Longitude", format: (value) => formatCoordinate(value) },
            { key: "accuracy_meters", label: "Akurasi (m)", format: (value) => typeof value === "number" ? Math.round(value) : "-" },
          ]} emptyTitle="Belum ada titik GPS" emptyDescription="Sesi perjalanan tetap aktif meskipun perangkat belum mengirim koordinat." /> </>}
    </Panel>}
  </>;
}

function gpsDisplayStatus(row: DataRow) {
  if (row.location_status !== "active") return String(row.location_status ?? "Tidak tersedia");
  if (typeof row.received_at !== "string") return "Tidak tersedia";
  const receivedAt = Date.parse(row.received_at);
  return Number.isFinite(receivedAt) && Date.now() - receivedAt > 120_000 ? "Terakhir terdeteksi" : "Aktif";
}

function formatCoordinate(value: unknown) {
  const coordinate = numeric(value);
  return coordinate === null ? "-" : coordinate.toFixed(6);
}

function ScanNotice() {
  return <Panel title="Sesi dan privasi lokasi" description="GPS dimulai saat scan keluar berhasil dan selesai setelah scan kepulangan yang sah."><p className="quiet-copy">Jika izin lokasi ditolak atau GPS tidak tersedia, transaksi QR tetap dicatat tanpa koordinat awal. Status perjalanan tidak berubah menjadi di dalam hanya karena GPS terputus.</p></Panel>;
}

function ProfileDetails({ summary }: { summary: DataRow | null }) {
  const memberships = asRows(summary?.memberships);
  return <Panel title="Data akun" description="Identitas internal dan satuan terhubung dari Supabase Auth."><dl className="profile-details">
    <div><dt>Jenis akun</dt><dd>{roleLabels[String(summary?.account_role) as AccountRole] ?? "-"}</dd></div>
    <div><dt>Status</dt><dd>{String(summary?.status ?? "-")}</dd></div>
    {typeof summary?.nrp === "string" && <div><dt>NRP</dt><dd>{summary.nrp}</dd></div>}
    {typeof summary?.family_code === "string" && <div><dt>Kode keluarga</dt><dd>{summary.family_code}</dd></div>}
    {typeof summary?.rank === "string" && <div><dt>Pangkat</dt><dd>{summary.rank}</dd></div>}
    {typeof summary?.position === "string" && <div><dt>Jabatan</dt><dd>{summary.position}</dd></div>}
    {typeof summary?.related_personnel_id === "string" && <div><dt>Personel penghubung</dt><dd className="mono-cell">{summary.related_personnel_id}</dd></div>}
    <div><dt>Satuan</dt><dd>{memberships.map((item) => String(asRow(item.units)?.name ?? "-")).join(", ") || "-"}</dd></div>
  </dl></Panel>;
}

function Shortcut({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return <Link className="dashboard-shortcut" href={href}><span>{icon}</span><strong>{label}</strong><ArrowUpRight size={15} /></Link>;
}

function ReasonAction({ label, placeholder, onSubmit }: { label: string; placeholder: string; onSubmit: (reason: string) => Promise<boolean | void> }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  return <form className="row-reason-action" onSubmit={async (event) => {
    event.preventDefault();
    if (!reason.trim()) return;
    setPending(true);
    try { if (await onSubmit(reason) !== false) setReason(""); } finally { setPending(false); }
  }}>
    <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={placeholder} aria-label={placeholder} maxLength={1000} required />
    <button className="row-action" type="submit" disabled={pending}>{pending ? "..." : label}</button>
  </form>;
}

function ExportActions({ rows, title }: { rows: DataRow[]; title: string }) {
  async function exportExcel() {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("GateOps");
    const fields = rows.length ? Object.keys(rows[0]) : [];
    worksheet.columns = fields.map((field) => ({ header: field, key: field, width: Math.min(42, Math.max(14, field.length + 3)) }));
    for (const row of rows) {
      worksheet.addRow(Object.fromEntries(fields.map((field) => [field, exportValue(row[field])])));
    }
    worksheet.getRow(1).font = { bold: true, color: { argb: "FF193B30" } };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `gateops-${slug(title)}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const document = new jsPDF();
    document.setFontSize(15);
    document.text(`GateOps · ${title}`, 14, 18);
    document.setFontSize(9);
    document.text(`Dibuat ${new Date().toLocaleString("id-ID")}`, 14, 25);
    const content = rows.map((row, index) => `${index + 1}. ${Object.entries(row).map(([key, value]) => `${key}: ${exportValue(value)}`).join(" | ")}`);
    let y = 35;
    for (const line of content) {
      const wrapped = document.splitTextToSize(line, 180) as string[];
      if (y + wrapped.length * 5 > 280) { document.addPage(); y = 18; }
      document.text(wrapped, 14, y);
      y += wrapped.length * 5 + 2;
    }
    document.save(`gateops-${slug(title)}.pdf`);
  }

  return <div className="export-actions"><button className="button-secondary button-compact" onClick={exportExcel}><FileSpreadsheet size={15} /> Excel</button><button className="button-secondary button-compact" onClick={exportPdf}><FileText size={15} /> PDF</button></div>;
}

function sectionDescription(section: SectionKey, role: EffectiveRole) {
  const descriptions: Partial<Record<SectionKey, string>> = {
    dashboard: role === "admin" ? "Pengawasan aktivitas pada satuan yang menjadi kewenangan." : "Status dan aktivitas akun Anda dari pusat data GateOps.",
    "live-locations": "Pembaruan GPS hanya terlihat oleh Admin satuan yang berwenang.",
    plans: "Rencana izin divalidasi dan disetujui otomatis oleh sistem.",
    scan: "QR statis pos menentukan transaksi keluar atau kembali berdasarkan sesi aktif.",
    visitors: "Data tamu dan kendaraan disimpan pada satuan yang ditangani.",
    guards: "Undangan dan masa tugas dibatasi oleh server.",
    reports: "Laporan penjagaan berdasarkan kunjungan dan penugasan yang tercatat.",
    audit: "Tindakan penting yang tercatat pada audit log satuan.",
  };
  return descriptions[section] ?? "Data dan tindakan mengikuti hak akses role serta satuan.";
}

function tableTitle(section: SectionKey) {
  const titles: Partial<Record<SectionKey, string>> = { history: "Riwayat perjalanan", movements: "Transaksi keluar-masuk", visitors: "Riwayat kunjungan", "active-visits": "Tamu aktif", "visit-history": "Riwayat kunjungan saya", qr: "QR pos", guards: "Penugasan jaga", reports: "Laporan jaga", "guard-report": "Laporan saya", audit: "Audit aktivitas", notifications: "Pemberitahuan", settings: "Pengaturan saat ini" };
  return titles[section] ?? getSectionLabel("admin", section);
}

function emptyTitle(section: SectionKey) {
  if (["plans", "history", "movements"].includes(section)) return "Belum ada perjalanan";
  if (["visitors", "active-visits", "visit-history", "vehicles"].includes(section)) return "Belum ada kunjungan";
  if (["reports", "guard-report"].includes(section)) return "Laporan belum tersedia";
  return "Belum ada data";
}

function emptyDescription(section: SectionKey) {
  if (section === "plans") return "Rencana izin yang disetujui atau digunakan akan tampil di sini.";
  if (section === "active-visits") return "Tidak ada tamu yang tercatat sedang berada di dalam.";
  if (section === "reports" || section === "guard-report") return "Laporan akan tersedia setelah tugas jaga berakhir dan pemeliharaan terjadwal dijalankan.";
  return "Belum ada baris yang memenuhi cakupan atau filter saat ini.";
}

function exportableSection(section: SectionKey) {
  return ["reports", "guard-report", "history", "movements", "visitors", "visit-history", "vehicles"].includes(section);
}

function asRows(value: unknown): DataRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is DataRow => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

function asRow(value: unknown): DataRow | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DataRow : null;
}

function formatDate(value: unknown) {
  if (typeof value !== "string") return "-";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "-" : date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function formatDuration(startedAt: unknown, endedAt: unknown) {
  if (typeof startedAt !== "string") return "-";
  const startTime = Date.parse(startedAt);
  const endTime = typeof endedAt === "string" ? Date.parse(endedAt) : Date.now();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return "-";
  const totalMinutes = Math.max(0, Math.floor((endTime - startTime) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} jam ${minutes} menit` : `${minutes} menit`;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function exportValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function slug(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "data";
}

function readError(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    if (code === "42501") return "Akses tidak diizinkan untuk role atau satuan ini.";
    if (code === "PGRST116") return "Data tidak ditemukan atau belum tersedia.";
    if (code === "PGRST202") return "Fungsi backend belum diterapkan pada proyek Supabase.";
  }
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Terjadi kendala saat mengambil data.";
}

function ClipboardIcon() { return <FileText size={17} />; }
function QrIcon() { return <QrCode size={17} />; }
function HistoryIcon() { return <History size={17} />; }
function UsersRoundIcon() { return <ArrowUpRight size={17} />; }