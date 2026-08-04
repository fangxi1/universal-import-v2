export function getImportBatchSize(): number {
  const n = parseInt(process.env.IMPORT_BATCH_SIZE || "1000", 10);
  return Number.isFinite(n) && n > 0 ? n : 1000;
}

export function getWorkerConcurrency(): number {
  const n = parseInt(process.env.IMPORT_WORKER_CONCURRENCY || "3", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 3;
}

export function getSkuValidateTimeoutMs(): number {
  const n = parseInt(process.env.SKU_VALIDATE_TIMEOUT_MS || "3000", 10);
  return Number.isFinite(n) && n > 0 ? n : 3000;
}

export function getStaleBatchMinutes(): number {
  const n = parseInt(process.env.IMPORT_STALE_BATCH_MINUTES || "5", 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

export function getAppBaseUrl(reqUrl?: string): string {
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL?.trim()) {
    return `https://${process.env.VERCEL_URL.trim().replace(/\/$/, "")}`;
  }
  if (reqUrl) {
    try {
      return new URL(reqUrl).origin;
    } catch {
      /* ignore */
    }
  }
  return "http://localhost:3000";
}

export function getCronSecret(): string {
  return (process.env.CRON_SECRET || "local-dev-cron-secret").trim();
}
