"use client";

import { useState } from "react";
import { AddCustomerModal } from "@/components/AddCustomerModal";

export function OverviewHeader() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  return (
    <>
      {/* Overview Top Title (clean, no clutter) */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          Overview
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Last 30 days, across all customers.
        </p>
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

      {/* Slide-over Registration Page Floating Right */}
      <AddCustomerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </>
  );
}
