"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AiGeneratedRule, ParseRuleConfig, ParseRuleRecord } from "@/types";
import { Button, toast } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  detectPdfDeliveryTable,
  preparePdfTextForParsing,
  sanitizePdfRuleConfig,
} from "@/lib/engine/pdf-delivery-rule";
import { previewRuleOnSample } from "@/lib/engine/rule-engine";
import { validateRuleConfig } from "@/lib/engine/rule-validation";
import {
  normalizeRuleName,
  suggestUniqueRuleName,
} from "@/lib/rules/rule-names";
import type { FilePreviewData } from "@/types";
import type { OrderRow } from "@/types";

interface RuleEditorProps {
  initialName?: string;
  initialConfig?: ParseRuleConfig;
  aiResult?: AiGeneratedRule | null;
  previewData?: FilePreviewData | null;
  /** 编辑已有规则时传入，用于名称唯一性校验排除自身 */
  ruleId?: string;
  /** 已有规则名称列表，新建时自动生成不重复默认名 */
  existingNames?: string[];
  /** 新建规则默认名称前缀（如文件名） */
  defaultNameBase?: string;
  onSave: (name: string, description: string, config: ParseRuleConfig) => Promise<void>;
  onCancel?: () => void;
}

export function RuleEditor({
  initialName = "",
  initialConfig,
  aiResult,
  previewData,
  ruleId,
  existingNames = [],
  defaultNameBase,
  onSave,
  onCancel,
}: RuleEditorProps) {
  const isEditing = Boolean(ruleId);
  const takenNames = useMemo(
    () =>
      existingNames.filter((n) =>
        isEditing ? normalizeRuleName(n) !== normalizeRuleName(initialName) : true
      ),
    [existingNames, initialName, isEditing]
  );

  const [name, setName] = useState(initialName || "新解析规则");
  const [description, setDescription] = useState(
    aiResult?.analysis ?? initialConfig?.description ?? ""
  );
  const [configJson, setConfigJson] = useState(
    JSON.stringify(initialConfig ?? aiResult?.config ?? { fileTypes: ["xlsx"], steps: [] }, null, 2)
  );
  const [previewRows, setPreviewRows] = useState<OrderRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const autoNamedRef = useRef(false);
  const pdfPreparedText = useMemo(
    () =>
      previewData?.text?.trim()
        ? preparePdfTextForParsing(previewData.text)
        : "",
    [previewData?.text]
  );

  useEffect(() => {
    if (!previewData?.text?.trim() || !aiResult?.config) return;
    const isPdf =
      aiResult.config.fileTypes?.includes("pdf") ||
      Boolean(previewData.text && !previewData.sheets?.length);
    if (!isPdf) return;
    const sanitized = sanitizePdfRuleConfig(aiResult.config, previewData.text);
    setConfigJson(JSON.stringify(sanitized, null, 2));
  }, [aiResult?.config, previewData?.text, previewData?.sheets?.length]);

  useEffect(() => {
    if (isEditing) {
      setName(initialName || "新解析规则");
      autoNamedRef.current = false;
      return;
    }
    if (autoNamedRef.current) return;
    const base =
      defaultNameBase?.trim() ||
      (aiResult?.config.description
        ? aiResult.config.description.slice(0, 40)
        : "") ||
      "新解析规则";
    setName(suggestUniqueRuleName(base, takenNames));
    autoNamedRef.current = true;
  }, [
    isEditing,
    initialName,
    defaultNameBase,
    aiResult?.config.description,
    takenNames,
  ]);

  const nameConflict = takenNames.some(
    (n) => normalizeRuleName(n) === normalizeRuleName(name)
  );

  const parseConfig = useCallback((): ParseRuleConfig | null => {
    try {
      return JSON.parse(configJson) as ParseRuleConfig;
    } catch {
      toast.error("规则 JSON 格式错误");
      return null;
    }
  }, [configJson]);

  const handleTest = () => {
    if (!previewData) {
      toast.error("请先上传文件后再测试规则");
      return;
    }
    let config = parseConfig();
    if (!config) return;

    setTesting(true);
    try {
      const isPdfText =
        Boolean(previewData.text?.trim()) && !previewData.sheets?.length;
      if (isPdfText) {
        const sanitized = sanitizePdfRuleConfig(config, previewData.text);
        config = sanitized;
        if (JSON.stringify(sanitized) !== JSON.stringify(parseConfig())) {
          setConfigJson(JSON.stringify(config, null, 2));
        }
      }

      const warnings = validateRuleConfig(config);
      if (warnings.length) {
        toast.warning(warnings[0], { duration: 6000 });
      }

      const rows = previewRuleOnSample(previewData, config, 20);
      setPreviewRows(rows);
      if (rows.length === 0) {
        const detected = isPdfText
          ? detectPdfDeliveryTable(previewData.text!)
          : null;
        const zbwpHits = (previewData.text!.match(/ZBWP[\s-]*\d+/gi) ?? []).length;
        const hint =
          isPdfText && detected?.hasTable
            ? `试解析仍为空：预处理已识别 ${detected.zbwpRows} 条物品行，请刷新页面后重试（需最新部署）`
            : isPdfText && zbwpHits > 0
              ? `试解析仍为空：PDF 含 ${zbwpHits} 处 ZBWP 编码，预处理未还原为物品行。请 Ctrl+F5 强刷后重试，并对照下方预处理文本`
              : "试解析结果为空，请对照下方 PDF 原文检查规则配置";
        toast.warning(
          warnings.length > 1 ? `试解析为空：${warnings.slice(0, 2).join("；")}` : hint
        );
      } else {
        toast.success(`试解析成功，预览 ${rows.length} 条记录`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "试解析失败");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const config = parseConfig();
    if (!config) return;
    if (!name.trim()) {
      toast.error("请输入规则名称");
      return;
    }
    if (nameConflict) {
      toast.error(`规则名称「${name.trim()}」已存在，请更换名称`);
      return;
    }

    setSaving(true);
    try {
      await onSave(name.trim(), description, config);
      toast.success("规则保存成功");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const guessed = aiResult?.guessedMappings ?? [];

  return (
    <div className="page-stack animate-fade-in">
      {aiResult && (
        <div className="alert-success px-4 py-3">
          <p className="text-sm font-semibold mb-1">
            AI 分析结果
            <span className="ml-2 tag-primary font-normal">
              置信度：
              {aiResult.confidence === "high"
                ? "高"
                : aiResult.confidence === "medium"
                  ? "中"
                  : "低"}
            </span>
          </p>
          <p className="text-sm text-[var(--text-secondary)]">{aiResult.analysis}</p>
          {guessed.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {guessed.map((g) => (
                <span key={g} className="tag-warning">
                  推测: {g}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {previewData?.text && (
        <Card title="PDF 提取原文（预处理后，对照物品行）">
          <p className="text-xs text-[var(--text-muted)] mb-2">
            下方为<strong>自动预处理</strong>后的文本（编码合并、竖排合并、同行拆行）。
            物品行支持 7 列（序号/类别/编码/名称/规格/单位/数量）或 4 列（序号/类别/编码/名称/数量）。
          </p>
          <pre className="text-xs font-mono bg-[#fafafa] border border-[var(--border-light)] rounded-[var(--radius-sm)] p-3 max-h-48 overflow-auto whitespace-pre-wrap break-all">
            {pdfPreparedText.slice(0, 4000)}
            {pdfPreparedText.length > 4000 ? "\n\n…（已截断）" : ""}
          </pre>
        </Card>
      )}

      <Card title="规则配置">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">规则名称</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`form-input ${nameConflict ? "border-[var(--danger)]" : ""}`}
                placeholder="请输入唯一规则名称"
              />
              {nameConflict && (
                <p className="text-xs text-[var(--danger)] mt-1">
                  该名称已存在，请修改或使用系统自动生成的名称
                </p>
              )}
              {!isEditing && (
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  规则名称不可重复，已为您生成默认名称
                </p>
              )}
            </div>
            <div>
              <label className="form-label">描述</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="form-input"
                placeholder="规则用途说明"
              />
            </div>
          </div>

          <div>
            <label className="form-label">规则 JSON（可手动编辑微调）</label>
            <textarea
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              rows={16}
              className="form-input font-mono text-xs resize-y min-h-[240px]"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleTest} loading={testing} variant="secondary">
              试解析预览
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={nameConflict}>
              保存规则
            </Button>
            {onCancel && (
              <Button onClick={onCancel} variant="ghost">
                取消
              </Button>
            )}
          </div>
        </div>
      </Card>

      {previewRows.length > 0 && (
        <Card title={`试解析结果 (${previewRows.length} 条)`} noPadding>
          <div className="table-scroll max-h-64">
            <table className="data-table">
              <thead>
                <tr>
                  {["门店", "收件人", "SKU编码", "SKU名称", "数量"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.storeName}</td>
                    <td>{r.recipientName}</td>
                    <td>{r.skuCode}</td>
                    <td>{r.skuName}</td>
                    <td>{r.skuQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export function RuleListItem({
  rule,
  selected,
  onSelect,
  onCopy,
  onDelete,
}: {
  rule: ParseRuleRecord;
  selected?: boolean;
  onSelect: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`flex items-center justify-between gap-3 p-3 sm:p-4 rounded-xl border cursor-pointer transition-all duration-150 ${
        selected
          ? "border-[var(--primary)] bg-[var(--primary-light)] shadow-sm"
          : "border-[var(--border)] hover:border-[var(--primary-muted)] hover:bg-[var(--primary-light)]/30"
      }`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{rule.name}</p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
          {rule.description ?? "无描述"} · {rule.config?.steps?.length ?? 0} 个步骤
        </p>
      </div>
      <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="sm" onClick={onCopy}>
          复制
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} className="!text-[var(--danger)]">
          删除
        </Button>
      </div>
    </div>
  );
}
