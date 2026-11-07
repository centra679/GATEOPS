import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Redirect even when Supabase is unavailable; no session is trusted by the UI.
  }

  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}