"use client";

interface ProgressBarProps {
  percent: number;
  label?: string;
  detail?: string;
}

export function ProgressBar({ percent, label, detail }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className="w-full animate-fade-in">
      {(label || detail) && (
        <div className="flex justify-between items-center gap-2 text-sm mb-2">
          <span className="text-[var(--text-secondary)] truncate">{label}</span>
          <span className="text-[var(--primary)] font-medium tabular-nums shrink-0">
            {detail ?? `${clamped}%`}
          </span>
        </div>
      )}
      <div className="h-2 bg-[#f5f5f5] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--primary)] rounded-full transition-all duration-300 ease-out"
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
