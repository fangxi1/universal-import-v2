"use client";

import { Button } from "@/components/ui/Button";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  compact?: boolean;
}

function EmptyIllustration({ compact }: { compact?: boolean }) {
  const size = compact ? 56 : 72;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden
      className="mx-auto"
    >
      <rect x="16" y="20" width="64" height="56" rx="4" fill="#f5f5f5" stroke="#d9d9d9" />
      <rect x="24" y="32" width="32" height="4" rx="2" fill="#e8e8e8" />
      <rect x="24" y="42" width="48" height="4" rx="2" fill="#e8e8e8" />
      <rect x="24" y="52" width="40" height="4" rx="2" fill="#e8e8e8" />
      <circle cx="72" cy="28" r="12" fill="var(--primary-light)" stroke="var(--primary-muted)" />
      <path
        d="M68 28h8M72 24v8"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center animate-fade-in ${
        compact ? "py-10 px-4" : "py-14 px-6"
      }`}
    >
      <div className="mb-4">
        {icon ? (
          <div
            className={`flex items-center justify-center rounded-lg bg-[var(--primary-light)] border border-[var(--primary-muted)] mx-auto ${
              compact ? "w-14 h-14 text-2xl" : "w-16 h-16 text-3xl"
            }`}
            aria-hidden
          >
            {icon}
          </div>
        ) : (
          <EmptyIllustration compact={compact} />
        )}
      </div>
      <p className="text-sm font-medium text-[var(--text)]">{title}</p>
      {description && (
        <p className="text-xs text-[var(--text-muted)] mt-2 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <Button variant="primary" size="sm" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
