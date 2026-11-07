"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import type { DataRow } from "@/components/workspace/data-display";

type Location = DataRow & {
  user_id?: string;
  display_name?: string | null;
  account_role?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_meters?: number | null;
  received_at?: string | null;
  location_status?: string;
  destination?: string;
};

export function LiveLocationMap({ locations }: { locations: Location[] }) {
  const plotted = locations.filter((location) => typeof location.latitude === "number" && typeof location.longitude === "number");
  const center: LatLngExpression = plotted.length
    ? [plotted[0].latitude!, plotted[0].longitude!]
    : [-2.5, 118];

  return (
    <div className="live-map" aria-label="Peta lokasi pengguna di luar">
      <MapContainer center={center} zoom={plotted.length ? 11 : 4} scrollWheelZoom className="live-map-canvas">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {plotted.map((location) => <CircleMarker
          key={String(location.user_id ?? location.movement_session_id)}
          center={[location.latitude!, location.longitude!]}
          radius={8}
          pathOptions={{ color: "#f5f6f1", weight: 3, fillColor: "#193b30", fillOpacity: 0.95 }}
        >
          <Popup>
            <strong>{location.display_name ?? "Pengguna"}</strong><br />
            {location.destination ?? "Tujuan tidak dicantumkan"}<br />
            {location.received_at ? new Date(location.received_at).toLocaleString("id-ID") : "Lokasi belum diterima"}<br />
            {typeof location.accuracy_meters === "number" ? `Akurasi ±${Math.round(location.accuracy_meters)} m` : "Akurasi tidak tersedia"}
          </Popup>
        </CircleMarker>)}
      </MapContainer>
      <div className="map-attribution-note">Peta © OpenStreetMap · koordinat mengikuti pembaruan terakhir perangkat</div>
    </div>
  );
}

type HistoryPoint = DataRow & {
  id?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  captured_at?: string | null;
  accuracy_meters?: number | null;
};

export function LocationHistoryMap({ points }: { points: HistoryPoint[] }) {
  const plotted = points.filter((point) => {
    const latitude = Number(point.latitude);
    const longitude = Number(point.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude);
  });
  if (!plotted.length) return <div className="map-empty">Belum ada koordinat untuk ditampilkan di peta.</div>;

  const positions = plotted.map((point) => [Number(point.latitude), Number(point.longitude)] as LatLngExpression);
  const start = plotted[0];
  const latest = plotted[plotted.length - 1];

  return <div className="live-map location-history-map" aria-label="Jejak riwayat GPS">
    <MapContainer center={positions[positions.length - 1]} zoom={13} scrollWheelZoom className="live-map-canvas">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitHistoryBounds positions={positions} />
      {positions.length > 1 && <Polyline positions={positions} pathOptions={{ color: "#193b30", weight: 4, opacity: 0.8 }} />}
      <CircleMarker center={positions[0]} radius={7} pathOptions={{ color: "#fff", weight: 2, fillColor: "#557c47", fillOpacity: 1 }}>
        <Popup>Titik awal · {start.captured_at ? new Date(start.captured_at).toLocaleString("id-ID") : "Waktu tidak tersedia"}</Popup>
      </CircleMarker>
      {plotted.length > 1 && <CircleMarker center={positions[positions.length - 1]} radius={8} pathOptions={{ color: "#fff", weight: 2, fillColor: "#b7443c", fillOpacity: 1 }}>
        <Popup>Titik terakhir · {latest.captured_at ? new Date(latest.captured_at).toLocaleString("id-ID") : "Waktu tidak tersedia"}{typeof latest.accuracy_meters === "number" ? ` · Akurasi ±${Math.round(latest.accuracy_meters)} m` : ""}</Popup>
      </CircleMarker>}
    </MapContainer>
    <div className="map-attribution-note">Jejak GPS berdasarkan waktu pengambilan perangkat · Peta © OpenStreetMap</div>
  </div>;
}

function FitHistoryBounds({ positions }: { positions: LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) map.fitBounds(positions as LatLngBoundsExpression, { padding: [24, 24] });
    else map.setView(positions[0], 15);
  }, [map, positions]);
  return null;
}