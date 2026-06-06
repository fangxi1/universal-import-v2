"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const NAV = [
  {
    href: "/import",
    label: "万能导入",
    tab: "万能导入",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    href: "/rules",
    label: "解析规则",
    tab: "解析规则",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
  {
    href: "/orders",
    label: "已导入运单",
    tab: "已导入运单",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
] as const;

function getActiveNav(pathname: string) {
  return NAV.find((item) => pathname.startsWith(item.href)) ?? NAV[0];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = getActiveNav(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const sidebarWidth = collapsed ? "var(--sidebar-collapsed-width)" : "var(--sidebar-width)";

  const sidebarContent = (
    <>
      <div className="h-12 flex items-center px-4 border-b border-white/10 shrink-0">
        {!collapsed && (
          <span className="text-xs text-[var(--text-inverse-muted)] truncate">
            智能导入模块
          </span>
        )}
      </div>
      <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
        {NAV.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`jingtian-sidebar-link ${isActive ? "active" : ""}`}
              onClick={closeMobile}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/10 shrink-0 hidden md:block">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center justify-center gap-2 h-8 rounded text-xs text-[var(--text-inverse-muted)] hover:bg-white/10 hover:text-white transition-colors"
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {!collapsed && <span>收起菜单</span>}
        </button>
      </div>
    </>
  );

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ ["--sidebar-current-width" as string]: sidebarWidth }}
    >
      {/* 顶栏 — 鲸天深色 teal */}
      <header className="jingtian-header sticky top-0 z-50 shrink-0">
        <div className="h-full px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="md:hidden p-1.5 rounded hover:bg-white/10 transition-colors"
              onClick={() => setMobileOpen(true)}
              aria-label="打开菜单"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 rounded bg-white/15 flex items-center justify-center text-white font-bold text-sm">
                鲸
              </div>
              <div className="leading-tight hidden sm:block">
                <span className="hidden lg:inline text-xs text-white/70 ml-2">
                  万能导入 V2
                </span>
              </div>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-1">
            {["首页", "应用中心", "报表中心", "系统管理"].map((mod) => (
              <span
                key={mod}
                className={`px-4 py-1 text-sm cursor-default ${
                  mod === "应用中心"
                    ? "text-white font-medium border-b-2 border-white/90"
                    : "text-white/65 hover:text-white/90"
                }`}
              >
                {mod}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              className="p-1.5 rounded hover:bg-white/10 text-white/80 hover:text-white transition-colors hidden sm:flex"
              aria-label="搜索"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <button
              type="button"
              className="p-1.5 rounded hover:bg-white/10 text-white/80 hover:text-white transition-colors relative hidden sm:flex"
              aria-label="通知"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[var(--danger)] rounded-full" />
            </button>
            <div className="flex items-center gap-2 pl-2 border-l border-white/20">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs text-white">
                方
              </div>
              <span className="text-sm text-white/90 hidden sm:inline">方希</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* 桌面侧栏 */}
        <aside
          className="jingtian-sidebar hidden md:flex flex-col shrink-0 border-r border-black/20"
          style={{ width: sidebarWidth }}
        >
          {sidebarContent}
        </aside>

        {/* 移动侧栏 */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-40 sidebar-overlay md:hidden"
              onClick={closeMobile}
              aria-hidden
            />
            <aside
              className="jingtian-sidebar fixed left-0 top-[var(--header-height)] bottom-0 z-50 flex flex-col md:hidden sidebar-mobile-enter"
              style={{ width: "var(--sidebar-width)" }}
            >
              {sidebarContent}
            </aside>
          </>
        )}

        {/* 主区域 */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="jingtian-tabs shrink-0 px-2">
            <Link href={active.href} className="jingtian-tab active">
              {active.tab}
            </Link>
            {pathname.startsWith("/preview") && (
              <span className="jingtian-tab active">预览编辑</span>
            )}
          </div>

          <main className="jingtian-main flex-1 overflow-y-auto animate-fade-in">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
