"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, toast } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";

interface TaskItem {
  id: string;
  file_name: string;
  status: string;
  total_rows: number;
  processed_rows: number;
  success_rows: number;
  failed_rows: number;
  total_batches: number;
  completed_batches: number;
  trace_id: string;
  degraded: boolean;
  created_at: string;
}

interface RuleItem {
  id: string;
  name: string;
}

export default function TasksPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [ruleId, setRuleId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    // summary=1：只取 id/name，避免下载完整规则 config
    const rRes = await fetch("/api/rules?summary=1");
    const rJson = await rRes.json();
    if (!rRes.ok) throw new Error(rJson.error || "加载规则失败");
    const list = (Array.isArray(rJson) ? rJson : rJson.data || []) as RuleItem[];
    setRules(list);
    setRuleId((prev) => prev || list[0]?.id || "");
  }, []);

  const loadTasks = useCallback(async (opts?: { background?: boolean }) => {
    const background = opts?.background ?? false;
    if (background) setRefreshing(true);
    else setInitialLoading(true);
    setError(null);
    try {
      const tRes = await fetch("/api/import-tasks?pageSize=30");
      const tJson = await tRes.json();
      if (!tRes.ok) throw new Error(tJson.error || "加载任务失败");
      setTasks(tJson.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([loadRules(), loadTasks()]);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载失败");
          setInitialLoading(false);
        }
      }
    })();

    const timer = setInterval(() => {
      void loadTasks({ background: true });
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loadRules, loadTasks]);

  const handleUpload = async () => {
    if (!file || !ruleId || uploading) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("ruleId", ruleId);
      const res = await fetch("/api/import-tasks", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "上传失败");
      toast.success(`任务已创建（${json.upload_ms ?? "?"}ms）`);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      router.push(`/tasks/${json.task_id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="异步导入任务"
        subtitle="上传即返回 task_id，后台分批处理；可查看进度、错误与 Trace"
      />

      <Card title="创建异步导入">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block text-sm">
            <span className="text-[var(--text-secondary)]">解析规则</span>
            <select
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              value={ruleId}
              onChange={(e) => setRuleId(e.target.value)}
            >
              {rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <div className="block text-sm md:col-span-2">
            <span className="text-[var(--text-secondary)]">出库单文件</span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.docx,.pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileRef.current?.click()}
              >
                选择文件
              </Button>
              <span className="text-sm text-[var(--text-secondary)] truncate max-w-[280px]">
                {file ? file.name : "未选择任何文件"}
              </span>
              {file && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                >
                  清除
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button
            onClick={handleUpload}
            disabled={!file || !ruleId || uploading}
            loading={uploading}
          >
            {uploading ? "提交中…" : "上传并创建任务"}
          </Button>
          <span className="text-xs text-[var(--text-secondary)]">
            接口 P95 目标 ≤ 1s，不等待后台完成
          </span>
        </div>
      </Card>

      <Card
        title="最近任务"
        extra={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadTasks({ background: true })}
            loading={refreshing}
          >
            刷新
          </Button>
        }
      >
        {initialLoading && !tasks.length ? (
          <LoadingState message="加载最近任务..." />
        ) : error && !tasks.length ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !tasks.length ? (
          <EmptyState title="暂无异步任务" description="上传文件后将在此展示" />
        ) : (
          <div className={`overflow-x-auto ${refreshing ? "opacity-70" : ""}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                  <th className="py-2 pr-3">文件</th>
                  <th className="py-2 pr-3">状态</th>
                  <th className="py-2 pr-3">进度</th>
                  <th className="py-2 pr-3">成功/失败</th>
                  <th className="py-2 pr-3">Trace</th>
                  <th className="py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-b border-[var(--border)]/60">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{t.file_name}</div>
                      <div className="font-mono text-xs text-[var(--text-secondary)]">
                        {t.id}
                        {t.degraded ? " · 降级" : ""}
                      </div>
                    </td>
                    <td className="py-2 pr-3 uppercase">{t.status}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {t.processed_rows}/{t.total_rows}
                      <div className="text-xs text-[var(--text-secondary)]">
                        批次 {t.completed_batches}/{t.total_batches}
                      </div>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {t.success_rows}/{t.failed_rows}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{t.trace_id}</td>
                    <td className="py-2">
                      <Link
                        href={`/tasks/${t.id}`}
                        className="text-[var(--primary)] hover:underline"
                      >
                        详情
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
