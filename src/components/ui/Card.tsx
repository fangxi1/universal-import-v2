export function Card({
  children,
  className = "",
  title,
  extra,
  noPadding,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  extra?: React.ReactNode;
  noPadding?: boolean;
}) {
  return (
    <div className={`card-surface overflow-hidden ${className}`}>
      {(title || extra) && (
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-[var(--border-light)] bg-[#fafafa]">
          {title && (
            <h2 className="text-sm font-semibold text-[var(--text)] shrink-0">
              {title}
            </h2>
          )}
          {extra && <div className="shrink-0 flex flex-wrap gap-2">{extra}</div>}
        </div>
      )}
      <div className={noPadding ? "" : "p-4 sm:p-6"}>{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  extra,
}: {
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4 animate-fade-in">
      <div className="page-title-bar min-w-0">
        <h1 className="text-lg sm:text-xl font-semibold text-[var(--text)]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-[var(--text-muted)] mt-1 leading-relaxed max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
      {extra && (
        <div className="flex flex-wrap gap-2 shrink-0">{extra}</div>
      )}
    </div>
  );
}

export function StatCard({
  label,
  value,
  color,
  accent,
}: {
  label: string;
  value: string | number;
  color?: string;
  accent?: "primary" | "success" | "warning" | "danger";
}) {
  const accentColors = {
    primary: "var(--primary)",
    success: "var(--success)",
    warning: "var(--warning)",
    danger: "var(--danger)",
  };

  return (
    <div className="card-surface p-4 flex-1 min-w-[120px] relative overflow-hidden">
      <div
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{
          background: accent ? accentColors[accent] : "var(--primary)",
        }}
      />
      <p className="text-xs text-[var(--text-muted)] mb-2">{label}</p>
      <p
        className="text-2xl font-semibold tabular-nums leading-none"
        style={{ color: color ?? "var(--text)" }}
      >
        {value}
      </p>
    </div>
  );
}
