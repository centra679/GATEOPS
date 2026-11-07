import { createClient } from "npm:@supabase/supabase-js@2";
import { getEnvironment, hmacHex, isAccountRole, isUuid, jsonResponse, normalizeIdentifier, readJsonBody } from "../_shared/security.ts";

type ProvisionBody = {
  role?: unknown;
  identifier?: unknown;
  pin?: unknown;
  displayName?: unknown;
  unitId?: unknown;
  relatedPersonnelNrp?: unknown;
  rank?: unknown;
  position?: unknown;
  reason?: unknown;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method tidak diizinkan." }, 405);
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return jsonResponse({ error: "Akses tidak diizinkan." }, 401);

  let body: ProvisionBody;
  try {
    const parsedBody = await readJsonBody(request);
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return jsonResponse({ error: "Permintaan tidak valid." }, 400);
    }
    body = parsedBody as ProvisionBody;
  } catch {
    return jsonResponse({ error: "Permintaan tidak valid." }, 400);
  }

  if (!isAccountRole(body.role) || typeof body.identifier !== "string" || typeof body.pin !== "string"
    || typeof body.displayName !== "string" || !isUuid(body.unitId)
    || typeof body.reason !== "string" || body.reason.trim().length === 0
  ) {
    return jsonResponse({ error: "Data akun tidak valid." }, 400);
  }
  const role = body.role;
  const identifier = normalizeIdentifier(role, body.identifier);
  if (!/^\d{6,72}$/.test(body.pin) || body.displayName.trim().length > 160
    || (role === "admin" && !/^\d{7}$/.test(identifier))
    || (role === "personnel" && !/^\d{1,20}$/.test(identifier))
    || (role === "family" && !/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(identifier))
  ) {
    return jsonResponse({ error: "Data akun tidak valid." }, 400);
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
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: { user: actor }, error: actorError } = await userClient.auth.getUser(bearer);
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

    let relatedPersonnelId: string | null = null;
    if (role === "family") {
      if (typeof body.relatedPersonnelNrp !== "string" || !/^\d{1,20}$/.test(body.relatedPersonnelNrp.trim())) {
        return jsonResponse({ error: "NRP personel penghubung tidak valid." }, 400);
      }
      const { data: personnel } = await service
        .from("personnel")
        .select("id")
        .eq("nrp", body.relatedPersonnelNrp.trim())
        .maybeSingle();
      if (!personnel) return jsonResponse({ error: "Personel penghubung tidak ditemukan." }, 400);
      relatedPersonnelId = personnel.id;
    }

    const newUserId = crypto.randomUUID();
    const syntheticEmail = `${newUserId}@auth.gateops.invalid`;
    const { data: createdUser, error: createError } = await service.auth.admin.createUser({
      id: newUserId,
      email: syntheticEmail,
      password: body.pin,
      email_confirm: true,
      user_metadata: {},
      app_metadata: {},
    });
    if (createError || !createdUser.user) return jsonResponse({ error: "Akun tidak dapat dibuat." }, 409);

    const identifierHash = await hmacHex(lookupSecret, `identity:${role}:${identifier}`);
    const { error: provisionError } = await service.rpc("provision_account", {
      p_actor_user_id: actor.id,
      p_new_user_id: newUserId,
      p_role: role,
      p_identifier: identifier,
      p_identifier_hash: identifierHash,
      p_auth_email: syntheticEmail,
      p_display_name: body.displayName.trim(),
      p_unit_id: body.unitId,
      p_related_personnel_id: relatedPersonnelId,
      p_rank: typeof body.rank === "string" ? body.rank.trim() : null,
      p_position: typeof body.position === "string" ? body.position.trim() : null,
      p_reason: body.reason.trim(),
    });
    if (provisionError) {
      await service.auth.admin.deleteUser(newUserId);
      return jsonResponse({ error: "Akun tidak dapat diprovisikan. Periksa duplikasi atau data satuan." }, 409);
    }

    return jsonResponse({ user_id: newUserId, role, unit_id: body.unitId }, 201);
  } catch {
    return jsonResponse({ error: "Layanan provisioning tidak tersedia." }, 503);
  }
});