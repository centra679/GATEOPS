import { NextResponse, type NextRequest } from "next/server";
import { isAccountRole } from "@/lib/auth/roles";
import { readJsonBody } from "@/lib/http/json";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid atau terlalu besar." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const { role, identifier, pin } = body as Record<string, unknown>;
  if (
    !isAccountRole(role) ||
    typeof identifier !== "string" ||
    identifier.trim().length === 0 ||
    identifier.length > 64 ||
    typeof pin !== "string" ||
    !/^\d{6,72}$/.test(pin)
  ) {
    return NextResponse.json({ error: "Identitas atau PIN tidak valid." }, { status: 400 });
  }

  if (role === "admin" && !/^\d{7}$/.test(identifier)) {
    return NextResponse.json({ error: "Identitas atau PIN tidak valid." }, { status: 400 });
  }

  const resolverUrl = process.env.SUPABASE_AUTH_RESOLVER_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!resolverUrl || !anonKey || !supabaseUrl) {
    return NextResponse.json(
      { error: "Autentikasi belum dikonfigurasi oleh administrator sistem." },
      { status: 503 },
    );
  }

  try {
    const url = new URL(resolverUrl);
    const projectUrl = new URL(supabaseUrl);
    const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) ||
      url.origin !== projectUrl.origin ||
      url.pathname !== "/functions/v1/auth-nrp-pin" ||
      url.search !== "" ||
      url.hash !== "" ||
      url.username ||
      url.password
    ) {
      return NextResponse.json(
        { error: "URL layanan autentikasi tidak valid." },
        { status: 503 },
      );
    }
  } catch {
    return NextResponse.json({ error: "URL layanan autentikasi tidak valid." }, { status: 503 });
  }

  try {
    const resolverResponse = await fetch(resolverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ role, identifier: identifier.trim(), pin }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (resolverResponse.status === 429) {
      return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
    }
    if (!resolverResponse.ok) {
      return NextResponse.json({ error: "Identitas atau PIN tidak valid." }, { status: 401 });
    }

    const result: unknown = await resolverResponse.json();
    if (!result || typeof result !== "object") {
      return NextResponse.json({ error: "Layanan autentikasi belum siap." }, { status: 502 });
    }

    const { access_token, refresh_token } = result as Record<string, unknown>;
    if (typeof access_token !== "string" || typeof refresh_token !== "string") {
      return NextResponse.json({ error: "Layanan autentikasi belum siap." }, { status: 502 });
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) {
      return NextResponse.json({ error: "Identitas atau PIN tidak valid." }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Layanan autentikasi tidak dapat dijangkau." }, { status: 502 });
  }
}