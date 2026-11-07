"use client";

import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
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