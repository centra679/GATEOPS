import {
  Activity,
  Archive,
  Bell,
  CarFront,
  ClipboardList,
  FileBarChart,
  FileClock,
  Fingerprint,
  Gauge,
  History,
  MapPin,
  MapPinned,
  QrCode,
  Settings,
  ShieldCheck,
  Siren,
  UserRound,
  UserRoundCog,
  Users,
  UsersRound,
  Building2,
  type LucideIcon,
} from "lucide-react";
import type { EffectiveRole } from "@/lib/auth/roles";

export type SectionKey =
  | "dashboard" | "profile" | "plans" | "scan" | "journey" | "history" | "guard-invites"
  | "guard-dashboard" | "visitors" | "active-visits" | "visit-history" | "guard-report"
  | "live-locations" | "personnel" | "family" | "accounts" | "units" | "posts" | "qr"
  | "movements" | "vehicles" | "guards" | "reports" | "audit" | "notifications" | "settings";

export type NavigationItem = { key: SectionKey; label: string; icon: LucideIcon; group: string };

const navigationByRole: Record<EffectiveRole, NavigationItem[]> = {
  admin: [
    { key: "dashboard", label: "Ringkasan", icon: Gauge, group: "PENGAWASAN" },
    { key: "live-locations", label: "Pemantauan GPS", icon: MapPinned, group: "PENGAWASAN" },
    { key: "personnel", label: "Personel", icon: Users, group: "DATA PENGGUNA" },
    { key: "family", label: "Keluarga / Persit", icon: UsersRound, group: "DATA PENGGUNA" },
    { key: "accounts", label: "Akun & akses", icon: UserRoundCog, group: "DATA PENGGUNA" },
    { key: "units", label: "Satuan", icon: Building2, group: "KONFIGURASI" },
    { key: "posts", label: "Pos penjagaan", icon: MapPin, group: "KONFIGURASI" },
    { key: "qr", label: "QR Code", icon: QrCode, group: "KONFIGURASI" },
    { key: "plans", label: "Rencana izin", icon: ClipboardList, group: "PERGERAKAN" },
    { key: "movements", label: "Keluar-masuk", icon: Activity, group: "PERGERAKAN" },
    { key: "visitors", label: "Kunjungan tamu", icon: Fingerprint, group: "PENJAGAAN" },
    { key: "vehicles", label: "Kendaraan", icon: CarFront, group: "PENJAGAAN" },
    { key: "guards", label: "Petugas jaga", icon: ShieldCheck, group: "PENJAGAAN" },
    { key: "reports", label: "Laporan", icon: FileBarChart, group: "AKUNTABILITAS" },
    { key: "audit", label: "Audit log", icon: Archive, group: "AKUNTABILITAS" },
    { key: "notifications", label: "Notifikasi", icon: Bell, group: "AKUNTABILITAS" },
    { key: "settings", label: "Pengaturan", icon: Settings, group: "AKUNTABILITAS" },
  ],
  personnel: [
    { key: "dashboard", label: "Ringkasan", icon: Gauge, group: "AKUN SAYA" },
    { key: "profile", label: "Profil", icon: UserRound, group: "AKUN SAYA" },
    { key: "plans", label: "Rencana izin", icon: ClipboardList, group: "PERJALANAN" },
    { key: "scan", label: "Scan QR", icon: QrCode, group: "PERJALANAN" },
    { key: "journey", label: "Status perjalanan", icon: Activity, group: "PERJALANAN" },
    { key: "history", label: "Riwayat", icon: History, group: "PERJALANAN" },
    { key: "guard-invites", label: "Undangan jaga", icon: ShieldCheck, group: "PENUGASAN" },
    { key: "notifications", label: "Notifikasi", icon: Bell, group: "AKUN SAYA" },
    { key: "settings", label: "Pengaturan", icon: Settings, group: "AKUN SAYA" },
  ],
  family: [
    { key: "dashboard", label: "Ringkasan", icon: Gauge, group: "AKUN SAYA" },
    { key: "profile", label: "Profil", icon: UserRound, group: "AKUN SAYA" },
    { key: "plans", label: "Rencana izin", icon: ClipboardList, group: "PERJALANAN" },
    { key: "scan", label: "Scan QR", icon: QrCode, group: "PERJALANAN" },
    { key: "journey", label: "Status perjalanan", icon: Activity, group: "PERJALANAN" },
    { key: "history", label: "Riwayat pribadi", icon: History, group: "PERJALANAN" },
    { key: "notifications", label: "Notifikasi", icon: Bell, group: "AKUN SAYA" },
    { key: "settings", label: "Pengaturan", icon: Settings, group: "AKUN SAYA" },
  ],
  temporary_guard: [
    { key: "guard-dashboard", label: "Ringkasan jaga", icon: Gauge, group: "TUGAS AKTIF" },
    { key: "visitors", label: "Catat tamu", icon: Fingerprint, group: "KUNJUNGAN" },
    { key: "active-visits", label: "Tamu di dalam", icon: Siren, group: "KUNJUNGAN" },
    { key: "visit-history", label: "Riwayat kunjungan", icon: History, group: "KUNJUNGAN" },
    { key: "guard-report", label: "Laporan tugas", icon: FileClock, group: "TUGAS AKTIF" },
    { key: "profile", label: "Profil personel", icon: UserRound, group: "AKUN SAYA" },
    { key: "notifications", label: "Notifikasi", icon: Bell, group: "AKUN SAYA" },
  ],
};

const allSections = new Set(navigationByRole.admin.map((item) => item.key).concat(
  navigationByRole.personnel.map((item) => item.key),
  navigationByRole.temporary_guard.map((item) => item.key),
));

export function getNavigation(role: EffectiveRole) {
  return navigationByRole[role];
}

export function isKnownSection(value: string): value is SectionKey {
  return allSections.has(value as SectionKey);
}

export function getSectionLabel(role: EffectiveRole, key: SectionKey) {
  return navigationByRole[role].find((item) => item.key === key)?.label
    ?? Object.values(navigationByRole).flat().find((item) => item.key === key)?.label
    ?? "Ruang kerja";
}