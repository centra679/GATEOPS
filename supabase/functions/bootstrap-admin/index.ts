import { createClient } from "npm:@supabase/supabase-js@2";
import { constantTimeEqual, getEnvironment, hmacHex, jsonResponse, readJsonBody } from "../_shared/security.ts";

type BootstrapBody = {
  nrp?: unknown;
  pin?: unknown;
  displayName?: unknown;
  unitName?: unknown;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method tidak diizinkan." }, 405);
  let body: BootstrapBody;
  try {
    const parsedBody = await readJsonBody(request);
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return jsonResponse({ error: "Permintaan tidak valid." }, 400);
    }
    body = parsedBody as BootstrapBody;
  } catch {
    return jsonResponse({ error: "Permintaan tidak valid." }, 400);
  }

  try {
    const [supabaseUrl, serviceRoleKey, lookupSecret, bootstrapSecret] = getEnvironment(
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "IDENTITY_LOOKUP_SECRET",
      "GATEOPS_BOOTSTRAP_SECRET",
    );
    if (lookupSecret.length < 32 || bootstrapSecret.length < 32) throw new Error("Bootstrap secrets are too short.");

    const suppliedSecret = request.headers.get("x-gateops-bootstrap-key") ?? "";
    if (!constantTimeEqual(suppliedSecret, bootstrapSecret)) {
      return jsonResponse({ error: "Akses bootstrap tidak valid." }, 401);
    }
    if (typeof body.nrp !== "string" || !/^\d{7}$/.test(body.nrp)
      || typeof body.pin !== "string" || !/^\d{6,72}$/.test(body.pin)
      || typeof body.displayName !== "string" || body.displayName.trim().length === 0
      || body.displayName.trim().length > 160
      || typeof body.unitName !== "string" || body.unitName.trim().length === 0
      || body.unitName.trim().length > 160
    ) {
      return jsonResponse({ error: "Data admin awal tidak valid." }, 400);
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
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
    if (createError || !createdUser.user) return jsonResponse({ error: "Bootstrap admin gagal." }, 409);

    const identifierHash = await hmacHex(lookupSecret, `identity:admin:${body.nrp}`);
    const { data: unitId, error: bootstrapError } = await service.rpc("bootstrap_first_admin", {
      p_user_id: newUserId,
      p_identifier: body.nrp,
      p_identifier_hash: identifierHash,
      p_auth_email: syntheticEmail,
      p_display_name: body.displayName.trim(),
      p_unit_name: body.unitName.trim(),
    });
    if (bootstrapError || !unitId) {
      await service.auth.admin.deleteUser(newUserId);
      return jsonResponse({ error: "Bootstrap admin sudah digunakan atau gagal." }, 409);
    }

    return jsonResponse({ created: true, unit_id: unitId }, 201);
  } catch {
    return jsonResponse({ error: "Layanan bootstrap tidak tersedia." }, 503);
  }
});