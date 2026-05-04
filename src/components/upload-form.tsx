"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
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
  Loader2,
  Mail,
  CreditCard,
  AlertCircle,
} from "lucide-react";

interface UploadFormProps {
  locale: string;
}

interface FileState {
  file: File | null;
  error: string | null;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export function UploadForm({ locale }: UploadFormProps) {
  const t = useTranslations("upload");

  const [payslip, setPayslip] = useState<FileState>({ file: null, error: null });
  const [employerLetter, setEmployerLetter] = useState<FileState>({ file: null, error: null });
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [visaType, setVisaType] = useState<"417" | "462">("417");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function validateFile(file: File): string | null {
    const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) return t("errors.invalidType");
    if (file.size > MAX_FILE_SIZE) return t("errors.tooLarge");
    return null;
  }

  const onDropPayslip = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    const error = validateFile(file);
    setPayslip({ file: error ? null : file, error });
  }, []);

  const onDropLetter = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    const error = validateFile(file);
    setEmployerLetter({ file: error ? null : file, error });
  }, []);

  const { getRootProps: getPayslipRootProps, getInputProps: getPayslipInputProps, isDragActive: isPayslipDrag } =
    useDropzone({ onDrop: onDropPayslip, accept: ACCEPTED_TYPES, maxFiles: 1, maxSize: MAX_FILE_SIZE });

  const { getRootProps: getLetterRootProps, getInputProps: getLetterInputProps, isDragActive: isLetterDrag } =
    useDropzone({ onDrop: onDropLetter, accept: ACCEPTED_TYPES, maxFiles: 1, maxSize: MAX_FILE_SIZE });

  function validateEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!payslip.file) {
      setPayslip((p) => ({ ...p, error: t("errors.noPayslip") }));
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
      formData.append("payslip", payslip.file);
      if (employerLetter.file) formData.append("employerLetter", employerLetter.file);
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
      setSubmitError(locale === "fr" ? "Une erreur est survenue. Veuillez réessayer." : "An error occurred. Please try again.");
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
      {/* Payslip Upload */}
      <Card>
        <CardContent className="p-6">
          <Label className="text-base font-semibold text-gray-900 mb-3 block">
            {t("payslip.label")}
            <Badge variant="destructive" className="ml-2 text-xs">
              {locale === "fr" ? "Obligatoire" : "Required"}
            </Badge>
          </Label>
          {!payslip.file ? (
            <div
              {...getPayslipRootProps()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                isPayslipDrag
                  ? "border-blue-400 bg-blue-50"
                  : payslip.error
                  ? "border-red-300 bg-red-50"
                  : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"
              }`}
            >
              <input {...getPayslipInputProps()} />
              <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
              <p className="font-medium text-gray-700">{t("payslip.hint")}</p>
              <p className="text-sm text-gray-400 mt-1">{t("payslip.formats")}</p>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
              <FileText className="h-8 w-8 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{payslip.file.name}</p>
                <p className="text-sm text-gray-500">{formatFileSize(payslip.file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => setPayslip({ file: null, error: null })}
                className="p-1 rounded-full hover:bg-green-200 transition-colors"
              >
                <X className="h-4 w-4 text-green-700" />
              </button>
            </div>
          )}
          {payslip.error && (
            <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" /> {payslip.error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Employer Letter Upload */}
      <Card>
        <CardContent className="p-6">
          <Label className="text-base font-semibold text-gray-900 mb-3 block">
            {t("employerLetter.label")}
            <Badge variant="secondary" className="ml-2 text-xs">
              {locale === "fr" ? "Optionnel" : "Optional"}
            </Badge>
          </Label>
          {!employerLetter.file ? (
            <div
              {...getLetterRootProps()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                isLetterDrag
                  ? "border-blue-400 bg-blue-50"
                  : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
              }`}
            >
              <input {...getLetterInputProps()} />
              <Upload className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">{t("employerLetter.hint")}</p>
              <p className="text-sm text-gray-400 mt-1">{t("employerLetter.formats")}</p>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <FileText className="h-8 w-8 text-blue-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{employerLetter.file.name}</p>
                <p className="text-sm text-gray-500">{formatFileSize(employerLetter.file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => setEmployerLetter({ file: null, error: null })}
                className="p-1 rounded-full hover:bg-blue-200 transition-colors"
              >
                <X className="h-4 w-4 text-blue-700" />
              </button>
            </div>
          )}
          {employerLetter.error && (
            <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" /> {employerLetter.error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Email */}
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

      {/* Visa Type */}
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

      {/* Submit error */}
      {submitError && (
        <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-red-700 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">{submitError}</p>
        </div>
      )}

      {/* Security notice */}
      <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl text-sm text-gray-500">
        <CreditCard className="h-5 w-5 flex-shrink-0 mt-0.5 text-gray-400" />
        <p>
          {locale === "fr"
            ? "Paiement sécurisé de 29€ via Stripe. Vos documents sont traités en mémoire uniquement et ne sont jamais stockés."
            : "Secure €29 payment via Stripe. Your documents are processed in memory only and are never stored."}
        </p>
      </div>

      {/* Submit */}
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
    </form>
  );
}
