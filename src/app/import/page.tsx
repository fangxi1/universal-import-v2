"use client";

import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { Button, toast } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import {
  FileInfoCard,
  ImportFlowSteps,
  ParseFailurePanel,
  type ImportFlowStep,
} from "@/components/import/ImportFlowSteps";
import { RuleEditor, RuleListItem } from "@/components/rules/RuleEditor";
import { ImportDataEditor } from "@/components/import/ImportDataEditor";
import { extractFile, getFileExtension } from "@/lib/engine/file-extractor";
import {
  buildFileMeta,
  estimateDataRows,
  type FileMeta,
} from "@/lib/engine/import-utils";
import { executeRuleEngineAsync } from "@/lib/engine/rule-engine";
import { sanitizeCardTransferRuleConfig, detectCardTransferSheet } from "@/lib/engine/card-transfer-rule";
import {
  detectGroupByDeliverySheet,
  sanitizeGroupByDeliveryRuleConfig,
} from "@/lib/engine/group-by-delivery-rule";
import {
  detectShippingDeliverySheet,
  sanitizeShippingDeliveryRuleConfig,
} from "@/lib/engine/shipping-delivery-rule";
import {
  detectStoreSkuMatrixSheet,
  sanitizeStoreMatrixRuleConfig,
} from "@/lib/engine/store-matrix-rule";
import { sanitizePdfRuleConfig } from "@/lib/engine/pdf-delivery-rule";
import { PerfTimer, type ImportPerfMetrics } from "@/lib/performance/timing";
import {
  hasRecoverableDraft,
  loadPreviewData,
  saveFilePreview,
} from "@/lib/storage/session";
import type {
  AiGeneratedRule,
  FilePreviewData,
  OrderRow,
  ParseProgress,
  ParseRuleConfig,
  ParseRuleRecord,
} from "@/types";
import type { ImportMeta } from "@/lib/storage/session";
import { ruleNameFromFileName } from "@/lib/rules/rule-names";

type Step = "upload" | "selectRule" | "createRule" | "parsing" | "edit";

function stepToFlow(step: Step): ImportFlowStep {
  if (step === "upload") return "upload";
  if (step === "parsing") return "parse";
  if (step === "edit") return "edit";
  return "rule";
}

export default function ImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<FilePreviewData | null>(null);
  const [rules, setRules] = useState<ParseRuleRecord[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [aiResult, setAiResult] = useState<AiGeneratedRule | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [progress, setProgress] = useState<ParseProgress>({
    percent: 0,
    current: 0,
    total: 0,
    stage: "",
  });
  const [uploadProgress, setUploadProgress] = useState<ParseProgress>({
    percent: 0,
    current: 0,
    total: 1,
    stage: "",
  });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [failedFileMeta, setFailedFileMeta] = useState<FileMeta | null>(null);
  const [parsedRows, setParsedRows] = useState<OrderRow[]>([]);
  const [importMeta, setImportMeta] = useState<ImportMeta | null>(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [perfMetrics, setPerfMetrics] = useState<ImportPerfMetrics | null>(null);
  const perfTimerRef = useRef(new PerfTimer());
  const perfPartialRef = useRef({ uploadMs: 0, extractMs: 0, parseMs: 0 });

  const fileMeta = useMemo(
    () => (file ? buildFileMeta(file, previewData) : null),
    [file, previewData]
  );

  useEffect(() => {
    setShowDraftBanner(hasRecoverableDraft());
  }, []);

  const loadRules = useCallback(async () => {
    try {
      const res = await fetch("/api/rules");
      if (res.ok) {
        const data = await res.json();
        setRules(data);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadRules();
    fetch("/api/init-db", { method: "POST" }).catch(() => {});
  }, [loadRules]);

  const handleRenderMeasured = useCallback((renderMs: number) => {
    setPerfMetrics((prev) => {
      if (!prev || prev.renderMs != null) return prev;
      return {
        ...prev,
        renderMs,
        totalMs: prev.uploadMs + prev.extractMs + prev.parseMs + renderMs,
      };
    });
  }, []);

  const resetUpload = () => {
    setStep("upload");
    setFile(null);
    setPreviewData(null);
    setSelectedRuleId("");
    setParseError(null);
    setUploadError(null);
    setFailedFileMeta(null);
    setUploadProgress({ percent: 0, current: 0, total: 1, stage: "" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const processFile = async (f: File) => {
    const ext = getFileExtension(f.name);
    if (!ext) {
      toast.error("不支持的文件格式，请上传 .xlsx / .xls / .docx / .pdf");
      return;
    }

    if (f.size === 0) {
      toast.error("文件为空（0 字节），无法解析");
      return;
    }

    setLoading(true);
    setUploadError(null);
    setParseError(null);
    setFailedFileMeta(null);
    setPerfMetrics(null);
    perfTimerRef.current = new PerfTimer();
    perfPartialRef.current = { uploadMs: 0, extractMs: 0, parseMs: 0 };
    setFile(f);
    setUploadProgress({
      percent: 5,
      current: 0,
      total: 1,
      stage: "正在读取文件...",
    });

    try {
      let pdfText: string | undefined;
      perfTimerRef.current.mark("upload");
      if (ext === "pdf") {
        setUploadProgress((p) => ({
          ...p,
          percent: 20,
          stage: "正在提取 PDF 文本...",
        }));
        const form = new FormData();
        form.append("file", f);
        const res = await fetch("/api/extract-pdf", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error ?? "PDF 解析失败，可能是扫描件或加密文件");
        }
        pdfText = json.text;
      }

      setUploadProgress((p) => ({
        ...p,
        percent: ext === "pdf" ? 55 : 35,
        stage: "正在解析文件结构...",
      }));

      perfPartialRef.current.uploadMs = perfTimerRef.current.since("upload");
      perfTimerRef.current.mark("extract");

      const data = await extractFile(f, pdfText, (percent, stage) => {
        setUploadProgress((p) => ({
          ...p,
          percent: Math.max(p.percent, Math.min(95, percent)),
          stage,
        }));
      });

      perfPartialRef.current.extractMs = perfTimerRef.current.since("extract");

      setUploadProgress((p) => ({
        ...p,
        percent: 85,
        stage: "正在校验文件内容...",
      }));

      if (
        (!data.sheets?.length && !data.text) ||
        (data.sheets?.every((s) => s.rows.length === 0) && !data.text?.trim())
      ) {
        throw new Error("文件内容为空，请确认文件中包含有效数据");
      }

      setUploadProgress({
        percent: 100,
        current: 1,
        total: 1,
        stage: "读取完成",
      });

      setPreviewData(data);
      saveFilePreview(data);
      setStep("selectRule");
      toast.success(`文件「${f.name}」读取成功`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "文件读取失败";
      setUploadError(msg);
      setFailedFileMeta(buildFileMeta(f));
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (e.dataTransfer.files.length > 1) {
      toast.error("请一次只上传一个文件");
      return;
    }
    processFile(f);
  };

  const handleAiGenerate = async () => {
    if (!previewData || !file) return;
    setAiLoading(true);
    setParseError(null);
    try {
      const res = await fetch("/api/ai/generate-rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, previewData }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "AI 分析失败");
      setAiResult(json);
      setStep("createRule");
      toast.success(
        json.llmInvoked !== false
          ? "DeepSeek 大模型已分析文件并生成推荐规则，请确认推测项后保存"
          : "已生成推荐规则，请确认后保存"
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI 分析失败");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveRule = async (
    name: string,
    description: string,
    config: ParseRuleConfig
  ) => {
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, config }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "保存失败");
    await loadRules();
    setSelectedRuleId(json.id);
    setStep("selectRule");
    toast.success("规则已保存，请选择该规则后执行解析");
  };

  const handleParse = async () => {
    if (!previewData || !file) return;

    const rule = rules.find((r) => r.id === selectedRuleId);
    if (!rule) {
      toast.error("请先手动选择一条解析规则");
      return;
    }

    setParseError(null);
    setStep("parsing");
    const totalRows = estimateDataRows(previewData);
    setProgress({
      percent: 0,
      current: 0,
      total: totalRows,
      stage: "开始解析...",
    });

    try {
      perfTimerRef.current.mark("parse");
      let parseConfig = rule.config as ParseRuleConfig;
      if (previewData.text?.trim() && !previewData.sheets?.length) {
        parseConfig = sanitizePdfRuleConfig(parseConfig, previewData.text);
      } else if (previewData.sheets?.length && detectCardTransferSheet(previewData).isCard) {
        parseConfig = sanitizeCardTransferRuleConfig(parseConfig, previewData);
      } else if (previewData.sheets?.length && detectGroupByDeliverySheet(previewData).isGroupBy) {
        parseConfig = sanitizeGroupByDeliveryRuleConfig(parseConfig, previewData);
      } else if (previewData.sheets?.length && detectStoreSkuMatrixSheet(previewData).isMatrix) {
        parseConfig = sanitizeStoreMatrixRuleConfig(parseConfig, previewData);
      } else if (previewData.sheets?.length && detectShippingDeliverySheet(previewData).isShipping) {
        parseConfig = sanitizeShippingDeliveryRuleConfig(parseConfig, previewData);
      }
      const rows = await executeRuleEngineAsync(
        previewData,
        parseConfig,
        setProgress
      );
      perfPartialRef.current.parseMs = perfTimerRef.current.since("parse");

      if (rows.length === 0) {
        throw new Error("解析结果为空，请检查规则配置或新建规则");
      }

      const elapsed = (perfPartialRef.current.parseMs / 1000).toFixed(2);
      const meta: ImportMeta = {
        fileName: file.name,
        ruleId: rule.id,
        ruleName: rule.name,
      };
      setPerfMetrics({
        uploadMs: perfPartialRef.current.uploadMs,
        extractMs: perfPartialRef.current.extractMs,
        parseMs: perfPartialRef.current.parseMs,
        rowCount: rows.length,
      });
      startTransition(() => {
        setParsedRows(rows);
        setImportMeta(meta);
        setStep("edit");
      });

      toast.success(`解析完成 ${rows.length} 条（${elapsed}s），请手动修改后保存`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "解析失败";
      setParseError(msg);
      setFailedFileMeta(buildFileMeta(file, previewData));
      setStep("selectRule");
      toast.error(msg);
    }
  };

  return (
    <div className="page-stack animate-fade-in">
      <PageHeader
        title="万能导入"
        subtitle="上传出库单文件，手动选择或新建解析规则，执行智能解析"
      />

      <ImportFlowSteps current={stepToFlow(step)} />

      {step === "upload" && (
        <>
          {showDraftBanner && (
            <div className="mb-4 px-4 py-3 bg-[var(--primary-light)] border border-[var(--primary-muted)] rounded-[var(--radius-md)] flex items-center justify-between gap-3">
              <span className="text-sm text-[var(--primary-darker)]">
                检测到未入库的编辑暂存，可继续修改并保存
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const draft = loadPreviewData();
                  if (draft) {
                    setParsedRows(draft.rows);
                    setImportMeta(draft.meta);
                    setStep("edit");
                  }
                }}
              >
                继续编辑
              </Button>
            </div>
          )}
          <Card title="上传文件">
            <div
              className={`border-2 border-dashed rounded-[var(--radius-md)] p-8 sm:p-12 text-center transition-colors ${
                loading ? "cursor-wait" : "cursor-pointer"
              } ${
                dragOver
                  ? "border-[var(--primary)] bg-[var(--primary-light)]"
                  : "border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !loading && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.docx,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) processFile(f);
                }}
              />
              {loading ? (
                <div className="flex flex-col items-center gap-4 max-w-md mx-auto w-full py-6">
                  <div
                    className="w-9 h-9 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin"
                    role="status"
                    aria-label={uploadProgress.stage}
                  />
                  <ProgressBar
                    percent={uploadProgress.percent}
                    label={uploadProgress.stage}
                    detail={`${uploadProgress.percent}%`}
                  />
                </div>
              ) : (
                <>
                  <div className="text-4xl mb-3">📄</div>
                  <p className="text-base font-medium text-[var(--text)]">
                    拖拽文件到此处，或点击上传
                  </p>
                  <p className="text-sm text-[var(--text-muted)] mt-2">
                    支持 Excel (.xlsx/.xls)、Word (.docx)、PDF (.pdf)
                  </p>
                </>
              )}
            </div>

            {uploadError && failedFileMeta && (
              <div className="mt-4 space-y-3">
                <div className="alert-error px-4 py-3 text-sm">
                  <p className="text-sm text-red-700 font-medium">{uploadError}</p>
                </div>
                <FileInfoCard meta={failedFileMeta} />
                <Button
                  variant="secondary"
                  onClick={() => {
                    setUploadError(null);
                    setFailedFileMeta(null);
                    fileInputRef.current?.click();
                  }}
                >
                  重新选择文件
                </Button>
              </div>
            )}
          </Card>
        </>
      )}

      {(step === "selectRule" || step === "parsing") && file && fileMeta && (
        <>
          <Card
            title="已上传文件"
            extra={
              <button
                type="button"
                onClick={resetUpload}
                className="text-xs text-[var(--primary)] hover:underline"
              >
                重新上传
              </button>
            }
          >
            <FileInfoCard meta={fileMeta} />
          </Card>

          {step === "selectRule" && parseError && failedFileMeta && (
            <ParseFailurePanel
              message={parseError}
              fileMeta={failedFileMeta}
              onCreateRule={handleAiGenerate}
              onRetry={() => {
                setParseError(null);
                setSelectedRuleId("");
              }}
              onReupload={resetUpload}
              creating={aiLoading}
            />
          )}

          {step === "selectRule" && (
            <Card
              title="选择解析规则"
              extra={
                <Button
                  variant="secondary"
                  onClick={handleAiGenerate}
                  loading={aiLoading}
                >
                  + 新建规则
                </Button>
              }
            >
              <p className="text-xs text-[var(--text-muted)] mb-4 px-1">
                所有规则匹配均为手动操作，系统不会自动匹配。请从下方列表中选择已有规则，或点击「新建规则」由
                AI 分析文件后手动微调确认。
              </p>

              {rules.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-[var(--text-muted)] mb-4">
                    暂无解析规则，请点击「新建规则」由 AI 分析文件并生成
                  </p>
                  <Button onClick={handleAiGenerate} loading={aiLoading}>
                    新建规则（AI 辅助）
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 mb-4">
                  {rules.map((rule) => (
                    <RuleListItem
                      key={rule.id}
                      rule={rule}
                      selected={selectedRuleId === rule.id}
                      onSelect={() => {
                        setSelectedRuleId(rule.id);
                        setParseError(null);
                      }}
                      onCopy={async () => {
                        const res = await fetch("/api/rules", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            name: `${rule.name} (副本)`,
                            description: rule.description,
                            config: rule.config,
                          }),
                        });
                        if (res.ok) {
                          await loadRules();
                          toast.success("规则已复制");
                        }
                      }}
                      onDelete={async () => {
                        if (!confirm("确定删除该规则？")) return;
                        const res = await fetch(`/api/rules/${rule.id}`, {
                          method: "DELETE",
                        });
                        const json = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          toast.error(
                            (json as { error?: string }).error ?? "删除失败，请稍后重试"
                          );
                          return;
                        }
                        if (selectedRuleId === rule.id) {
                          setSelectedRuleId("");
                        }
                        await loadRules();
                        toast.success("已删除");
                      }}
                    />
                  ))}
                </div>
              )}

              <Button
                onClick={handleParse}
                disabled={!selectedRuleId}
                className="w-full sm:w-auto"
              >
                执行解析并编辑
              </Button>
            </Card>
          )}

          {step === "parsing" && (
            <Card title="正在解析">
              <ProgressBar
                percent={progress.percent}
                label={progress.stage}
                detail={`${progress.current}/${progress.total} 条 · ${progress.percent}%`}
              />
            </Card>
          )}
        </>
      )}

      {step === "createRule" && (
        <RuleEditor
          aiResult={aiResult}
          previewData={previewData}
          existingNames={rules.map((r) => r.name)}
          defaultNameBase={file ? ruleNameFromFileName(file.name) : undefined}
          onSave={handleSaveRule}
          onCancel={() => setStep("selectRule")}
        />
      )}

      {step === "edit" && importMeta && (
        <ImportDataEditor
          initialRows={parsedRows}
          meta={importMeta}
          perfMetrics={perfMetrics}
          onRenderMeasured={handleRenderMeasured}
          onBack={() => setStep("selectRule")}
          backLabel="返回重新解析"
        />
      )}
    </div>
  );
}
