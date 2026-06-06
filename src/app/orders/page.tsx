"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, PageHeader, StatCard } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Pagination } from "@/components/ui/Pagination";

interface OrderRecord {
  id: string;
  batchId: string;
  fileName: string | null;
  externalCode: string | null;
  storeName: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientAddress: string | null;
  skuCode: string;
  skuName: string;
  skuQuantity: string;
  weight: string | null;
  tempLayer: string | null;
  skuSpec: string | null;
  remark: string | null;
  createdAt: string;
}

const EMPTY_FILTERS = {
  externalCode: "",
  recipientName: "",
  startDate: "",
  endDate: "",
};

export default function OrdersPage() {
  const router = useRouter();
  const [data, setData] = useState<OrderRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (applied.externalCode.trim()) {
        params.set("externalCode", applied.externalCode.trim());
      }
      if (applied.recipientName.trim()) {
        params.set("recipientName", applied.recipientName.trim());
      }
      if (applied.startDate) params.set("startDate", applied.startDate);
      if (applied.endDate) params.set("endDate", applied.endDate);

      const res = await fetch(`/api/orders?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "查询失败");
      setData(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "查询失败");
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, applied]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleSearch = () => {
    setPage(1);
    setApplied({ ...filters });
  };

  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters =
    applied.externalCode ||
    applied.recipientName ||
    applied.startDate ||
    applied.endDate;

  return (
    <div className="page-stack animate-fade-in">
      <PageHeader
        title="已导入运单列表"
        subtitle="查看所有历史已导入的运单记录，支持按外部编码、收件人姓名、提交时间筛选"
        extra={
          <Button variant="primary" size="sm" onClick={() => router.push("/import")}>
            + 新建导入
          </Button>
        }
      />

      <div className="flex gap-3 flex-wrap">
        <StatCard label="运单总数" value={total} color="var(--primary)" accent="primary" />
        <StatCard label="当前页" value={`${page} / ${totalPages}`} />
        <StatCard label="本页条数" value={data.length} accent="success" />
      </div>

      <Card title="筛选 / 搜索" className="mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="form-label">外部编码</label>
            <input
              className="form-input"
              value={filters.externalCode}
              onChange={(e) =>
                setFilters((f) => ({ ...f, externalCode: e.target.value }))
              }
              onKeyDown={handleKeyDown}
              placeholder="模糊搜索外部编码"
            />
          </div>
          <div>
            <label className="form-label">收件人姓名</label>
            <input
              className="form-input"
              value={filters.recipientName}
              onChange={(e) =>
                setFilters((f) => ({ ...f, recipientName: e.target.value }))
              }
              onKeyDown={handleKeyDown}
              placeholder="模糊搜索收件人"
            />
          </div>
          <div>
            <label className="form-label">提交时间（起）</label>
            <input
              type="date"
              className="form-input"
              value={filters.startDate}
              onChange={(e) =>
                setFilters((f) => ({ ...f, startDate: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="form-label">提交时间（止）</label>
            <input
              type="date"
              className="form-input"
              value={filters.endDate}
              min={filters.startDate || undefined}
              onChange={(e) =>
                setFilters((f) => ({ ...f, endDate: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2 flex-wrap items-center">
          <Button onClick={handleSearch} loading={loading}>
            搜索
          </Button>
          <Button variant="secondary" onClick={handleReset}>
            重置
          </Button>
          {hasFilters && (
            <span className="text-xs text-[var(--text-muted)]">
              已应用筛选条件
            </span>
          )}
        </div>
      </Card>

      <Card
        title={`运单列表${hasFilters ? "（筛选结果）" : ""}`}
        extra={
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchOrders}
            loading={loading}
          >
            刷新
          </Button>
        }
        noPadding
      >
        {error && (
          <div className="mx-4 sm:mx-6 mt-4 px-4 py-3 alert-error text-sm">
            {error}
            <span className="block text-xs mt-1 text-red-400">
              请确认数据库已连接并访问 /api/init-db 完成初始化
            </span>
          </div>
        )}

        {loading ? (
          <LoadingState message="加载运单列表..." />
        ) : data.length === 0 ? (
          <EmptyState
            icon={hasFilters ? "🔍" : "📋"}
            title={hasFilters ? "未找到符合条件的运单" : "暂无已导入运单"}
            description={
              hasFilters
                ? "请调整筛选条件后重试"
                : "完成导入并在预览页「提交下单」后，记录将出现在此处"
            }
            action={
              !hasFilters
                ? {
                    label: "去导入",
                    onClick: () => router.push("/import"),
                  }
                : undefined
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {[
                    "外部编码",
                    "收货门店",
                    "收件人",
                    "电话",
                    "收件地址",
                    "SKU编码",
                    "SKU名称",
                    "数量",
                    "重量",
                    "温层",
                    "导入文件",
                    "提交时间",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id}>
                    <td className="font-medium">{row.externalCode ?? "-"}</td>
                    <td>{row.storeName ?? "-"}</td>
                    <td>{row.recipientName ?? "-"}</td>
                    <td className="whitespace-nowrap">{row.recipientPhone ?? "-"}</td>
                    <td
                      className="max-w-[160px] truncate"
                      title={row.recipientAddress ?? ""}
                    >
                      {row.recipientAddress ?? "-"}
                    </td>
                    <td>{row.skuCode}</td>
                    <td className="max-w-[140px] truncate" title={row.skuName}>
                      {row.skuName}
                    </td>
                    <td>{row.skuQuantity}</td>
                    <td>{row.weight ?? "-"}</td>
                    <td>{row.tempLayer ?? "-"}</td>
                    <td
                      className="max-w-[120px] truncate text-[var(--text-muted)]"
                      title={row.fileName ?? ""}
                    >
                      {row.fileName ?? "-"}
                    </td>
                    <td className="text-[var(--text-muted)] whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString("zh-CN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </Card>
    </div>
  );
}
