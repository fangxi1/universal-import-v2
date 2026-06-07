import type { FilePreviewData, OrderRow, ParseRuleConfig } from "@/types";

const PREVIEW_KEY = "universal-import-preview";
const META_KEY = "universal-import-meta";
const DRAFT_KEY = "universal-import-draft";

export interface ImportMeta {
  fileName: string;
  ruleId?: string;
  ruleName?: string;
}

export interface PreviewDraft {
  rows: OrderRow[];
  meta: ImportMeta;
  updatedAt: number;
}

export function savePreviewData(rows: OrderRow[], meta: ImportMeta) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(rows));
  sessionStorage.setItem(META_KEY, JSON.stringify(meta));
}

/** 大列表不写 localStorage，避免阻塞主线程 */
const LARGE_DRAFT_ROWS = 500;

export function persistPreviewDraft(rows: OrderRow[], meta: ImportMeta) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(META_KEY, JSON.stringify(meta));
    if (rows.length <= LARGE_DRAFT_ROWS) {
      sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(rows));
    } else {
      sessionStorage.removeItem(PREVIEW_KEY);
    }
  } catch {
    /* session 满 */
  }
  if (rows.length > LARGE_DRAFT_ROWS) return;
  try {
    const draft: PreviewDraft = { rows, meta, updatedAt: Date.now() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* localStorage 满或不可用 */
  }
}

export function loadPreviewData(): { rows: OrderRow[]; meta: ImportMeta } | null {
  if (typeof window === "undefined") return null;

  const sessionRows = sessionStorage.getItem(PREVIEW_KEY);
  const sessionMeta = sessionStorage.getItem(META_KEY);
  if (sessionRows && sessionMeta) {
    try {
      return { rows: JSON.parse(sessionRows), meta: JSON.parse(sessionMeta) };
    } catch {
      /* fall through */
    }
  }

  return loadLocalDraft();
}

export function loadLocalDraft(): { rows: OrderRow[]; meta: ImportMeta } | null {
  if (typeof window === "undefined") return null;
  const str = localStorage.getItem(DRAFT_KEY);
  if (!str) return null;
  try {
    const draft = JSON.parse(str) as PreviewDraft;
    if (draft.rows?.length && draft.meta) {
      return { rows: draft.rows, meta: draft.meta };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function getDraftUpdatedAt(): number | null {
  if (typeof window === "undefined") return null;
  const str = localStorage.getItem(DRAFT_KEY);
  if (!str) return null;
  try {
    return (JSON.parse(str) as PreviewDraft).updatedAt ?? null;
  } catch {
    return null;
  }
}

export function clearPreviewData() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PREVIEW_KEY);
  sessionStorage.removeItem(META_KEY);
  localStorage.removeItem(DRAFT_KEY);
}

export function saveFilePreview(data: FilePreviewData) {
  if (typeof window === "undefined") return;
  const slim = slimFilePreview(data);
  try {
    sessionStorage.setItem(
      "universal-import-file-preview",
      JSON.stringify(slim)
    );
  } catch {
    /* 预览过大时跳过持久化，避免内存与序列化开销 */
  }
}

function slimFilePreview(data: FilePreviewData): FilePreviewData {
  if (!data.sheets?.length) return data;
  const totalRows = data.sheets.reduce((s, sh) => s + sh.rows.length, 0);
  if (totalRows <= 200) return data;
  return {
    sheets: data.sheets.map((s) => ({
      name: s.name,
      rows: s.rows.slice(0, 30),
    })),
  };
}

export function loadFilePreview(): FilePreviewData | null {
  if (typeof window === "undefined") return null;
  const str = sessionStorage.getItem("universal-import-file-preview");
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export function saveRuleConfigDraft(config: ParseRuleConfig) {
  sessionStorage.setItem("universal-import-rule-draft", JSON.stringify(config));
}

export function loadRuleConfigDraft(): ParseRuleConfig | null {
  if (typeof window === "undefined") return null;
  const str = sessionStorage.getItem("universal-import-rule-draft");
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export function hasRecoverableDraft(): boolean {
  return !!loadLocalDraft();
}
