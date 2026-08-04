import { Suspense } from "react";
import { LoadingState } from "@/components/ui/LoadingState";

export default function TracesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>;
}
