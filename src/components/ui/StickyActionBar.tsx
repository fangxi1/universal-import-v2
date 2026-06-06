"use client";

interface StickyActionBarProps {
  children: React.ReactNode;
  left?: React.ReactNode;
}

export function StickyActionBar({ children, left }: StickyActionBarProps) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 md:left-[var(--sidebar-current-width,var(--sidebar-width))] z-40 bg-white/98 backdrop-blur-sm border-t border-[var(--border)] safe-bottom transition-[left] duration-200"
      style={{ boxShadow: "0 -2px 8px rgba(0, 0, 0, 0.06)" }}
    >
      <div className="max-w-full mx-auto px-4 sm:px-6 py-2.5 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0 text-xs text-[var(--text-muted)]">
          {left}
        </div>
        <div className="flex items-center gap-2 shrink-0 justify-end flex-wrap w-full sm:w-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
