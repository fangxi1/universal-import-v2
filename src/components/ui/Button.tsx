"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "save";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  /** 防重复点击间隔（毫秒），默认 500 */
  clickGuardMs?: number;
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  disabled,
  children,
  className = "",
  onClick,
  clickGuardMs = 500,
  ...props
}: ButtonProps) {
  const lastClickRef = useRef(0);

  const variants = {
    primary:
      "bg-[var(--primary)] text-white border border-[var(--primary)] hover:bg-[var(--primary-dark)] hover:border-[var(--primary-dark)] shadow-sm active:scale-[0.98]",
    save: "bg-[var(--primary)] text-white border border-[var(--primary)] hover:bg-[var(--primary-dark)] font-medium shadow-sm active:scale-[0.98]",
    secondary:
      "bg-white text-[var(--text)] border border-[#d9d9d9] hover:border-[var(--primary)] hover:text-[var(--primary)] active:scale-[0.98]",
    danger:
      "bg-[var(--danger)] text-white border border-[var(--danger)] hover:bg-[#ff7875] hover:border-[#ff7875] active:scale-[0.98]",
    ghost:
      "text-[var(--text-secondary)] border border-transparent hover:bg-[var(--primary-light)] hover:text-[var(--primary-darker)] active:scale-[0.98]",
  };

  const sizes = {
    sm: "px-3 h-7 text-xs rounded-[var(--radius-sm)]",
    md: "px-4 h-8 text-sm rounded-[var(--radius-sm)]",
    lg: "px-6 h-9 text-sm rounded-[var(--radius-sm)]",
  };

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (loading || disabled) return;
      const now = Date.now();
      if (now - lastClickRef.current < clickGuardMs) return;
      lastClickRef.current = now;
      onClick?.(e);
    },
    [clickGuardMs, disabled, loading, onClick]
  );

  return (
    <button
      {...props}
      onClick={handleClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 font-normal transition-all duration-150 touch-manipulation select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading && (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}

/** 鲸天风格统一 Toast */
export const appToast = {
  success: (msg: string) => toast.success(msg, { duration: 3000 }),
  error: (msg: string) => toast.error(msg, { duration: 4000 }),
  warning: (msg: string) => toast.warning(msg, { duration: 3500 }),
  info: (msg: string) => toast.info(msg, { duration: 3000 }),
};

export { toast };
