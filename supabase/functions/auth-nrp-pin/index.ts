import { createClient } from "npm:@supabase/supabase-js@2";
import { getEnvironment, hmacHex, isAccountRole, jsonResponse, normalizeIdentifier, readJsonBody } from "../_shared/security.ts";

type LoginBody = { role?: unknown; identifier?: unknown; pin?: unknown };

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method tidak diizinkan." }, 405);
  let body: LoginBody;
  try {
    const parsedBody = await readJsonBody(request);
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return jsonResponse({ error: "Permintaan tidak valid." }, 400);
    }
    body = parsedBody as LoginBody;
  } catch {
    return jsonResponse({ error: "Permintaan tidak valid." }, 400);
  }

  if (!isAccountRole(body.role) || typeof body.identifier !== "string" || typeof body.pin !== "string") {
    return jsonResponse({ error: "Identitas atau PIN tidak valid." }, 400);
  }
  const role = body.role;
  const identifier = normalizeIdentifier(role, body.identifier);
  const pin = body.pin;
  const validIdentifier = role === "admin"
    ? /^\d{7}$/.test(identifier)
    : role === "personnel"
      ? /^\d{1,20}$/.test(identifier)
      : /^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(identifier);
  if (!validIdentifier || !/^\d{6,72}$/.test(pin)) {
    return jsonResponse({ error: "Identitas atau PIN tidak valid." }, 400);
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
    const auth = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const identityHash = await hmacHex(lookupSecret, `identity:${role}:${identifier}`);
    const clientIp = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip");
    const ipHash = clientIp ? await hmacHex(lookupSecret, `ip:${clientIp}`) : null;

    const { data: allowed, error: limitError } = await service.rpc("consume_auth_attempt", {
      p_identity_hash: identityHash,
      p_ip_hash: ipHash,
    });
    if (limitError) return jsonResponse({ error: "Layanan autentikasi tidak tersedia." }, 503);

    const { data: identity } = await service
      .from("auth_identities")
      .select("user_id, auth_email, account_role")
      .eq("account_role", role)
      .eq("identifier_hash", identityHash)
      .maybeSingle();

    if (!allowed) {
      await service.rpc("record_auth_event", {
        p_user_id: identity?.user_id ?? null,
        p_role: role,
        p_action: "login_rate_limited",
        p_ip_hash: ipHash,
      });
      return jsonResponse({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, 429);
    }

    const { data: authData, error: authError } = await auth.auth.signInWithPassword({
      email: identity?.auth_email ?? "invalid@auth.gateops.invalid",
      password: pin,
    });

    if (authError || !identity || !authData.user || !authData.session || authData.user.id !== identity.user_id) {
      await service.rpc("record_auth_event", {
        p_user_id: identity?.user_id ?? null,
        p_role: role,
        p_action: "login_failure",
        p_ip_hash: ipHash,
      });
      return jsonResponse({ error: "Identitas atau PIN tidak valid." }, 401);
    }

    const { data: profile } = await service
      .from("profiles")
      .select("id")
      .eq("id", identity.user_id)
      .eq("account_role", role)
      .eq("status", "active")
      .maybeSingle();
    const { data: memberships } = await service
      .from("unit_memberships")
      .select("unit_id")
      .eq("user_id", identity.user_id)
      .eq("status", "active");
    const { data: accountRecord } = role === "personnel"
      ? await service.from("personnel").select("id").eq("id", identity.user_id).maybeSingle()
      : role === "family"
        ? await service.from("family_accounts").select("id").eq("id", identity.user_id).maybeSingle()
        : { data: { id: identity.user_id } };

    if (!profile || !memberships?.length || !accountRecord) {
      await service.rpc("record_auth_event", {
        p_user_id: identity.user_id,
        p_role: role,
        p_action: "login_failure",
        p_ip_hash: ipHash,
      });
      return jsonResponse({ error: "Identitas atau PIN tidak valid." }, 401);
    }

    const { error: auditError } = await service.rpc("record_auth_event", {
      p_user_id: identity.user_id,
      p_role: role,
      p_action: "login_success",
      p_ip_hash: ipHash,
    });
    if (auditError) return jsonResponse({ error: "Layanan autentikasi tidak tersedia." }, 503);
    await service.rpc("clear_auth_attempt", { p_identity_hash: identityHash });

    return jsonResponse({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
    });
  } catch {
    return jsonResponse({ error: "Layanan autentikasi tidak tersedia." }, 503);
  }
});