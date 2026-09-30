"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminCustomer } from "@/lib/api";
import { AddCustomerModal } from "@/components/AddCustomerModal";
import { deleteCustomerAction, sendCustomerCredentialsAction } from "./actions";
import { PRODUCT_CATEGORIES, PRICE_PER_PASS_SINGLE_WLC } from "@/lib/constants";

export { PRODUCT_CATEGORIES };

export function CustomersList({ initialCustomers }: { initialCustomers: AdminCustomer[] }) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [emailingCredsId, setEmailingCredsId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSendCredentials(id: string, name: string) {
    setEmailingCredsId(id);
    try {
      const res = await sendCustomerCredentialsAction(id);
      if (res.ok) {
        alert(`✓ Login credentials email dispatched to "${name}" via Resend!`);
      } else {
        alert(res.gatewayNotice || res.message || "Failed to send credentials email.");
      }
    } catch (err: any) {
      alert(err?.message || "Error sending credentials email.");
    } finally {
      setEmailingCredsId(null);
    }
  }

  async function handleDeleteCustomer(id: string, name: string) {
    if (!window.confirm(`Are you sure you want to remove customer "${name}"?\nAll associated stations and test logs for this customer will also be deleted.`)) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteCustomerAction(id);
      router.refresh();
    } catch (err: any) {
      alert(err?.message || "Failed to delete customer");
    } finally {
      setDeletingId(null);
    }
  }

  // Filter customers by selected category (product), search, and status
  const filteredCustomers = useMemo(() => {
    return initialCustomers.filter((customer) => {
      // Category filter (Single vs Double vs All)
      const matchesCategory =
        selectedCategory === "ALL" ||
        (customer.products && customer.products.includes(selectedCategory));

      // Search filter
      const matchesSearch =
        customer.name.toLowerCase().includes(search.toLowerCase()) ||
        customer.id.toLowerCase().includes(search.toLowerCase());

      // Status filter
      const matchesStatus =
        statusFilter === "ALL" || customer.status === statusFilter;

      return matchesCategory && matchesSearch && matchesStatus;
    });
  }, [initialCustomers, selectedCategory, search, statusFilter]);

  // Dynamic KPI calculations based on current filter
  const totalCustomers = filteredCustomers.length;
  const activeCustomers = filteredCustomers.filter((c) => c.status === "ACTIVE").length;
  const totalStations = filteredCustomers.reduce((acc, c) => acc + (c.stationCount || 0), 0);
  const totalUniquePcbs = filteredCustomers.reduce((acc, c) => acc + (c.uniquePcbsTested || 0), 0);
  const totalRuns = filteredCustomers.reduce((acc, c) => acc + (c.runs || 0), 0);
  const totalRevenue = filteredCustomers.reduce((acc, c) => acc + (c.revenue || 0), 0);

  // Currently selected item label
  const currentCategory = PRODUCT_CATEGORIES.find((c) => c.id === selectedCategory) || PRODUCT_CATEGORIES[0];

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER WITH DROPDOWN ARROW */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Customers
            </h1>

            {/* DROPDOWN SELECTOR WITH ARROW */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="group flex items-center gap-2.5 rounded-xl border border-neutral-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-neutral-900 shadow-xs transition hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
                aria-expanded={isDropdownOpen}
              >
                <span className="flex items-center gap-1.5">
                  {selectedCategory === "Single Water Level Controller" && (
                    <span className="h-2 w-2 rounded-full bg-sky-500" />
                  )}
                  {selectedCategory === "Double Water Level Controller" && (
                    <span className="h-2 w-2 rounded-full bg-indigo-500" />
                  )}
                  {selectedCategory === "ALL" && (
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  )}
                  <span>{currentCategory.label}</span>
                </span>

                {/* Down Arrow / Chevron */}
                <svg
                  className={`h-4 w-4 text-neutral-500 transition-transform duration-200 group-hover:text-neutral-800 dark:text-neutral-400 dark:group-hover:text-neutral-200 ${
                    isDropdownOpen ? "rotate-180" : ""
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* DROPDOWN MENU */}
              {isDropdownOpen && (
                <div className="absolute left-0 z-50 mt-2 w-80 rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl ring-1 ring-black/5 dark:border-neutral-800 dark:bg-neutral-900 dark:ring-white/10 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    Select Customer Category
                  </div>

                  <div className="space-y-1">
                    {PRODUCT_CATEGORIES.map((cat) => {
                      const isSelected = selectedCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            setSelectedCategory(cat.id);
                            setIsDropdownOpen(false);
                          }}
                          className={`flex w-full items-start justify-between rounded-xl px-3 py-2.5 text-left text-xs transition-colors ${
                            isSelected
                              ? "bg-neutral-100 font-semibold text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                              : "text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-100"
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              {cat.id === "Single Water Level Controller" && (
                                <span className="h-2 w-2 rounded-full bg-sky-500" />
                              )}
                              {cat.id === "Double Water Level Controller" && (
                                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                              )}
                              {cat.id === "ALL" && (
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                              )}
                              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                                {cat.label}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400 pl-4">
                              {cat.description}
                            </p>
                          </div>

                          {isSelected && (
                            <svg className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {selectedCategory === "ALL"
              ? "Showing all customer accounts and deployed stations."
              : `Showing customers who purchased: ${currentCategory.label}.`}
          </p>
        </div>
      </div>

      {/* 2. DYNAMIC SUMMARY CARDS */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-50/60 p-4 shadow-xs dark:border-emerald-500/30 dark:bg-emerald-950/30">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Revenue (Pass Only)</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-emerald-950 dark:text-emerald-100">
            ₹{totalRevenue.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
            ₹{PRICE_PER_PASS_SINGLE_WLC} / passed PCB
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200/80 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Customers</p>
          <p className="mt-1.5 text-2xl font-bold text-neutral-900 dark:text-neutral-100">{totalCustomers}</p>
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">{activeCustomers} Active</p>
        </div>

        <div className="rounded-xl border border-neutral-200/80 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Assigned Stations</p>
          <p className="mt-1.5 text-2xl font-bold text-neutral-900 dark:text-neutral-100">{totalStations}</p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Deployed test units</p>
        </div>

        <div className="rounded-xl border border-neutral-200/80 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Unique PCBs Tested</p>
          <p className="mt-1.5 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {totalUniquePcbs.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Selected category</p>
        </div>

        <div className="rounded-xl border border-neutral-200/80 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Total Test Runs</p>
          <p className="mt-1.5 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {totalRuns.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Includes retests</p>
        </div>
      </div>

      {/* 3. CUSTOMER DATA TABLE */}
      <div className="rounded-xl border border-neutral-200/80 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-3 border-b border-neutral-200/80 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
          {/* Search box */}
          <div className="relative w-full max-w-sm">
            <input
              type="text"
              placeholder="Search customer name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3.5 py-2 pl-9 text-sm text-neutral-900 placeholder-neutral-400 focus:border-neutral-900 focus:bg-white focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-100 dark:focus:bg-neutral-900"
            />
            <svg
              className="absolute top-2.5 left-3 h-4 w-4 text-neutral-400"
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

          {/* Status Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200/80 bg-neutral-50/75 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-400">
              <tr>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-4 py-3.5">Purchased Category</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Revenue</th>
                <th className="px-4 py-3.5 text-right">Stations</th>
                <th className="px-4 py-3.5 text-right">Unique PCBs</th>
                <th className="px-4 py-3.5 text-right">Total Runs</th>
                <th className="px-4 py-3.5 text-right">First-Pass Yield</th>
                <th className="px-4 py-3.5 text-right">Last Activity</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200/70 dark:divide-neutral-800/70">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
                    No customers found in <span className="font-semibold text-neutral-700 dark:text-neutral-300">&quot;{currentCategory.label}&quot;</span>.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => {
                  const fpyPercent = (customer.firstPassYield * 100).toFixed(1);
                  const lastSeenFormatted = customer.lastActivity
                    ? new Date(customer.lastActivity).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Never";

                  return (
                    <tr
                      key={customer.id}
                      className="group transition-colors hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40"
                    >
                      {/* Customer Name & ID */}
                      <td className="px-5 py-4">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="font-semibold text-neutral-900 transition hover:text-blue-600 hover:underline dark:text-neutral-100 dark:hover:text-blue-400"
                        >
                          {customer.name}
                        </Link>
                        <div className="font-mono text-xs text-neutral-400 dark:text-neutral-500">{customer.id}</div>
                      </td>

                      {/* Products Purchased Badges */}
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {customer.products && customer.products.length > 0 ? (
                            customer.products.map((prod) => {
                              const isSingle = prod === "Single Water Level Controller";
                              return (
                                <span
                                  key={prod}
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                    isSingle
                                      ? "bg-sky-50 text-sky-700 ring-1 ring-sky-600/20 dark:bg-sky-950/60 dark:text-sky-300"
                                      : "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/20 dark:bg-indigo-950/60 dark:text-indigo-300"
                                  }`}
                                >
                                  {isSingle ? "💧 Single WLC" : "🌊 Double WLC"}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-xs text-neutral-400 italic">No products</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            customer.status === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-400"
                              : "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-500/20 dark:bg-neutral-800 dark:text-neutral-400"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              customer.status === "ACTIVE" ? "bg-emerald-500" : "bg-neutral-400"
                            }`}
                          />
                          {customer.status}
                        </span>
                      </td>

                      {/* Revenue */}
                      <td className="px-4 py-4 text-right font-bold text-emerald-700 dark:text-emerald-400">
                        ₹{(customer.revenue || 0).toLocaleString()}
                      </td>

                      {/* Stations */}
                      <td className="px-4 py-4 text-right font-medium text-neutral-700 dark:text-neutral-300">
                        {customer.stationCount}
                      </td>

                      {/* Unique PCBs */}
                      <td className="px-4 py-4 text-right font-semibold text-neutral-900 dark:text-neutral-100">
                        {customer.uniquePcbsTested.toLocaleString()}
                      </td>

                      {/* Total Runs */}
                      <td className="px-4 py-4 text-right text-neutral-600 dark:text-neutral-400">
                        {customer.runs.toLocaleString()}
                      </td>

                      {/* First-Pass Yield */}
                      <td className="px-4 py-4 text-right font-medium">
                        <span
                          className={
                            customer.firstPassYield >= 0.85
                              ? "text-emerald-600 dark:text-emerald-400"
                              : customer.firstPassYield > 0
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-neutral-400"
                          }
                        >
                          {customer.runs > 0 ? `${fpyPercent}%` : "—"}
                        </span>
                      </td>

                      {/* Last Activity */}
                      <td className="px-4 py-4 text-right text-xs text-neutral-500 dark:text-neutral-400">
                        {lastSeenFormatted}
                      </td>

                      {/* Action: View Dashboard & Remove */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/customers/${customer.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 shadow-2xs transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-blue-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:hover:text-blue-400"
                          >
                            <span>Dashboard</span>
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </Link>

                          <button
                            type="button"
                            title="Email Login Credentials to Customer"
                            disabled={emailingCredsId === customer.id}
                            onClick={() => handleSendCredentials(customer.id, customer.name)}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs font-semibold text-blue-600 shadow-2xs transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900/60 dark:bg-neutral-800 dark:text-blue-400 dark:hover:bg-blue-950/40"
                          >
                            {emailingCredsId === customer.id ? (
                              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                              </svg>
                            ) : (
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                <polyline points="22,6 12,13 2,6" />
                              </svg>
                            )}
                            <span className="hidden sm:inline">Credentials</span>
                          </button>

                          <button
                            type="button"
                            title="Remove Customer"
                            disabled={deletingId === customer.id}
                            onClick={() => handleDeleteCustomer(customer.id, customer.name)}
                            className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white p-1 text-red-600 shadow-2xs transition hover:bg-red-50 hover:border-red-300 disabled:opacity-50 dark:border-red-900/60 dark:bg-neutral-800 dark:text-red-400 dark:hover:bg-red-950/40"
                          >
                            {deletingId === customer.id ? (
                              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                              </svg>
                            ) : (
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Big Round '+' Floating Action Button at Downside */}
      <div className="fixed bottom-8 right-8 z-40">
        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          aria-label="Add Customer"
          title="Add Customer"
          className="group relative flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-white shadow-2xl transition-all duration-300 hover:scale-110 hover:bg-blue-500 active:scale-95 focus:outline-hidden ring-4 ring-blue-500/20 dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          {/* Big '+' Icon */}
          <svg
            className="h-8 w-8 transition-transform duration-300 group-hover:rotate-90"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Add Customer Modal */}
      <AddCustomerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </div>
  );
}
