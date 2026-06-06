import type { Metadata } from "next";
import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "万能导入 V2 - 鲸天智能多格式批量下单",
  description: "通过大模型 + 规则引擎实现任意格式出库单的智能解析与导入",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <AppShell>{children}</AppShell>
        <Toaster
          position="top-right"
          richColors
          closeButton
          expand={false}
          duration={3000}
          toastOptions={{
            classNames: {
              toast: "rounded-[var(--radius-md)]",
              title: "text-sm font-medium",
              description: "text-xs text-[var(--text-muted)]",
            },
          }}
        />
      </body>
    </html>
  );
}
