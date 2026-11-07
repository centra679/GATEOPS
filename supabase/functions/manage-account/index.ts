import { createClient } from "npm:@supabase/supabase-js@2";
import { getEnvironment, isUuid, jsonResponse, readJsonBody } from "../_shared/security.ts";

type ManageAccountBody = {
  userId?: unknown;
  unitId?: unknown;
  status?: unknown;
  reason?: unknown;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method tidak diizinkan." }, 405);

  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return jsonResponse({ error: "Akses tidak diizinkan." }, 401);

  let body: ManageAccountBody;
  try {
    const parsedBody = await readJsonBody(request);
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return jsonResponse({ error: "Permintaan tidak valid." }, 400);
    }
    body = parsedBody as ManageAccountBody;
  } catch {
    return jsonResponse({ error: "Permintaan tidak valid atau terlalu besar." }, 400);
  }

  if (!isUuid(body.userId) || !isUuid(body.unitId)
    || (body.status !== "active" && body.status !== "disabled")
    || typeof body.reason !== "string" || body.reason.trim().length === 0 || body.reason.length > 1000
  ) {
    return jsonResponse({ error: "Data perubahan akun tidak valid." }, 400);
  }

  try {
    const [supabaseUrl, anonKey, serviceRoleKey] = getEnvironment(
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const caller = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: { user: actor }, error: actorError } = await caller.auth.getUser(bearer);
    if (actorError || !actor) return jsonResponse({ error: "Sesi admin tidak valid." }, 401);

    const { data: actorProfile } = await service
      .from("profiles")
      .select("id, account_role, status")
      .eq("id", actor.id)
      .maybeSingle();
    const { data: membership } = await service
      .from("unit_memberships")
      .select("id")
      .eq("user_id", actor.id)
      .eq("unit_id", body.unitId)
      .eq("status", "active")
      .maybeSingle();
    if (!actorProfile || actorProfile.account_role !== "admin" || actorProfile.status !== "active" || !membership) {
      return jsonResponse({ error: "Admin tidak berwenang pada satuan ini." }, 403);
    }

    const banDuration = body.status === "disabled" ? "876000h" : "none";
    if (body.status === "disabled") {
      const { error } = await service.auth.admin.updateUserById(body.userId, { ban_duration: banDuration });
      if (error) return jsonResponse({ error: "Sesi akun tidak dapat dicabut." }, 503);
    }

    const { error: statusError } = await caller.rpc("admin_set_account_status", {
      p_user_id: body.userId,
      p_unit_id: body.unitId,
      p_status: body.status,
      p_reason: body.reason.trim(),
    });
    if (statusError) {
      if (body.status === "disabled") {
        await service.auth.admin.updateUserById(body.userId, { ban_duration: "none" });
      }
      return jsonResponse({ error: "Status akun tidak dapat diubah." }, 409);
    }

    if (body.status === "active") {
      const { error } = await service.auth.admin.updateUserById(body.userId, { ban_duration: "none" });
      if (error) {
        await caller.rpc("admin_set_account_status", {
          p_user_id: body.userId,
          p_unit_id: body.unitId,
          p_status: "disabled",
          p_reason: "Rollback: pemulihan akses Auth gagal.",
        });
        return jsonResponse({ error: "Akses akun tidak dapat dipulihkan." }, 503);
      }
    }

    return jsonResponse({ user_id: body.userId, status: body.status });
  } catch {
    return jsonResponse({ error: "Layanan pengelolaan akun tidak tersedia." }, 503);
  }
});