"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Menu, ShieldCheck, X, ChevronDown, LogOut, UserRound, BriefcaseBusiness } from "lucide-react";
import { roleLabels, type AccountRole, type EffectiveRole } from "@/lib/auth/roles";
import { getNavigation, type SectionKey } from "@/lib/gateops/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LocationTracker } from "@/components/workspace/location-tracker";

type Unit = { id: string; name: string };
type Assignment = { id: string; unit_id: string; post_id: string; ends_at: string } | null;
export type BrandingConfig = {
  name: string;
  tagline: string;
  copyright: string;
  accentColor: string;
  whiteLabelEnabled: boolean;
  showGateopsBrand: boolean;
};
type WorkspaceContextValue = { unitId: string; unitName: string; units: Unit[]; userId: string; accountRole: AccountRole; effectiveRole: EffectiveRole; displayName: string; activeAssignment: Assignment; branding: BrandingConfig };

const defaultBranding: BrandingConfig = {
  name: "",
  tagline: "White Label Platform",
  copyright: "© 2026 GateOps",
  accentColor: "#d8ed6a",
  whiteLabelEnabled: true,
  showGateopsBrand: true,
};

function resolveBranding(unitName: string, rows: Array<{ setting_key: string; setting_value: unknown }>): BrandingConfig {
  const settings = new Map<string, unknown>();
  rows.forEach((row) => settings.set(row.setting_key, row.setting_value));

  const nameValue = typeof settings.get("unit.brand.name") === "string" ? String(settings.get("unit.brand.name")) : unitName;
  const taglineValue = typeof settings.get("unit.brand.tagline") === "string" ? String(settings.get("unit.brand.tagline")) : defaultBranding.tagline;
  const copyrightValue = typeof settings.get("unit.brand.copyright") === "string" ? String(settings.get("unit.brand.copyright")) : defaultBranding.copyright;
  const accentSetting = settings.get("unit.brand.accent_color");
  const accentValue = typeof accentSetting === "string" && /^#[0-9a-fA-F]{6}$/.test(accentSetting) ? accentSetting : defaultBranding.accentColor;
  const whiteLabelEnabledValue = typeof settings.get("unit.brand.white_label_enabled") === "boolean" ? Boolean(settings.get("unit.brand.white_label_enabled")) : defaultBranding.whiteLabelEnabled;
  const showGateopsBrandValue = typeof settings.get("unit.brand.show_gateops_brand") === "boolean" ? Boolean(settings.get("unit.brand.show_gateops_brand")) : defaultBranding.showGateopsBrand;

  return {
    name: nameValue || unitName || "GateOps",
    tagline: taglineValue || defaultBranding.tagline,
    copyright: copyrightValue || defaultBranding.copyright,
    accentColor: accentValue || defaultBranding.accentColor,
    whiteLabelEnabled: whiteLabelEnabledValue,
    showGateopsBrand: showGateopsBrandValue,
  };
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspaceContext() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace context is unavailable.");
  return value;
}

type Props = {
  accountRole: AccountRole;
  effectiveRole: EffectiveRole;
  displayName: string;
  userId: string;
  units: Unit[];
  activeAssignment: Assignment;
  children: ReactNode;
};

export function GateOpsShell({ accountRole, effectiveRole, displayName, userId, units, activeAssignment, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [navigationRole, setNavigationRole] = useState(effectiveRole);
  const [unitId, setUnitId] = useState(activeAssignment?.unit_id ?? units[0]?.id ?? "");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);
  const [branding, setBranding] = useState<BrandingConfig>(defaultBranding);
  const items = getNavigation(navigationRole);
  const unitName = units.find((unit) => unit.id === unitId)?.name ?? "Pilih satuan";
  const activeSection = pathname.split("/").at(-1) as SectionKey;
  const activeItem = items.find((item) => item.key === activeSection);
  const groups = [...new Set(items.map((item) => item.group))];

  useEffect(() => {
    if (!unitId) return;

    let active = true;
    const supabase = createSupabaseBrowserClient();
    const loadBranding = async () => {
      const { data, error } = await supabase.from("system_settings").select("setting_key, setting_value").eq("unit_id", unitId);
      if (!active) return;
      if (error) {
        setBranding(resolveBranding(unitName, []));
        return;
      }
      setBranding(resolveBranding(unitName, (data ?? []) as Array<{ setting_key: string; setting_value: unknown }>));
    };
    void loadBranding();
    window.addEventListener("gateops:branding-updated", loadBranding);

    return () => {
      active = false;
      window.removeEventListener("gateops:branding-updated", loadBranding);
    };
  }, [unitId, unitName]);

  const shellTheme = useMemo<CSSProperties>(() => ({
    ["--signal" as string]: branding.accentColor,
    ["--signal-deep" as string]: branding.accentColor,
    ["--brand-primary" as string]: branding.accentColor,
    ["--brand-primary-soft" as string]: `${branding.accentColor}22`,
  }), [branding.accentColor]);

  const brandDisplayName = branding.name || unitName || "GateOps";
  const headlineLabel = branding.whiteLabelEnabled || !branding.showGateopsBrand ? brandDisplayName : "GateOps";
  const footerLabel = branding.whiteLabelEnabled
    ? branding.showGateopsBrand ? `${brandDisplayName} • GATEOPS` : brandDisplayName
    : branding.showGateopsBrand ? "GATEOPS" : brandDisplayName;

  function navigateTo(section: SectionKey) {
    setDrawerOpen(false);
    setUnitMenuOpen(false);
    return `/app/${section}`;
  }

  return (
    <WorkspaceContext.Provider value={{ unitId, unitName, units, userId, accountRole, effectiveRole: navigationRole, displayName, activeAssignment, branding }}>
      <div className="app-frame" style={shellTheme}>
        <aside className={`app-sidebar${drawerOpen ? " sidebar-open" : ""}`} aria-label="Navigasi utama">
          <Link className="sidebar-brand" href="/app/dashboard" onClick={() => setDrawerOpen(false)}>
            <span className="brand-mark"><ShieldCheck size={21} /></span>
            {branding.whiteLabelEnabled || !branding.showGateopsBrand
              ? <span className="brand-name sidebar-custom-brand">{brandDisplayName}</span>
              : <span className="brand-name">GATE<span>OPS</span></span>}
            <span className="sidebar-version">OPS / 1.0</span>
          </Link>

          <div className="sidebar-role"><span className="role-indicator" /><span>{roleLabels[navigationRole]}</span></div>

          <div className="unit-brand-panel" aria-label="Branding satuan">
            <div className="unit-brand-mark"><ShieldCheck size={16} /></div>
            <div className="unit-brand-copy">
              <strong>{brandDisplayName}</strong>
              <span>{branding.tagline}</span>
            </div>
            {branding.showGateopsBrand && <span className="brand-badge">GateOps</span>}
          </div>

          <nav className="sidebar-nav">
            {groups.map((group) => (
              <div className="nav-group" key={group}>
                <p className="nav-group-label">{group}</p>
                {items.filter((item) => item.group === group).map((item) => {
                  const Icon = item.icon;
                  const active = activeSection === item.key;
                  return (
                    <Link
                      key={item.key}
                      href={navigateTo(item.key)}
                      onClick={() => setDrawerOpen(false)}
                      className={`nav-link${active ? " active" : ""}`}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon size={17} strokeWidth={1.8} />
                      <span>{item.label}</span>
                      {active && <span className="nav-active-mark" />}
                    </Link>
                  );
                })}
              </div>
            ))}
            {activeAssignment && accountRole === "personnel" && (
              <button className="personnel-mode-link" onClick={() => {
                const nextRole = navigationRole === "temporary_guard" ? "personnel" : "temporary_guard";
                setNavigationRole(nextRole);
                setDrawerOpen(false);
                router.push("/app/dashboard");
              }}>
                <UserRound size={16} /> {navigationRole === "temporary_guard" ? "Buka mode Personel" : "Kembali ke mode Jaga"}
              </button>
            )}
          </nav>

          <div className="sidebar-account">
            <div className="account-avatar">{displayName.slice(0, 1).toUpperCase()}</div>
            <div className="account-meta"><strong>{displayName}</strong><span>{roleLabels[accountRole]}</span></div>
            <form action="/api/auth/logout" method="post">
              <button className="icon-button sidebar-logout" type="submit" title="Keluar" aria-label="Keluar"><LogOut size={17} /></button>
            </form>
          </div>
        </aside>

        {drawerOpen && <button className="drawer-scrim" onClick={() => setDrawerOpen(false)} aria-label="Tutup navigasi" />}

        <div className="app-main-column">
          <header className="app-topbar">
            <button className="icon-button menu-toggle" onClick={() => setDrawerOpen(true)} aria-label="Buka navigasi"><Menu size={20} /></button>
            <div className="breadcrumb"><span>{branding.showGateopsBrand ? "GATEOPS" : headlineLabel}</span><b>/</b><strong>{activeItem?.label ?? "Ruang kerja"}</strong></div>
            <div className="topbar-actions">
              {units.length > 0 && (
                <div className="unit-switcher">
                  <button className="unit-switch-button" onClick={() => setUnitMenuOpen(!unitMenuOpen)} aria-expanded={unitMenuOpen}>
                    <span className="unit-switch-mark"><BriefcaseBusiness size={15} /></span><span>{unitName}</span><ChevronDown size={14} />
                  </button>
                  {unitMenuOpen && <div className="unit-menu" role="listbox" aria-label="Pilih satuan">
                    {units.map((unit) => <button key={unit.id} role="option" aria-selected={unit.id === unitId} onClick={() => { setUnitId(unit.id); setUnitMenuOpen(false); }}>{unit.name}</button>)}
                  </div>}
                </div>
              )}
              <span className="topbar-status"><i /> SESI AKTIF</span>
              <LocationTracker accountRole={accountRole} userId={userId} />
              <form className="mobile-logout" action="/api/auth/logout" method="post"><button className="icon-button" type="submit" aria-label="Keluar"><LogOut size={18} /></button></form>
            </div>
          </header>

          <main className="app-content" key={pathname}>{children}</main>
          <footer className="app-footer"><span>{footerLabel} <b>·</b> {branding.copyright}</span><span>{activeAssignment ? `TUGAS AKTIF HINGGA ${new Date(activeAssignment.ends_at).toLocaleString("id-ID")}` : "AKSES TERVERIFIKASI"}</span></footer>
        </div>

        <nav className="mobile-bottom-nav" aria-label="Navigasi cepat">
          {items.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.key;
            return <Link key={item.key} href={navigateTo(item.key)} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><Icon size={19} /><span>{item.label}</span></Link>;
          })}
          <button onClick={() => setDrawerOpen(true)}><Menu size={19} /><span>Menu</span></button>
        </nav>

        {drawerOpen && <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Tutup"><X size={20} /></button>}
      </div>
    </WorkspaceContext.Provider>
  );
}