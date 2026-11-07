"use client";

import { useEffect, useState } from "react";
import { MapPin, MapPinOff } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AccountRole } from "@/lib/auth/roles";

export function LocationTracker({ accountRole, userId }: { accountRole: AccountRole; userId: string }) {
  const [supabase] = useState(createSupabaseBrowserClient);
  const [status, setStatus] = useState<"idle" | "active" | "unavailable" | "error">("idle");

  useEffect(() => {
    if (accountRole === "admin") return;
    let disposed = false;
    let watchId: number | null = null;
    let lastSentAt = 0;
    let checking = false;

    function stopWatching() {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }

    async function checkSession() {
      if (disposed || checking) return;
      checking = true;
      try {
        const { data, error } = await supabase.rpc("get_my_movement_status");
        if (error) throw error;
        const statusData = data && typeof data === "object" ? data as Record<string, unknown> : {};
        const activeSession = statusData.active_session && typeof statusData.active_session === "object"
          ? statusData.active_session as Record<string, unknown>
          : null;
        const locationSession = activeSession?.location && typeof activeSession.location === "object"
          ? activeSession.location as Record<string, unknown>
          : null;
        const locationSessionId = locationSession?.id;

        if (!activeSession || typeof locationSessionId !== "string") {
          stopWatching();
          if (!disposed) setStatus("idle");
          return;
        }
        if (!navigator.geolocation) {
          if (!disposed) setStatus("unavailable");
          return;
        }
        if (watchId !== null) return;

        setStatus("active");
        watchId = navigator.geolocation.watchPosition(async (position) => {
          if (disposed || Date.now() - lastSentAt < 30_000) return;
          lastSentAt = Date.now();
          const { error: pointError } = await supabase.rpc("record_location_point", {
            p_location_session_id: locationSessionId,
            p_request_id: crypto.randomUUID(),
            p_latitude: position.coords.latitude,
            p_longitude: position.coords.longitude,
            p_accuracy_meters: position.coords.accuracy,
            p_captured_at: new Date(position.timestamp).toISOString(),
            p_device_info: { source: "browser" },
          });
          if (!disposed && pointError) setStatus("error");
          else if (!disposed) setStatus("active");
        }, (geoError) => {
          if (disposed) return;
          if (geoError.code === geoError.PERMISSION_DENIED || geoError.code === geoError.POSITION_UNAVAILABLE) {
            setStatus("unavailable");
          } else {
            setStatus("error");
          }
        }, { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 });
      } catch {
        if (!disposed) setStatus("error");
      } finally {
        checking = false;
      }
    }

    const refresh = () => { void checkSession(); };
    void checkSession();
    const interval = window.setInterval(refresh, 15_000);
    window.addEventListener("gateops:movement-updated", refresh);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("gateops:movement-updated", refresh);
      stopWatching();
    };
  }, [supabase, accountRole, userId]);

  if (accountRole === "admin" || status === "idle") return null;
  const active = status === "active";
  const label = active ? "GPS AKTIF" : status === "unavailable" ? "GPS TIDAK TERSEDIA" : "GPS TERTUNDA";
  return <span className={`topbar-status gps-status${active ? " gps-on" : " gps-off"}`} title="Pelacakan hanya berlangsung saat sesi perjalanan aktif"><i />{active ? <MapPin size={12} /> : <MapPinOff size={12} />}{label}</span>;
}