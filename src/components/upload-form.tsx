"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileText,
  X,
  Eye,
  Loader2,
  Mail,
  CreditCard,
  AlertCircle,
} from "lucide-react";

interface UploadFormProps {
  locale: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.webp";
const VALID_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export function UploadForm({ locale }: UploadFormProps) {
  const t = useTranslations("upload");

  const [payslips, setPayslips] = useState<File[]>([]);
  const [payslipError, setPayslipError] = useState<string | null>(null);
  const [isPayslipDrag, setIsPayslipDrag] = useState(false);

  const [letters, setLetters] = useState<File[]>([]);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [isLetterDrag, setIsLetterDrag] = useState(false);

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [visaType, setVisaType] = useState<"417" | "462">("417");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const payslipInputRef = useRef<HTMLInputElement>(null);
  const letterInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);

  function openPreview(file: File) {
    setPreview({ file, url: URL.createObjectURL(file) });
  }
  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  function validateFile(file: File): string | null {
    if (!VALID_TYPES.includes(file.type)) return t("errors.invalidType");
    if (file.size > MAX_FILE_SIZE) return t("errors.tooLarge");
    return null;
  }

  function addFiles(
    incoming: FileList | File[],
    setter: React.Dispatch<React.SetStateAction<File[]>>,
    setError: React.Dispatch<React.SetStateAction<string | null>>
  ) {
    setError(null);
    const arr = Array.from(incoming);
    const valid: File[] = [];
    let firstErr: string | null = null;
    for (const file of arr) {
      const err = validateFile(file);
      if (err) { if (!firstErr) firstErr = err; }
      else valid.push(file);
    }
    if (firstErr) setError(firstErr);
    if (valid.length > 0) setter((prev) => [...prev, ...valid]);
  }

  // ─── Payslip drag handlers ───────────────────────────────────────────────
  function onPayslipDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsPayslipDrag(true);
  }
  function onPayslipDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsPayslipDrag(false);
  }
  function onPayslipDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsPayslipDrag(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files, setPayslips, setPayslipError);
    }
  }

  // ─── Letter drag handlers ────────────────────────────────────────────────
  function onLetterDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsLetterDrag(true);
  }
  function onLetterDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsLetterDrag(false);
  }
  function onLetterDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsLetterDrag(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files, setLetters, setLetterError);
    }
  }

  function validateEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (payslips.length === 0) {
      setPayslipError(t("errors.noPayslip"));
      return;
    }
    if (!email) {
      setEmailError(t("errors.noEmail"));
      return;
    }
    if (!validateEmail(email)) {
      setEmailError(t("errors.invalidEmail"));
      return;
    }

    setEmailError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      for (const f of payslips) formData.append("payslip", f);
      for (const f of letters) formData.append("employerLetter", f);
      formData.append("email", email);
      formData.append("visaType", visaType);
      formData.append("language", locale);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || t("errors.noPayslip"));
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setSubmitError(
        locale === "fr"
          ? "Une erreur est survenue. Veuillez réessayer."
          : "An error occurred. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── Hidden native file inputs ── */}
      <input
        ref={payslipInputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            addFiles(e.target.files, setPayslips, setPayslipError);
          }
          // Reset so the same file can be re-added after removal
          e.target.value = "";
        }}
      />
      <input
        ref={letterInputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            addFiles(e.target.files, setLetters, setLetterError);
          }
          e.target.value = "";
        }}
      />

      {/* ── Payslip Upload ── */}
      <Card>
        <CardContent className="p-6">
          <Label className="text-base font-semibold text-gray-900 mb-3 block">
            {t("payslip.label")}
            <Badge variant="destructive" className="ml-2 text-xs">
              {locale === "fr" ? "Obligatoire" : "Required"}
            </Badge>
          </Label>

          {/* Drop zone */}
          <div
            onClick={() => payslipInputRef.current?.click()}
            onDragOver={onPayslipDragOver}
            onDragLeave={onPayslipDragLeave}
            onDrop={onPayslipDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors select-none ${
              isPayslipDrag
                ? "border-blue-400 bg-blue-50"
                : payslipError
                ? "border-red-300 bg-red-50"
                : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"
            }`}
          >
            <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="font-medium text-gray-700">{t("payslip.hint")}</p>
            <p className="text-sm text-gray-400 mt-1">{t("payslip.formats")}</p>
          </div>

          {/* File list */}
          {payslips.length > 0 && (
            <ul className="mt-3 space-y-2">
              {payslips.map((file, i) => (
                <li
                  key={`${file.name}-${file.size}-${i}`}
                  className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200"
                >
                  <FileText className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openPreview(file)}
                    className="p-1 rounded-full hover:bg-green-200 transition-colors flex-shrink-0"
                    aria-label="Preview file"
                  >
                    <Eye className="h-4 w-4 text-green-700" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayslips((prev) => prev.filter((_, idx) => idx !== i))}
                    className="p-1 rounded-full hover:bg-green-200 transition-colors flex-shrink-0"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4 text-green-700" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {payslipError && (
            <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" /> {payslipError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Employer Letter Upload ── */}
      <Card>
        <CardContent className="p-6">
          <Label className="text-base font-semibold text-gray-900 mb-3 block">
            {t("employerLetter.label")}
            <Badge variant="secondary" className="ml-2 text-xs">
              {locale === "fr" ? "Optionnel" : "Optional"}
            </Badge>
          </Label>

          {/* Drop zone */}
          <div
            onClick={() => letterInputRef.current?.click()}
            onDragOver={onLetterDragOver}
            onDragLeave={onLetterDragLeave}
            onDrop={onLetterDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors select-none ${
              isLetterDrag
                ? "border-blue-400 bg-blue-50"
                : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
            }`}
          >
            <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">{t("employerLetter.hint")}</p>
            <p className="text-sm text-gray-400 mt-1">{t("employerLetter.formats")}</p>
          </div>

          {/* File list */}
          {letters.length > 0 && (
            <ul className="mt-3 space-y-2">
              {letters.map((file, i) => (
                <li
                  key={`${file.name}-${file.size}-${i}`}
                  className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200"
                >
                  <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openPreview(file)}
                    className="p-1 rounded-full hover:bg-blue-200 transition-colors flex-shrink-0"
                    aria-label="Preview file"
                  >
                    <Eye className="h-4 w-4 text-blue-700" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLetters((prev) => prev.filter((_, idx) => idx !== i))}
                    className="p-1 rounded-full hover:bg-blue-200 transition-colors flex-shrink-0"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4 text-blue-700" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {letterError && (
            <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" /> {letterError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Email ── */}
      <Card>
        <CardContent className="p-6 space-y-3">
          <Label htmlFor="email" className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Mail className="h-4 w-4" />
            {t("email.label")}
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(null);
            }}
            placeholder={t("email.placeholder")}
            className={emailError ? "border-red-400" : ""}
          />
          {emailError && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" /> {emailError}
            </p>
          )}
          <p className="text-xs text-gray-400">{t("email.hint")}</p>
        </CardContent>
      </Card>

      {/* ── Visa Type ── */}
      <Card>
        <CardContent className="p-6">
          <Label className="text-base font-semibold text-gray-900 mb-3 block">
            {t("visaType.label")}
          </Label>
          <div className="grid grid-cols-2 gap-3">
            {(["417", "462"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setVisaType(type)}
                className={`p-4 rounded-xl border-2 text-left transition-colors ${
                  visaType === type
                    ? "border-blue-600 bg-blue-50 text-blue-900"
                    : "border-gray-200 hover:border-blue-300"
                }`}
              >
                <p className="font-bold text-lg">{type}</p>
                <p className="text-sm text-gray-600">
                  {type === "417" ? "Working Holiday" : "Work and Holiday"}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Submit error ── */}
      {submitError && (
        <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-red-700 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">{submitError}</p>
        </div>
      )}

      {/* ── Security notice ── */}
      <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl text-sm text-gray-500">
        <CreditCard className="h-5 w-5 flex-shrink-0 mt-0.5 text-gray-400" />
        <p>
          {locale === "fr"
            ? "Paiement sécurisé de 55 AUD via Stripe. Vos documents sont traités en mémoire uniquement et ne sont jamais stockés."
            : "Secure 55 AUD payment via Stripe. Your documents are processed in memory only and are never stored."}
        </p>
      </div>

      {/* ── Submit ── */}
      <Button type="submit" size="xl" className="w-full gap-2" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            {t("processing")}
          </>
        ) : (
          <>
            <CreditCard className="h-5 w-5" />
            {t("cta")}
          </>
        )}
      </Button>

      {/* ── File preview modal ── */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={closePreview}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <p className="text-sm font-medium text-gray-800 truncate pr-4">{preview.file.name}</p>
              <button
                type="button"
                onClick={closePreview}
                className="p-1.5 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
                aria-label="Close preview"
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-auto p-4 min-h-0">
              {preview.file.type === "application/pdf" ? (
                <iframe
                  src={preview.url}
                  className="w-full h-[75vh] rounded-lg border border-gray-200"
                  title={preview.file.name}
                />
              ) : (
                <img
                  src={preview.url}
                  alt={preview.file.name}
                  className="max-w-full max-h-[75vh] mx-auto rounded-lg object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
