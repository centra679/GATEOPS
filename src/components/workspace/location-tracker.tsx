"use client";

import { useEffect, useState } from "react";
import { MapPin, MapPinOff } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AccountRole } from "@/lib/auth/roles";

export function LocationTracker({ accountRole, userId }: { accountRole: AccountRole; userId: string }) {
  const [supabase] = useState(createSupabaseBrowserClient);
  const [status, setStatus] = useState<"idle" | "active" | "unavailable" | "error" | "pending">("idle");

  useEffect(() => {
    if (accountRole === "admin") return;
    let disposed = false;
    let watchId: number | null = null;
    let watchedLocationSessionId: string | null = null;
    let lastCapturedAt = 0;
    let checking = false;
    let flushing = false;
    const pendingPoints: Array<{
      locationSessionId: string;
      requestId: string;
      latitude: number;
      longitude: number;
      accuracyMeters: number;
      capturedAt: string;
      deviceInfo: { source: string };
    }> = [];

    function stopWatching() {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      watchedLocationSessionId = null;
      pendingPoints.length = 0;
    }

    async function flushPendingPoints() {
      if (disposed || flushing || !navigator.onLine || !pendingPoints.length) return;
      flushing = true;
      try {
        while (!disposed && pendingPoints.length) {
          const point = pendingPoints[0];
          const { error } = await supabase.rpc("record_location_point", {
            p_location_session_id: point.locationSessionId,
            p_request_id: point.requestId,
            p_latitude: point.latitude,
            p_longitude: point.longitude,
            p_accuracy_meters: point.accuracyMeters,
            p_captured_at: point.capturedAt,
            p_device_info: point.deviceInfo,
          });
          if (error) {
            if (!disposed) setStatus(navigator.onLine ? "error" : "pending");
            return;
          }
          pendingPoints.shift();
        }
        if (!disposed) setStatus("active");
      } catch {
        if (!disposed) setStatus(navigator.onLine ? "error" : "pending");
      } finally {
        flushing = false;
      }
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
          stopWatching();
          if (!disposed) setStatus("unavailable");
          return;
        }
        if (watchId !== null && watchedLocationSessionId === locationSessionId) {
          void flushPendingPoints();
          return;
        }
        if (watchId !== null) stopWatching();

        setStatus("active");
        watchedLocationSessionId = locationSessionId;
        watchId = navigator.geolocation.watchPosition((position) => {
          if (disposed || watchedLocationSessionId !== locationSessionId || Date.now() - lastCapturedAt < 30_000) return;
          lastCapturedAt = Date.now();
          if (pendingPoints.length >= 20) pendingPoints.shift();
          pendingPoints.push({
            locationSessionId,
            requestId: crypto.randomUUID(),
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
            capturedAt: new Date(position.timestamp).toISOString(),
            deviceInfo: { source: "browser" },
          });
          if (!navigator.onLine) setStatus("pending");
          else void flushPendingPoints();
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
    const onOnline = () => { void flushPendingPoints(); refresh(); };
    const onOffline = () => { if (pendingPoints.length) setStatus("pending"); };
    void checkSession();
    const interval = window.setInterval(refresh, 15_000);
    window.addEventListener("gateops:movement-updated", refresh);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("gateops:movement-updated", refresh);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      stopWatching();
    };
  }, [supabase, accountRole, userId]);

  if (accountRole === "admin" || status === "idle") return null;
  const active = status === "active";
  const label = active ? "GPS AKTIF" : status === "unavailable" ? "GPS TIDAK TERSEDIA" : status === "pending" ? "GPS MENUNGGU KONEKSI" : "GPS TERTUNDA";
  return <span className={`topbar-status gps-status${active ? " gps-on" : " gps-off"}`} title="Pelacakan hanya berlangsung saat sesi perjalanan aktif"><i />{active ? <MapPin size={12} /> : <MapPinOff size={12} />}{label}</span>;
}