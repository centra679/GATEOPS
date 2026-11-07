import { createClient } from "npm:@supabase/supabase-js@2";
import { getEnvironment, hmacHex, isUuid, jsonResponse, readJsonBody } from "../_shared/security.ts";

type ManagePersonnelBody = {
  userId?: unknown;
  unitId?: unknown;
  nrp?: unknown;
  displayName?: unknown;
  rank?: unknown;
  position?: unknown;
  reason?: unknown;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method tidak diizinkan." }, 405);
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return jsonResponse({ error: "Akses tidak diizinkan." }, 401);

  let body: ManagePersonnelBody;
  try {
    const parsedBody = await readJsonBody(request);
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return jsonResponse({ error: "Permintaan tidak valid." }, 400);
    }
    body = parsedBody as ManagePersonnelBody;
  } catch {
    return jsonResponse({ error: "Permintaan tidak valid." }, 400);
  }

  if (!isUuid(body.userId) || !isUuid(body.unitId)
    || typeof body.nrp !== "string" || !/^[0-9]{1,20}$/.test(body.nrp.trim())
    || typeof body.displayName !== "string" || !body.displayName.trim() || body.displayName.trim().length > 160
    || (body.rank !== undefined && body.rank !== null && (typeof body.rank !== "string" || body.rank.length > 80))
    || (body.position !== undefined && body.position !== null && (typeof body.position !== "string" || body.position.length > 120))
    || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 1000
  ) {
    return jsonResponse({ error: "Data perubahan personel tidak valid." }, 400);
  }

  try {
    const [supabaseUrl, anonKey, serviceRoleKey, lookupSecret] = getEnvironment(
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "IDENTITY_LOOKUP_SECRET",
    );
    if (lookupSecret.length < 32) throw new Error("Identity lookup secret is too short.");

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const caller = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: { user: actor }, error: actorError } = await caller.auth.getUser(bearer);
    if (actorError || !actor) return jsonResponse({ error: "Sesi admin tidak valid." }, 401);

    const { data: actorProfile } = await service.from("profiles")
      .select("id,account_role,status").eq("id", actor.id).maybeSingle();
    const { data: membership } = await service.from("unit_memberships")
      .select("id").eq("user_id", actor.id).eq("unit_id", body.unitId).eq("status", "active").maybeSingle();
    if (!actorProfile || actorProfile.account_role !== "admin" || actorProfile.status !== "active" || !membership) {
      return jsonResponse({ error: "Admin tidak berwenang pada satuan ini." }, 403);
    }

    const identifierHash = await hmacHex(lookupSecret, `identity:personnel:${body.nrp.trim()}`);
    const { error } = await service.rpc("admin_update_personnel", {
      p_actor_user_id: actor.id,
      p_unit_id: body.unitId,
      p_personnel_user_id: body.userId,
      p_nrp: body.nrp.trim(),
      p_identifier_hash: identifierHash,
      p_display_name: body.displayName.trim(),
      p_rank: typeof body.rank === "string" ? body.rank.trim() : null,
      p_position: typeof body.position === "string" ? body.position.trim() : null,
      p_reason: body.reason.trim(),
    });
    if (error) return jsonResponse({ error: "Data personel tidak dapat diperbarui. Periksa NRP duplikat atau cakupan satuan." }, 409);
    return jsonResponse({ user_id: body.userId, unit_id: body.unitId });
  } catch {
    return jsonResponse({ error: "Layanan pengelolaan personel tidak tersedia." }, 503);
  }
});