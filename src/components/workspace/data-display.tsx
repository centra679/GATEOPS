import { AlertCircle, Database, LoaderCircle, type LucideIcon } from "lucide-react";

export type DataRow = Record<string, unknown>;
export type DataColumn = { key: string; label: string; format?: (value: unknown, row: DataRow) => React.ReactNode };

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="section-description">{description}</p>}
      </div>
      {action && <div className="section-heading-action">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Memuat data..." }: { label?: string }) {
  return <div className="data-state loading-state" role="status"><LoaderCircle className="spin" size={19} /><span>{label}</span></div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="data-state error-state" role="alert">
      <AlertCircle size={19} />
      <div><strong>Data tidak dapat dimuat</strong><p>{message}</p></div>
      {onRetry && <button className="text-action" onClick={onRetry}>Coba lagi</button>}
    </div>
  );
}

export function EmptyState({ title, description, icon: Icon = Database }: { title: string; description: string; icon?: LucideIcon }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={20} /></span><strong>{title}</strong><p>{description}</p></div>;
}

export function Panel({ title, description, action, children, className = "" }: { title?: string; description?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`workspace-panel ${className}`}>
      {(title || action) && <header className="panel-heading"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{action}</header>}
      {children}
    </section>
  );
}

export function MetricGrid({ metrics }: { metrics: Array<{ label: string; value: string | number; detail?: string; tone?: "green" | "lime" | "amber" | "red" }> }) {
  return <div className="metric-grid">{metrics.map((metric) => <article className={`metric-card tone-${metric.tone ?? "green"}`} key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong>{metric.detail && <small>{metric.detail}</small>}</article>)}</div>;
}

export function DataTable({ rows, columns, emptyTitle = "Belum ada data", emptyDescription = "Data dari database akan muncul di sini.", renderActions }: { rows: DataRow[]; columns: DataColumn[]; emptyTitle?: string; emptyDescription?: string; renderActions?: (row: DataRow) => React.ReactNode }) {
  if (!rows.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}{renderActions && <th>Aksi</th>}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={String(row.id ?? row.request_id ?? rowIndex)}>{columns.map((column) => {
          const value = row[column.key];
          return <td key={column.key}>{column.format ? column.format(value, row) : <CellValue value={value} field={column.key} />}</td>;
        })}{renderActions && <td className="row-actions-cell">{renderActions(row)}</td>}</tr>)}</tbody>
      </table>
    </div>
  );
}

function CellValue({ value, field }: { value: unknown; field: string }) {
  if (value === null || value === undefined || value === "") return <span className="cell-muted">-</span>;
  if (typeof value === "boolean") return <StatusTag value={value ? "Aktif" : "Tidak aktif"} />;
  if (typeof value === "number") return new Intl.NumberFormat("id-ID").format(value);
  if (typeof value === "object") return <span className="cell-muted">Tersedia</span>;
  const text = String(value);
  if (field.includes("status")) return <StatusTag value={text} />;
  if (field.endsWith("_at") || field.endsWith("At")) {
    const date = new Date(text);
    if (!Number.isNaN(date.valueOf())) return date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
  }
  return <span className={field.endsWith("_id") ? "mono-cell" : undefined}>{text}</span>;
}

export function StatusTag({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = ["active", "aktif", "approved", "completed", "used", "selesai", "disetujui", "di luar", "kembali"].includes(normalized)
    ? "good"
    : ["disabled", "cancelled", "expired", "admin_closed", "nonaktif", "dibatalkan", "kedaluwarsa"].includes(normalized)
      ? "muted"
      : ["pending", "unavailable", "menunggu"].includes(normalized)
        ? "warning"
        : "neutral";
  return <span className={`status-tag status-${tone}`}><i />{value.replaceAll("_", " ")}</span>;
}

export function Toast({ message, tone = "success", onClose }: { message: string; tone?: "success" | "error"; onClose: () => void }) {
  return <div className={`workspace-toast toast-${tone}`} role={tone === "error" ? "alert" : "status"}><span>{message}</span><button onClick={onClose} aria-label="Tutup pemberitahuan">×</button></div>;
}