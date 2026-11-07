import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { ShieldCheck } from "lucide-react";
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
      <section className="login-aside" aria-labelledby="brand-title">
        <div className="aside-topline">
          <span className="brand-mark"><ShieldCheck size={23} strokeWidth={1.8} /></span>
          <span className="brand-name">GATE<span>OPS</span></span>
          <span className="baseline-tag">BASELINE 1.0</span>
        </div>

        <div className="aside-copy">
          <p className="eyebrow">SISTEM TERINTEGRASI</p>
          <h1 id="brand-title">Satu sistem.<br /><span>Gerbang yang</span><br />terkendali.</h1>
          <p className="aside-description">
            Izin, pergerakan, pengawasan, dan penjagaan dalam satu pusat data.
          </p>
        </div>

        <div className="aside-bottom">
          <div className="signal-line"><span /> SISTEM OPERASIONAL TEROTORISASI</div>
          <span className="aside-version">GATEOPS / FONDASI APLIKASI</span>
        </div>
      </section>

      <section className="login-main" aria-labelledby="login-title">
        <div className="login-main-inner">
          <div className="mobile-brand">
            <span className="brand-mark"><ShieldCheck size={21} /></span>
            <span className="brand-name">GATE<span>OPS</span></span>
          </div>
          <div className="login-heading">
            <p className="eyebrow">AKSES AKUN</p>
            <h2 id="login-title">Masuk ke GateOps</h2>
            <p>Gunakan identitas akun dan PIN Anda.</p>
          </div>

          <LoginForm />

          <div className="feature-grid" aria-label="Fitur utama GateOps">
            <div className="feature-card">
              <span>Perjalanan</span>
              <strong>Rencana izin otomatis</strong>
            </div>
            <div className="feature-card">
              <span>Pengawasan</span>
              <strong>GPS & QR terintegrasi</strong>
            </div>
            <div className="feature-card">
              <span>Jaga</span>
              <strong>Undangan tugas aman</strong>
            </div>
            <div className="feature-card">
              <span>Audit</span>
              <strong>Catatan aktivitas lengkap</strong>
            </div>
          </div>

          <div className="role-note">
            <span className="role-note-rule" />
            <p>Petugas jaga sementara masuk menggunakan akun Personel dan undangan tugas yang sah.</p>
          </div>

          <footer className="login-footer">
            <span>GateOps · Baseline Utama v1.0</span>
            <span>AKSES TERBATAS</span>
          </footer>
        </div>
      </section>
    </main>
  );
}