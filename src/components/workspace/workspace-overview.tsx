"use client";

import Link from "next/link";
import { ArrowUpRight, Fingerprint, History, MapPin, QrCode, UsersRound } from "lucide-react";
import { roleLabels, type AccountRole, type EffectiveRole } from "@/lib/auth/roles";
import { MetricGrid, Panel } from "@/components/workspace/data-display";
import type { DataRow } from "@/components/workspace/data-display";

type Props = {
  role: EffectiveRole;
  accountRole: AccountRole;
  summary: DataRow | null;
  unitName: string;
};

export function WorkspaceOverview({ role, accountRole, summary, unitName }: Props) {
  if (role === "admin") {
    const groups = [
      {
        title: "Kekuatan",
        metrics: [
          ["Personel", summary?.total_personnel],
          ["Keluarga/Persit", summary?.total_family],
          ["Akun aktif", summary?.active_users],
        ],
      },
      {
        title: "Pergerakan",
        metrics: [
          ["Personel di satuan", summary?.personnel_inside],
          ["Personel di luar", summary?.personnel_out],
          ["Keluarga/Persit di satuan", summary?.family_inside],
          ["Keluarga/Persit di luar", summary?.family_out],
          ["Izin berjalan", summary?.active_plans],
        ],
      },
      {
        title: "Pos penjagaan",
        metrics: [
          ["Tamu di dalam", summary?.active_visitors],
          ["Petugas jaga", summary?.active_guards],
        ],
      },
    ];

    return (
      <>
        <div className="overview-metric-groups">
          {groups.map((group) => (
            <section className="overview-metric-group" key={group.title}>
              <h2>{group.title}</h2>
              <MetricGrid metrics={group.metrics.map(([label, value]) => ({
                label: String(label),
                value: typeof value === "number" ? value : "—",
              }))} />
            </section>
          ))}
        </div>
        <Panel title="Akses cepat" description={`Pantau kegiatan di ${unitName}.`}>
          <div className="dashboard-shortcuts">
            <Shortcut href="/app/live-locations" icon={<MapPin size={17} />} label="Pantau lokasi" />
            <Shortcut href="/app/movements" icon={<ArrowUpRight size={17} />} label="Transaksi keluar-masuk" />
            <Shortcut href="/app/reports" icon={<History size={17} />} label="Laporan penjagaan" />
          </div>
        </Panel>
      </>
    );
  }

  if (role === "temporary_guard") {
    const assignment = asRow(summary?.assignment);
    return (
      <>
        <MetricGrid metrics={[
          { label: "Jadwal jaga", value: assignment ? "Aktif" : "Tidak aktif", detail: assignment ? `Berakhir ${formatDate(assignment.ends_at)}` : "Tidak ada jadwal aktif" },
          { label: "Tamu di dalam", value: typeof summary?.active_visitors === "number" ? summary.active_visitors : "—" },
        ]} />
        <Panel title="Pencatatan pos" description="Catat kedatangan atau periksa kunjungan yang masih berlangsung.">
          <div className="dashboard-shortcuts">
            <Shortcut href="/app/visitors" icon={<Fingerprint size={17} />} label="Catat kedatangan" />
            <Shortcut href="/app/active-visits" icon={<UsersRound size={17} />} label="Tamu di dalam" />
            <Shortcut href="/app/visit-history" icon={<History size={17} />} label="Riwayat kunjungan" />
          </div>
        </Panel>
      </>
    );
  }

  const active = asRow(summary?.active_session);
  const plans = asRows(summary?.plans);
  const approvedPlans = plans.filter((plan) => plan.status === "approved").length;
  return (
    <>
      <MetricGrid metrics={[
        { label: "Status perjalanan", value: active ? "Di luar" : "Di dalam", tone: active ? "amber" : "green" },
        { label: "Rencana disetujui", value: approvedPlans },
        { label: "Riwayat perjalanan", value: asRows(summary?.history).length },
      ]} />
      <Panel title={`Perjalanan ${roleLabels[accountRole].toLowerCase()}`} description="Kelola rencana izin dan lihat catatan perjalanan Anda.">
        <div className="dashboard-shortcuts">
          <Shortcut href="/app/plans" icon={<QrCode size={17} />} label="Rencana izin" />
          <Shortcut href="/app/scan" icon={<Fingerprint size={17} />} label="Scan QR pos" />
          <Shortcut href="/app/history" icon={<History size={17} />} label="Riwayat perjalanan" />
        </div>
      </Panel>
    </>
  );
}

export function GuardDashboard({ summary, rows }: { summary: DataRow | null; rows: DataRow[] }) {
  const assignment = asRow(summary?.assignment);
  return (
    <>
      <MetricGrid metrics={[
        { label: "Kunjungan aktif", value: rows.filter((row) => row.status === "active").length },
        { label: "Jadwal jaga", value: assignment ? "Aktif" : "Tidak aktif" },
        { label: "Pos", value: String(assignment?.post_id ?? "—") },
      ]} />
      <Panel title="Pencatatan pos" description="Pencatatan tersedia selama jadwal jaga Anda aktif.">
        <div className="dashboard-shortcuts">
          <Shortcut href="/app/visitors" icon={<Fingerprint size={17} />} label="Catat kedatangan" />
          <Shortcut href="/app/active-visits" icon={<UsersRound size={17} />} label="Tamu di dalam" />
        </div>
      </Panel>
    </>
  );
}

function Shortcut({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return <Link className="dashboard-shortcut" href={href}><span>{icon}</span><strong>{label}</strong><ArrowUpRight size={15} /></Link>;
}

function asRow(value: unknown): DataRow | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as DataRow : null;
}

function asRows(value: unknown): DataRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is DataRow => row !== null && typeof row === "object" && !Array.isArray(row));
}

function formatDate(value: unknown) {
  if (typeof value !== "string") return "-";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "-" : date.toLocaleString("id-ID");
}
