import { redirect } from "next/navigation";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/app/dashboard");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
  }

  return (
    <main className="login-page">
      <div className="login-shell">
        <header className="login-brand">
          <span className="brand-mark" aria-hidden="true">
            <ShieldCheck size={24} strokeWidth={1.8} />
          </span>
          <div>
            <span className="brand-name">GATE<span>OPS</span></span>
            <span className="brand-caption">SISTEM OPERASIONAL TERPADU</span>
          </div>
        </header>

        <section className="login-card" aria-labelledby="login-title">
          <div className="login-heading">
            <p className="eyebrow">PORTAL AKSES</p>
            <h1 id="login-title">Masuk ke GateOps</h1>
            <p>Satu pintu masuk untuk seluruh pengguna. Masukkan identitas dan PIN akun Anda.</p>
          </div>

          <LoginForm />

          <div className="login-security-note">
            <LockKeyhole size={16} aria-hidden="true" />
            <p>Akses terlindungi. Jangan bagikan PIN Anda kepada siapa pun.</p>
          </div>
        </section>

        <footer className="login-footer">
          <span>GateOps · Baseline Utama v1.0</span>
          <span><i /> AKSES TERBATAS</span>
        </footer>
      </div>
    </main>
  );
}
