import type { FilePreviewData } from "@/types";
import { extractExcel } from "./file-extractor";
import { yieldToMain } from "@/lib/performance/timing";

let worker: Worker | null = null;

function getExcelWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (!worker) {
    worker = new Worker(new URL("@/workers/excel.worker.ts", import.meta.url));
  }
  return worker;
}

/** 在 Web Worker 中解析 Excel，避免阻塞 UI 主线程 */
export async function extractExcelAsync(
  buffer: ArrayBuffer,
  onProgress?: (percent: number, stage: string) => void
): Promise<FilePreviewData> {
  onProgress?.(10, "正在读取 Excel...");
  await yieldToMain();

  const w = getExcelWorker();
  if (!w) {
    onProgress?.(50, "主线程解析 Excel...");
    const result = await extractExcel(buffer.slice(0));
    onProgress?.(100, "Excel 读取完成");
    return result;
  }

  return new Promise((resolve, reject) => {
    const handleMessage = (event: MessageEvent<{ ok: boolean; sheets?: FilePreviewData["sheets"]; error?: string }>) => {
      w.removeEventListener("message", handleMessage);
      w.removeEventListener("error", handleError);
      if (event.data.ok && event.data.sheets) {
        onProgress?.(100, "Excel 读取完成");
        resolve({ sheets: event.data.sheets });
      } else {
        reject(new Error(event.data.error ?? "Excel 解析失败"));
      }
    };
    const handleError = () => {
      w.removeEventListener("message", handleMessage);
      w.removeEventListener("error", handleError);
      extractExcel(fallbackBuffer)
        .then(resolve)
        .catch(reject);
    };

    w.addEventListener("message", handleMessage);
    w.addEventListener("error", handleError);
    onProgress?.(40, "Worker 解析 Excel...");
    const fallbackBuffer = buffer.slice(0);
    w.postMessage({ buffer }, [buffer]);
  });
}

export function terminateExcelWorker() {
  worker?.terminate();
  worker = null;
}
