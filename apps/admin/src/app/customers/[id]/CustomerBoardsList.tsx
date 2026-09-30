"use client";

import { useState, useMemo } from "react";
import type { TestedBoard } from "@/lib/api";

export function CustomerBoardsList({ boards }: { boards: TestedBoard[] }) {
  const [search, setSearch] = useState("");
  const [verdictFilter, setVerdictFilter] = useState<string>("ALL");
  const [productFilter, setProductFilter] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Filter boards
  const filteredBoards = useMemo(() => {
    return boards.filter((board) => {
      const matchesSearch =
        board.uid.toLowerCase().includes(search.toLowerCase()) ||
        board.stationId.toLowerCase().includes(search.toLowerCase());

      const matchesVerdict =
        verdictFilter === "ALL" || board.lastVerdict === verdictFilter;

      const matchesProduct =
        productFilter === "ALL" ||
        board.productName === productFilter ||
        board.variant === productFilter;

      return matchesSearch && matchesVerdict && matchesProduct;
    });
  }, [boards, search, verdictFilter, productFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredBoards.length / pageSize));
  const paginatedBoards = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredBoards.slice(start, start + pageSize);
  }, [filteredBoards, currentPage, pageSize]);

  // Copy UID helper
  const [copiedUid, setCopiedUid] = useState<string | null>(null);
  const copyToClipboard = (uid: string) => {
    navigator.clipboard.writeText(uid);
    setCopiedUid(uid);
    setTimeout(() => setCopiedUid(null), 1500);
  };

  // Distinct products among these boards
  const distinctProducts = useMemo(() => {
    return Array.from(new Set(boards.map((b) => b.productName))).filter(Boolean);
  }, [boards]);

  return (
    <div className="rounded-2xl border border-neutral-200/90 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      {/* Table Header & Filter Bar */}
      <div className="border-b border-neutral-200/80 p-5 dark:border-neutral-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                Unique PCBs Tested
              </h2>
              <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {filteredBoards.length} of {boards.length} Boards
              </span>
            </div>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              Complete list of unique PCB microcontrollers tested for this customer, along with pass/fail test results.
            </p>
          </div>

          {/* Filters: Search + Verdict + Product */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search UID */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Search PCB Unique ID (UID)..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-1.5 pl-8 text-xs text-neutral-900 placeholder-neutral-400 focus:border-neutral-900 focus:bg-white focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-100 dark:focus:bg-neutral-900"
              />
              <svg
                className="absolute top-2 left-2.5 h-3.5 w-3.5 text-neutral-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>

            {/* Verdict Filter */}
            <select
              value={verdictFilter}
              onChange={(e) => {
                setVerdictFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
            >
              <option value="ALL">All Results</option>
              <option value="PASS">PASS Only</option>
              <option value="FAIL">FAIL Only</option>
              <option value="FIXTURE_FAULT">Fixture Fault</option>
            </select>

            {/* Product Category Filter (if customer has multiple) */}
            {distinctProducts.length > 1 && (
              <select
                value={productFilter}
                onChange={(e) => {
                  setProductFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              >
                <option value="ALL">All Categories</option>
                {distinctProducts.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* PCB Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200/80 bg-neutral-50/75 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-400">
            <tr>
              <th className="px-5 py-3.5">PCB Unique ID (UID)</th>
              <th className="px-4 py-3.5">Product Category</th>
              <th className="px-4 py-3.5">Test Result</th>
              <th className="px-4 py-3.5">MCU Lock</th>
              <th className="px-4 py-3.5 text-right">Attempts</th>
              <th className="px-4 py-3.5 text-right">Duration</th>
              <th className="px-4 py-3.5">Station</th>
              <th className="px-5 py-3.5 text-right">Tested At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200/70 dark:divide-neutral-800/70 font-sans">
            {paginatedBoards.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  No unique PCBs found matching the search or filters.
                </td>
              </tr>
            ) : (
              paginatedBoards.map((board) => {
                const isSingle = board.productName.includes("Single");
                const isPass = board.lastVerdict === "PASS";
                const isFail = board.lastVerdict === "FAIL";
                const durationFormatted = board.durationMs ? `${(board.durationMs / 1000).toFixed(1)}s` : "—";
                const testedDate = board.lastTestedAt
                  ? new Date(board.lastTestedAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : "—";

                return (
                  <tr
                    key={board.uid}
                    className="transition-colors hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40"
                  >
                    {/* PCB Unique ID */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-neutral-900 select-all dark:text-neutral-100">
                          {board.uid}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(board.uid)}
                          title="Copy PCB UID"
                          className="rounded p-1 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                        >
                          {copiedUid === board.uid ? (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Copied!</span>
                          ) : (
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Product Category */}
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          isSingle
                            ? "bg-sky-50 text-sky-700 ring-1 ring-sky-600/20 dark:bg-sky-950/60 dark:text-sky-300"
                            : "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/20 dark:bg-indigo-950/60 dark:text-indigo-300"
                        }`}
                      >
                        {isSingle ? "💧 Single WLC" : "🌊 Double WLC"}
                      </span>
                    </td>

                    {/* Test Result / Verdict */}
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          isPass
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-400"
                            : isFail
                            ? "bg-red-50 text-red-700 ring-1 ring-red-600/20 dark:bg-red-950/50 dark:text-red-400"
                            : "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-950/50 dark:text-amber-400"
                        }`}
                      >
                        {isPass ? "✓ PASS" : isFail ? "✕ FAIL" : "⚠ FAULT"}
                      </span>
                    </td>

                    {/* MCU Security Lock */}
                    <td className="px-4 py-3.5 text-xs">
                      {board.locked ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium dark:text-emerald-400">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                          <span>Locked</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-neutral-400 font-medium">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                          </svg>
                          <span>Unlocked</span>
                        </span>
                      )}
                    </td>

                    {/* Attempts Count */}
                    <td className="px-4 py-3.5 text-right font-medium text-neutral-700 dark:text-neutral-300">
                      {board.attemptCount > 1 ? (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                          {board.attemptCount} runs
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-500">1 run</span>
                      )}
                    </td>

                    {/* Duration */}
                    <td className="px-4 py-3.5 text-right font-mono text-xs text-neutral-600 dark:text-neutral-400">
                      {durationFormatted}
                    </td>

                    {/* Station */}
                    <td className="px-4 py-3.5 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                      {board.stationId}
                    </td>

                    {/* Tested At */}
                    <td className="px-5 py-3.5 text-right text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      {testedDate}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-neutral-200/80 px-5 py-3.5 dark:border-neutral-800">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Showing <span className="font-semibold text-neutral-900 dark:text-neutral-100">{(currentPage - 1) * pageSize + 1}</span> to{" "}
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
              {Math.min(currentPage * pageSize, filteredBoards.length)}
            </span>{" "}
            of <span className="font-semibold text-neutral-900 dark:text-neutral-100">{filteredBoards.length}</span> unique PCBs
          </p>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Previous
            </button>
            <span className="px-2 text-xs font-medium text-neutral-500">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
