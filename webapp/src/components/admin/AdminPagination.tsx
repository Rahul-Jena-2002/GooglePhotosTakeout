import React, { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronUp, ChevronDown } from "lucide-react";

// ─── Sortable Header ─────────────────────────────────────────────────────────
export interface SortState { key: string; dir: "asc" | "desc" }

export function SortableHeader({
  label, sortKey, sort, onSort, className = ""
}: { label: string; sortKey: string; sort: SortState; onSort: (k: string) => void; className?: string }) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={"flex items-center gap-1 group select-none hover:text-white transition-colors whitespace-nowrap " + className}
    >
      <span>{label}</span>
      <span className="flex flex-col ml-0.5">
        <ChevronUp  className={"w-2.5 h-2.5 -mb-0.5 transition-colors " + (active && sort.dir === "asc"  ? "text-zinc-100 font-bold" : "text-zinc-600 group-hover:text-zinc-400")} />
        <ChevronDown className={"w-2.5 h-2.5 transition-colors "         + (active && sort.dir === "desc" ? "text-zinc-100 font-bold" : "text-zinc-600 group-hover:text-zinc-400")} />
      </span>
    </button>
  );
}

/** Generic in-memory sort helper — resolves nested/timestamp values automatically */
export function sortItems<T extends Record<string, any>>(items: T[], sort: SortState, resolver?: (item: T, key: string) => any): T[] {
  const resolve = resolver ?? ((item: T, key: string) => item[key]);
  return [...items].sort((a, b) => {
    let av = resolve(a, sort.key);
    let bv = resolve(b, sort.key);
    // Firestore timestamps
    if (av?.seconds) av = av.seconds * 1000;
    if (bv?.seconds) bv = bv.seconds * 1000;
    if (av?.toDate) av = av.toDate().getTime();
    if (bv?.toDate) bv = bv.toDate().getTime();
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av == null) return 1; if (bv == null) return -1;
    return sort.dir === "asc" ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
  });
}

/** Sort state hook: toggling same key flips direction; new key starts asc */
export function useAdminSort(defaultKey: string, defaultDir: "asc" | "desc" = "asc") {
  const [sort, setSort] = useState<SortState>({ key: defaultKey, dir: defaultDir });
  const onSort = (key: string) =>
    setSort(prev => ({ key, dir: prev.key === key ? (prev.dir === "asc" ? "desc" : "asc") : "asc" }));
  return { sort, onSort };
}

// ─── Pagination ───────────────────────────────────────────────────────────────

interface AdminPaginationProps {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange?: (s: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function AdminPagination({
  page,
  totalItems,
  pageSize,
  onPageChange,
  className = "",
}: AdminPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  const delta = 2;
  const pageNumbers: (number | "...")[] = [];
  const range = { start: Math.max(1, page - delta), end: Math.min(totalPages, page + delta) };
  if (range.start > 1) { pageNumbers.push(1); if (range.start > 2) pageNumbers.push("..."); }
  for (let i = range.start; i <= range.end; i++) pageNumbers.push(i);
  if (range.end < totalPages) { if (range.end < totalPages - 1) pageNumbers.push("..."); pageNumbers.push(totalPages); }

  if (totalItems === 0) return null;

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-zinc-800 text-xs text-zinc-400 select-none ${className}`}>
      {/* Left: item count range */}
      <div className="flex items-center gap-2">
        <span className="text-zinc-500 font-mono text-xs">{start}–{end} of {totalItems}</span>
      </div>

      {/* Right: page navigation using admin css button classes */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="btn-admin-page-nav"
          title="First page"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="btn-admin-page-nav"
          title="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {pageNumbers.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-1.5 py-1 text-zinc-600 font-bold">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={`btn-admin-page ${p === page ? "btn-admin-page-active" : "btn-admin-page-inactive"}`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="btn-admin-page-nav"
          title="Next page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className="btn-admin-page-nav"
          title="Last page"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

