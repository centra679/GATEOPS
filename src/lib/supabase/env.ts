function isSecureUrl(value: string) {
  try {
    const url = new URL(value);
    const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    return (url.protocol === "https:" || (url.protocol === "http:" && isLoopback)) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey || !isSecureUrl(url)) {
    throw new Error("Supabase belum dikonfigurasi. Periksa variabel environment.");
  }

  return { url, anonKey };
}