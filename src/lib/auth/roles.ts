export const accountRoles = ["admin", "personnel", "family"] as const;

export type AccountRole = (typeof accountRoles)[number];
export type EffectiveRole = AccountRole | "temporary_guard";

export const roleLabels: Record<EffectiveRole, string> = {
  admin: "Admin",
  personnel: "Personel",
  family: "Keluarga / Persit",
  temporary_guard: "Petugas Jaga Sementara",
};

export function isAccountRole(value: unknown): value is AccountRole {
  return typeof value === "string" && accountRoles.includes(value as AccountRole);
}