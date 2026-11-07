import { redirect } from "next/navigation";
import { GateOpsShell } from "@/components/workspace/app-shell";
import { isAccountRole, type EffectiveRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MembershipRow = {
  unit_id: string;
  units: { id: string; name: string } | null;
};

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    redirect("/");
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, display_name, account_role, status")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as { id: string; display_name: string | null; account_role: string; status: string } | null;
  if (!profile || profile.status !== "active" || !isAccountRole(profile.account_role)) redirect("/");

  const { data: membershipData } = await supabase
    .from("unit_memberships")
    .select("unit_id, units(id, name)")
    .eq("user_id", user.id)
    .eq("status", "active");
  const memberships = (membershipData ?? []) as unknown as MembershipRow[];
  const units = memberships.flatMap((membership) => membership.units ? [membership.units] : []);

  let effectiveRole: EffectiveRole = profile.account_role;
  let activeAssignment: { id: string; unit_id: string; post_id: string; ends_at: string } | null = null;
  if (profile.account_role === "personnel") {
    const now = new Date().toISOString();
    const { data: assignmentData } = await supabase
      .from("temporary_assignments")
      .select("id, unit_id, post_id, ends_at")
      .is("revoked_at", null)
      .lte("starts_at", now)
      .gt("ends_at", now)
      .limit(1)
      .maybeSingle();
    activeAssignment = assignmentData as typeof activeAssignment;
    if (activeAssignment) effectiveRole = "temporary_guard";
  }

  return (
    <GateOpsShell
      accountRole={profile.account_role}
      effectiveRole={effectiveRole}
      displayName={profile.display_name ?? "Pengguna"}
      userId={user.id}
      units={units}
      activeAssignment={activeAssignment}
    >
      {children}
    </GateOpsShell>
  );
}