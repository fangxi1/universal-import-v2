"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImportDataEditor } from "@/components/import/ImportDataEditor";
import { LoadingState } from "@/components/ui/LoadingState";
import { loadPreviewData } from "@/lib/storage/session";

export default function PreviewPage() {
  const router = useRouter();
  const [data, setData] = useState<{
    rows: import("@/types").OrderRow[];
    meta: import("@/lib/storage/session").ImportMeta;
  } | null>(null);

  useEffect(() => {
    const loaded = loadPreviewData();
    if (!loaded) {
      router.replace("/import");
      return;
    }
    setData(loaded);
  }, [router]);

  if (!data) {
    return <LoadingState message="加载预览数据..." />;
  }

  return (
    <ImportDataEditor
      initialRows={data.rows}
      meta={data.meta}
      onBack={() => router.push("/import")}
    />
  );
}
