"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  sendCustomerOtpAction,
  createCustomerAction,
  sendCustomerCredentialsAction,
} from "@/app/customers/actions";
import {
  ADMIN_OFFICIAL_EMAIL,
  PRODUCT_SINGLE_WLC,
  PRODUCT_DOUBLE_WLC,
  PRICE_PER_PASS_SINGLE_WLC,
  PRICE_PER_PASS_DOUBLE_WLC,
  MIN_PASSWORD_LENGTH,
  DEV_MASTER_OTP,
} from "@/lib/constants";

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddCustomerModal({ isOpen, onClose, onSuccess }: AddCustomerModalProps) {
  const router = useRouter();

  // Step state: 1 = Form details, 2 = OTP verification, 3 = Created & Credentials Summary
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form Fields - Note: name and phone are OPTIONAL
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>(PRODUCT_SINGLE_WLC);

  // OTP State
  const [otp, setOtp] = useState("");
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [emailDelivered, setEmailDelivered] = useState<boolean | null>(null);
  const [gatewayNotice, setGatewayNotice] = useState<string | null>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdData, setCreatedData] = useState<{
    customer: any;
    user: any;
    rawPassword: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Credentials Email state for Step 3
  const [credentialsEmailed, setCredentialsEmailed] = useState<boolean | null>(null);
  const [credentialsNotice, setCredentialsNotice] = useState<string | null>(null);
  const [resendingCredentials, setResendingCredentials] = useState(false);
  const [resendStatusMessage, setResendStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  function resetForm() {
    setName("");
    setEmail("");
    setPassword("");
    setPhone("");
    setOtp("");
    setDevOtpHint(null);
    setEmailDelivered(null);
    setGatewayNotice(null);
    setError(null);
    setCreatedData(null);
    setCredentialsEmailed(null);
    setCredentialsNotice(null);
    setResendingCredentials(false);
    setResendStatusMessage(null);
    setStep(1);
    onClose();
  }

  function generateRandomPassword() {
    const uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lowers = "abcdefghjkmnpqrstuvwxyz";
    const numbers = "23456789";
    const symbols = "!@#$%^&*";
    let pwd = "";
    pwd += uppers.charAt(Math.floor(Math.random() * uppers.length));
    pwd += lowers.charAt(Math.floor(Math.random() * lowers.length));
    pwd += lowers.charAt(Math.floor(Math.random() * lowers.length));
    pwd += numbers.charAt(Math.floor(Math.random() * numbers.length));
    pwd += symbols.charAt(Math.floor(Math.random() * symbols.length));
    const all = uppers + lowers + numbers + symbols;
    for (let i = 0; i < 5; i++) {
      pwd += all.charAt(Math.floor(Math.random() * all.length));
    }
    setPassword(pwd);
  }

  // STEP 1: Submit details -> Send Email OTP via Resend
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("Please enter a valid customer email.");
      return;
    }
    if (normalizedEmail === ADMIN_OFFICIAL_EMAIL) {
      setError(
        `The admin account (${ADMIN_OFFICIAL_EMAIL}) cannot be registered as a customer. Admin accounts have exclusive administrative control and cannot be an app customer.`,
      );
      return;
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return;
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[^A-Za-z]/.test(password)) {
      setError(
        "Password must contain at least one uppercase letter, one lowercase letter, and one number or symbol.",
      );
      return;
    }

    setLoading(true);
    try {
      const res = await sendCustomerOtpAction(
        normalizedEmail,
        phone.trim() || undefined,
        name.trim() || undefined,
      );
      if (res.devOtp) {
        setDevOtpHint(res.devOtp);
      }
      setEmailDelivered(res.emailDelivered ?? null);
      setGatewayNotice(res.gatewayNotice || null);
      setStep(2);
    } catch (err: any) {
      setError(err?.message || "Failed to send OTP verification code via Resend.");
    } finally {
      setLoading(false);
    }
  }

  // STEP 2: Verify OTP & Create Customer
  async function handleVerifyAndCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!otp.trim()) {
      setError("Please enter the 6-digit OTP code.");
      return;
    }

    setLoading(true);
    try {
      const res = await createCustomerAction({
        name: name.trim() || email.trim().split("@")[0],
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
        otp: otp.trim(),
        products: [selectedProduct],
      });

      setCreatedData({
        customer: res.customer,
        user: res.user,
        rawPassword: password,
      });
      setCredentialsEmailed(res.emailCredentialsSent ?? null);
      setCredentialsNotice(res.credentialsNotice ?? null);
      setStep(3);
      if (onSuccess) onSuccess();
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "OTP verification failed. Please check the code and try again.");
    } finally {
      setLoading(false);
    }
  }

  // Resend OTP to customer's email
  async function handleResendOtp() {
    setError(null);
    setLoading(true);
    try {
      const res = await sendCustomerOtpAction(
        email.trim().toLowerCase(),
        phone.trim() || undefined,
        name.trim() || undefined,
      );
      if (res.devOtp) {
        setDevOtpHint(res.devOtp);
      }
      setEmailDelivered(res.emailDelivered ?? null);
      setGatewayNotice(res.gatewayNotice || null);
    } catch (err: any) {
      setError(err?.message || "Failed to resend verification code.");
    } finally {
      setLoading(false);
    }
  }

  // STEP 3: Manual Resend of Customer Credentials
  async function handleResendCredentials() {
    if (!createdData?.customer?.id) return;
    setResendingCredentials(true);
    setResendStatusMessage(null);
    try {
      const res = await sendCustomerCredentialsAction(
        createdData.customer.id,
        createdData.rawPassword,
      );
      if (res.ok) {
        setCredentialsEmailed(true);
        setResendStatusMessage("✓ Credentials email dispatched successfully via Resend!");
      } else {
        setResendStatusMessage(res.gatewayNotice || res.message || "Failed to send credentials.");
      }
    } catch (err: any) {
      setResendStatusMessage(err?.message || "Error dispatching credentials email.");
    } finally {
      setResendingCredentials(false);
    }
  }

  function handleCopyCredentials() {
    if (!createdData) return;
    const displayName = name.trim() || email.trim().split("@")[0];
    const text = `Customer: ${displayName}\nEmail: ${email}\nPassword: ${createdData.rawPassword}\nProduct: ${selectedProduct}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* 1. Dimmed Backdrop with Blur over Home Page */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-200 animate-in fade-in"
        onClick={resetForm}
        aria-hidden="true"
      />

      {/* 2. Customer Registration Window Centered in the Middle */}
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <div className="relative w-full max-w-xl rounded-2xl border border-neutral-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-neutral-800 dark:bg-neutral-900 dark:ring-white/10 transition-all duration-200 animate-in zoom-in-95 fade-in">

          {/* Top Header Bar */}
          <div className="flex items-center justify-between border-b border-neutral-200/80 px-6 py-5 dark:border-neutral-800/80">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                {step === 3 ? (
                  <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="22" y1="11" x2="16" y2="11" />
                  </svg>
                )}
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                  {step === 1 && "Register Customer"}
                  {step === 2 && "Email OTP Verification"}
                  {step === 3 && "Registration Successful"}
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {step === 1 && "Enter customer details to send verification OTP via Resend"}
                  {step === 2 && `Enter the 6-digit OTP code emailed to ${email}`}
                  {step === 3 && "Customer account is ready for mobile app login"}
                </p>
              </div>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              title="Close"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Stepper Progress */}
          <div className="flex h-1 w-full bg-neutral-100 dark:bg-neutral-800">
            <div
              className={`h-full transition-all duration-300 ${
                step === 1 ? "w-1/3 bg-blue-600" : step === 2 ? "w-2/3 bg-blue-600" : "w-full bg-emerald-600"
              }`}
            />
          </div>

          {/* Body Content */}
          <div className="max-h-[calc(85vh-90px)] overflow-y-auto px-6 py-6 sm:px-8">

            {/* Error Banner */}
            {error && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 shrink-0 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* STEP 1: FORM INPUTS */}
            {/* ================================================================= */}
            {step === 1 && (
              <form onSubmit={handleSendOtp} className="space-y-5">
                {/* 1. Customer Email (PRIMARY & REQUIRED for Resend OTP) */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Customer Email (for OTP Verification & Login) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="customer@example.com"
                      className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 pl-10 text-sm text-neutral-900 placeholder-neutral-400 focus:border-blue-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500"
                    />
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-blue-600 dark:text-blue-400">
                    ✉️ A 6-digit OTP verification code will be sent to this email address via Resend.
                  </p>
                </div>

                {/* 2. Customer Initial Password (REQUIRED) */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      Customer Initial Password <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={generateRandomPassword}
                      className="text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      ⚡ Auto-generate
                    </button>
                  </div>
                  <div className="relative mt-1.5">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Set initial password for customer"
                      className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 pr-10 text-sm text-neutral-900 placeholder-neutral-400 focus:border-blue-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                    >
                      {showPassword ? (
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* 3. Company or Customer Name (OPTIONAL) */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      Company or Customer Name
                    </label>
                    <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-normal">
                      (Optional)
                    </span>
                  </div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Apex Hydro or Individual Name (Optional)"
                    className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 focus:border-blue-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500"
                  />
                </div>

                {/* 4. Phone Number (OPTIONAL contact info) */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      Contact Phone Number
                    </label>
                    <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-normal">
                      (Optional)
                    </span>
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210 (Optional)"
                    className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 focus:border-blue-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500"
                  />
                </div>

                {/* 5. Product Category (REQUIRED) */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Purchased Product Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedProduct}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm font-medium text-neutral-800 focus:border-blue-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                  >
                    <option value={PRODUCT_SINGLE_WLC}>
                      💧 {PRODUCT_SINGLE_WLC} (₹{PRICE_PER_PASS_SINGLE_WLC} / pass)
                    </option>
                    <option value={PRODUCT_DOUBLE_WLC}>
                      🌊 {PRODUCT_DOUBLE_WLC} (₹{PRICE_PER_PASS_DOUBLE_WLC} / pass)
                    </option>
                  </select>
                </div>

                {/* Submit Action */}
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-98 disabled:opacity-50"
                  >
                    {loading && (
                      <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    )}
                    <span>Send Email OTP via Resend</span>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              </form>
            )}

            {/* ================================================================= */}
            {/* STEP 2: OTP VERIFICATION */}
            {/* ================================================================= */}
            {step === 2 && (
              <form onSubmit={handleVerifyAndCreate} className="space-y-6">
                {/* Resend Status Banner */}
                {emailDelivered === true ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <div className="flex items-start gap-2.5">
                      <span className="text-lg">📧</span>
                      <div>
                        <p className="font-semibold text-sm">Real Email Dispatched via Resend!</p>
                        <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
                          A 6-digit OTP code was sent to <span className="font-bold">{email}</span>. Please check your inbox or spam/junk folder.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : gatewayNotice ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
                    <div className="flex items-start gap-2.5">
                      <span className="text-lg">ℹ️</span>
                      <div className="space-y-1.5">
                        <p className="font-bold text-sm text-amber-900 dark:text-amber-100">
                          Resend Delivery Notice
                        </p>
                        <p className="text-xs text-amber-850 dark:text-amber-300 leading-relaxed">
                          {gatewayNotice}
                        </p>
                        <p className="text-[11px] text-amber-800/90 dark:text-amber-400 leading-relaxed">
                          💡 <strong>Testing Mode:</strong> On unverified domains, Resend delivers testing emails to your Resend account email (or delivered@resend.dev). You can also use the active code below for immediate instant testing.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">
                    <div className="flex items-start gap-2.5">
                      <span className="text-lg">📧</span>
                      <div>
                        <p className="font-semibold text-sm">Verification OTP sent to customer</p>
                        <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">
                          Enter the 6-digit verification code sent to <span className="font-bold">{email}</span>.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Dev Code / Auto-fill Box */}
                {devOtpHint && (
                  <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-xs font-semibold text-neutral-800 dark:border-neutral-800 dark:bg-neutral-850 dark:text-neutral-200">
                    <span className="text-neutral-500 dark:text-neutral-400">Active Code:</span>
                    <span className="font-mono text-base font-bold tracking-widest text-blue-600 dark:text-blue-400">{devOtpHint}</span>
                    <button
                      type="button"
                      onClick={() => setOtp(devOtpHint)}
                      className="ml-auto rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-blue-700 active:scale-95"
                    >
                      Auto-fill Code
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-center text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                    Enter 6-Digit Email OTP Code
                  </label>
                  <div className="mt-3 flex justify-center">
                    <input
                      type="text"
                      maxLength={6}
                      autoFocus
                      required
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      placeholder="• • • • • •"
                      className="w-56 rounded-xl border-2 border-neutral-300 bg-neutral-50 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.4em] text-neutral-900 focus:border-blue-600 focus:bg-white focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setError(null);
                    }}
                    className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200"
                  >
                    ← Back to edit details
                  </button>

                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="font-medium text-blue-600 hover:underline dark:text-blue-400 disabled:opacity-50"
                  >
                    Resend OTP to Email
                  </button>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading || otp.length < 6}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-98 disabled:opacity-50"
                  >
                    {loading && (
                      <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    )}
                    <span>Verify OTP & Complete Registration</span>
                  </button>
                </div>
              </form>
            )}

            {/* ================================================================= */}
            {/* STEP 3: REGISTRATION SUCCESS & CREDENTIALS CARD */}
            {/* ================================================================= */}
            {step === 3 && createdData && (
              <div className="space-y-5 animate-in fade-in">
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-950/40">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                    <svg className="h-5 w-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <span className="text-sm font-bold">Customer Verified & Registered!</span>
                  </div>
                  <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                    The customer account is active on the FCT platform.
                  </p>
                </div>

                {/* Email Delivery Status for Credentials */}
                {credentialsEmailed === true ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🚀</span>
                      <p className="font-medium">
                        Login credentials automatically emailed to <span className="font-bold">{email}</span> via Resend!
                      </p>
                    </div>
                  </div>
                ) : credentialsNotice ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                    <p className="font-semibold">Resend Delivery Notice:</p>
                    <p className="text-[11px] mt-0.5">{credentialsNotice}</p>
                  </div>
                ) : null}

                {/* Resend Status Message if Admin triggered re-send */}
                {resendStatusMessage && (
                  <div className="rounded-xl border border-neutral-300 bg-neutral-100 p-2.5 text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                    {resendStatusMessage}
                  </div>
                )}

                {/* Credentials Card */}
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Customer Login Credentials
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyCredentials}
                      className="flex items-center gap-1 text-xs font-semibold text-blue-600 transition hover:text-blue-700 dark:text-blue-400"
                    >
                      {copied ? (
                        <>
                          <svg className="h-3.5 w-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          <span>Copy Credentials</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between py-1 border-b border-neutral-200 dark:border-neutral-700">
                      <span className="text-neutral-500 dark:text-neutral-400">Customer / Name:</span>
                      <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {name.trim() || email.trim().split("@")[0]}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-neutral-200 dark:border-neutral-700">
                      <span className="text-neutral-500 dark:text-neutral-400">Login Email:</span>
                      <span className="font-mono font-semibold text-neutral-900 dark:text-neutral-100">{email}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-neutral-200 dark:border-neutral-700">
                      <span className="text-neutral-500 dark:text-neutral-400">Password:</span>
                      <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100">{createdData.rawPassword}</span>
                    </div>
                    {phone && (
                      <div className="flex items-center justify-between py-1 border-b border-neutral-200 dark:border-neutral-700">
                        <span className="text-neutral-500 dark:text-neutral-400">Contact Phone:</span>
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">{phone}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between py-1">
                      <span className="text-neutral-500 dark:text-neutral-400">Assigned Product:</span>
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">{selectedProduct}</span>
                    </div>
                  </div>
                </div>

                {/* Resend Credentials Email Button */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleResendCredentials}
                    disabled={resendingCredentials}
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400 disabled:opacity-50"
                  >
                    {resendingCredentials ? (
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    ) : (
                      <span>✉️</span>
                    )}
                    <span>Send Credentials via Email Again</span>
                  </button>
                </div>

                <div className="rounded-lg bg-neutral-100 p-3 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  💡 <strong>Admin Notice:</strong> The customer cannot self-register or change their assigned product. You have full control from this admin portal.
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 active:scale-98 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                  >
                    Done & Return to Overview
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
