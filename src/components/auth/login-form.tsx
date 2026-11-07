"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { accountRoles, roleLabels, type AccountRole } from "@/lib/auth/roles";

const identifierLabels: Record<AccountRole, string> = {
  admin: "NRP admin",
  personnel: "NRP",
  family: "Kode akun keluarga",
};

export function LoginForm() {
  const router = useRouter();
  const [role, setRole] = useState<AccountRole>("personnel");
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, identifier, pin }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? "Login belum dapat diproses.");
        return;
      }

      router.replace("/app");
      router.refresh();
    } catch {
      setError("Layanan tidak dapat dijangkau. Periksa koneksi Anda.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <fieldset className="role-picker">
        <legend>Jenis akun</legend>
        <div className="role-options">
          {accountRoles.map((option) => (
            <button
              key={option}
              type="button"
              className={`role-option${role === option ? " selected" : ""}`}
              aria-pressed={role === option}
              disabled={pending}
              onClick={() => {
                setRole(option);
                setError("");
              }}
            >
              {roleLabels[option]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="field-label" htmlFor="identifier">{identifierLabels[role]}</label>
      <input
        id="identifier"
        className="text-input"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={identifier}
        onChange={(event) => setIdentifier(event.target.value)}
        placeholder={role === "family" ? "Masukkan kode akun" : "Masukkan NRP"}
        required
        maxLength={64}
        disabled={pending}
        aria-invalid={Boolean(error)}
      />

      <div className="field-row">
        <label className="field-label" htmlFor="pin">PIN</label>
        <span className="field-hint">PIN akun Anda</span>
      </div>
      <input
        id="pin"
        className="text-input pin-input"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        value={pin}
        onChange={(event) => setPin(event.target.value)}
        placeholder="Masukkan PIN"
        required
        minLength={6}
        maxLength={72}
        pattern="[0-9]{6,72}"
        disabled={pending}
        aria-invalid={Boolean(error)}
      />

      {error && <p className="form-error" role="alert" aria-live="polite">{error}</p>}

      <button className="submit-button" type="submit" disabled={pending}>
        {pending ? <><LoaderCircle className="spin" size={17} /> Memverifikasi...</> : <>Masuk <ArrowRight size={17} /></>}
      </button>
    </form>
  );
}