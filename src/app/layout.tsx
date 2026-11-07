import "@fontsource-variable/dm-sans";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GateOps",
  description: "Sistem izin, pergerakan, pengawasan, dan penjagaan.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}