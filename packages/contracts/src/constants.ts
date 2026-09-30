/**
 * Global Constants for FCT Platform
 * Shared across Admin Portal, API, and Mobile App
 */

// Official Admin Credentials
export const ADMIN_OFFICIAL_EMAIL = "info@proembsys.in";

// Product Names
export const PRODUCT_SINGLE_WLC = "Single Water Level Controller";
export const PRODUCT_DOUBLE_WLC = "Double Water Level Controller";

// Pricing per passed PCB (in INR ₹)
export const PRICE_PER_PASS_SINGLE_WLC = 10;
export const PRICE_PER_PASS_DOUBLE_WLC = 15;

// Password & Security Requirements
export const MIN_PASSWORD_LENGTH = 8;

// OTP Dev Fallback
export const DEV_MASTER_OTP = "123456";

// Product Category Configurations
export const PRODUCT_CATEGORIES = [
  {
    id: "ALL",
    label: "All Customers",
    badgeLabel: "All Products",
    description: "View all customer accounts and deployed stations",
  },
  {
    id: "Single Water Level Controller",
    label: "Single Water Level Controller",
    badgeLabel: "Single WLC",
    description: "Customers who purchased Single-tank controller PCB",
    pricePerPass: 10,
  },
  {
    id: "Double Water Level Controller",
    label: "Double Water Level Controller",
    badgeLabel: "Double WLC",
    description: "Customers who purchased Dual-tank controller PCB",
    pricePerPass: 15,
  },
] as const;
