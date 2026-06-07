"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, toast } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { RuleEditor, RuleListItem } from "@/components/rules/RuleEditor";
import { ExamDemoMapCard } from "@/components/rules/ExamDemoMapCard";
import { suggestUniqueRuleName } from "@/lib/rules/rule-names";
import type { ParseRuleConfig, ParseRuleRecord } from "@/types";

export default function RulesPage() {
  const [rules, setRules] = useState<ParseRuleRecord[]>([]);
  const [editing, setEditing] = useState<ParseRuleRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rules");
      if (res.ok) setRules(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleSave = async (
    name: string,
    description: string,
    config: ParseRuleConfig
  ) => {
    if (editing) {
      const res = await fetch(`/api/rules/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, config }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "更新失败");
      }
      setEditing(null);
    } else {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, config }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "创建失败");
      }
      setCreating(false);
    }
    await loadRules();
  };

  if (editing || creating) {
    return (
      <div className="page-stack animate-fade-in">
        <PageHeader
          title={editing ? "编辑规则" : "新建规则"}
          extra={
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setCreating(false);
              }}
            >
              返回列表
            </Button>
          }
        />
        <RuleEditor
          ruleId={editing?.id}
          initialName={editing?.name}
          initialConfig={editing?.config as ParseRuleConfig}
          existingNames={rules.map((r) => r.name)}
          onSave={handleSave}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="page-stack animate-fade-in">
      <PageHeader
        title="解析规则管理"
        subtitle="通用规则引擎配置，支持 AI 辅助生成与手动编辑"
        extra={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const res = await fetch("/api/rules/seed-presets", {
                  method: "POST",
                });
                const json = await res.json();
                if (res.ok) {
                  toast.success(json.message);
                  await loadRules();
                } else {
                  toast.error(json.error ?? "导入失败");
                }
              }}
            >
              导入预设规则
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              + 新建规则
            </Button>
          </>
        }
      />

      <Card title={`规则列表 (${rules.length})`}>
        {loading ? (
          <LoadingState message="加载规则列表..." />
        ) : rules.length === 0 ? (
          <EmptyState
            icon="⚙️"
            title="暂无解析规则"
            description="创建或导入预设规则后，可在导入流程中手动选择使用"
            action={{
              label: "创建第一条规则",
              onClick: () => setCreating(true),
            }}
          />
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <RuleListItem
                key={rule.id}
                rule={rule}
                onSelect={() => setEditing(rule)}
                onCopy={async () => {
                  const copyName = suggestUniqueRuleName(
                    `${rule.name} (副本)`,
                    rules.map((r) => r.name)
                  );
                  const res = await fetch("/api/rules", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: copyName,
                      description: rule.description,
                      config: rule.config,
                    }),
                  });
                  const json = await res.json();
                  if (res.ok) {
                    await loadRules();
                    toast.success(`规则已复制为「${copyName}」`);
                  } else {
                    toast.error(json.error ?? "复制失败");
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
                  await loadRules();
                  toast.success("已删除");
                }}
              />
            ))}
          </div>
        )}
      </Card>

      <Card title="考核用例 ↔ 预设规则对照（9 份）">
        <ExamDemoMapCard />
      </Card>

      <Card title="规则引擎说明">
        <div className="text-sm text-[var(--text-secondary)] space-y-2">
          <p>
            系统采用<strong>通用规则引擎</strong>架构，通过 JSON 配置描述解析步骤，无需为每种文件编写硬编码逻辑。
          </p>
          <p>支持的步骤类型：skipRows、extractTable、extractFooter、groupBy、matrixTranspose、processAllSheets、cardSplit、textBlockSplit、compositeCellSplit、dateStoreMatrix、pdfSplit、filterRows、mapFields 等。</p>
          <p className="text-[var(--warning)]">
            导入文件时，建议先使用「新建规则」让 AI 分析文件结构并生成推荐规则，确认后再保存。
          </p>
        </div>
      </Card>
    </div>
  );
}
