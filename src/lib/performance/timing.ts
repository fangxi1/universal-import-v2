export interface ImportPerfMetrics {
  uploadMs: number;
  extractMs: number;
  parseMs: number;
  renderMs?: number;
  totalMs?: number;
  rowCount: number;
}

export class PerfTimer {
  private start = performance.now();
  private marks = new Map<string, number>();

  mark(label: string) {
    this.marks.set(label, performance.now());
  }

  since(label: string): number {
    const t = this.marks.get(label);
    return t != null ? performance.now() - t : 0;
  }

  elapsed(): number {
    return performance.now() - this.start;
  }
}

export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(() => resolve(), { timeout: 16 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export const PERF_THRESHOLDS = {
  totalImportSec: 10,
  renderSec: 3,
} as const;
