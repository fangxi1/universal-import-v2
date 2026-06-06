"use client";

interface LoadingStateProps {
  message?: string;
  size?: "sm" | "md" | "lg";
  inline?: boolean;
}

const SIZE_MAP = {
  sm: "w-5 h-5",
  md: "w-8 h-8",
  lg: "w-10 h-10",
};

export function LoadingState({
  message = "加载中...",
  size = "md",
  inline,
}: LoadingStateProps) {
  const spinner = (
    <div
      className={`${SIZE_MAP[size]} border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin shrink-0`}
      role="status"
      aria-label={message}
    />
  );

  if (inline) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]">
        {spinner}
        {message}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 animate-fade-in">
      {spinner}
      <p className="text-sm text-[var(--text-muted)] animate-pulse-soft">
        {message}
      </p>
    </div>
  );
}
