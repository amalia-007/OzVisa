"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AnalysisResult, ExtractedFields } from "@/lib/supabase";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
  Check,
  Download,
  Mail,
  ExternalLink,
  FileText,
  MapPin,
  Briefcase,
  User,
  Building2,
  Calendar,
  DollarSign,
  Clock,
} from "lucide-react";

interface ResultsClientProps {
  analysisId: string;
  email: string;
  visaType: "417" | "462";
  language: string;
  result: AnalysisResult;
  createdAt: string;
  locale: string;
}

const FIELD_ICONS: Partial<Record<keyof ExtractedFields, React.ReactNode>> = {
  fullName: <User className="h-4 w-4" />,
  employerName: <Building2 className="h-4 w-4" />,
  employerAbn: <FileText className="h-4 w-4" />,
  jobTitle: <Briefcase className="h-4 w-4" />,
  employmentType: <Briefcase className="h-4 w-4" />,
  hoursPerWeek: <Clock className="h-4 w-4" />,
  totalHours: <Clock className="h-4 w-4" />,
  payPeriod: <Calendar className="h-4 w-4" />,
  grossIncome: <DollarSign className="h-4 w-4" />,
  startDate: <Calendar className="h-4 w-4" />,
  postcode: <MapPin className="h-4 w-4" />,
  state: <MapPin className="h-4 w-4" />,
  industry: <Briefcase className="h-4 w-4" />,
  specifiedWork: <CheckCircle2 className="h-4 w-4" />,
};

export function ResultsClient({
  analysisId,
  email,
  visaType,
  language,
  result,
  createdAt,
  locale,
}: ResultsClientProps) {
  const t = useTranslations("results");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const isFrench = language === "fr" || locale === "fr";

  const fieldLabels: Record<keyof ExtractedFields, string> = {
    fullName: t("fields.fullName"),
    employerName: t("fields.employerName"),
    employerAbn: t("fields.employerAbn"),
    jobTitle: t("fields.jobTitle"),
    employmentType: t("fields.employmentType"),
    hoursPerWeek: t("fields.hoursPerWeek"),
    totalHours: t("fields.totalHours"),
    payPeriod: t("fields.payPeriod"),
    grossIncome: t("fields.grossIncome"),
    startDate: t("fields.startDate"),
    postcode: t("fields.postcode"),
    state: t("fields.state"),
    industry: t("fields.industry"),
    specifiedWork: t("fields.specifiedWork"),
  };

  const visaApplicationMapping: Record<keyof ExtractedFields, string> = {
    fullName: isFrench ? "Section \"Détails personnels\" → Nom et prénom" : "\"Personal details\" section → Full name",
    employerName: isFrench ? "Section \"Historique d'emploi\" → Nom de l'employeur" : "\"Employment history\" section → Employer name",
    employerAbn: isFrench ? "Section \"Historique d'emploi\" → ABN de l'employeur" : "\"Employment history\" section → Employer ABN",
    jobTitle: isFrench ? "Section \"Historique d'emploi\" → Titre du poste" : "\"Employment history\" section → Job title",
    employmentType: isFrench ? "Section \"Historique d'emploi\" → Type d'emploi" : "\"Employment history\" section → Employment type",
    hoursPerWeek: isFrench ? "Section \"Historique d'emploi\" → Heures moyennes par semaine" : "\"Employment history\" section → Average hours per week",
    totalHours: isFrench ? "Section \"Travail spécifié\" → Total d'heures effectuées" : "\"Specified work\" section → Total hours completed",
    payPeriod: isFrench ? "Section \"Revenus\" → Fréquence de paiement" : "\"Income\" section → Payment frequency",
    grossIncome: isFrench ? "Section \"Revenus\" → Revenu brut par période" : "\"Income\" section → Gross income per period",
    startDate: isFrench ? "Section \"Historique d'emploi\" → Date de début" : "\"Employment history\" section → Start date",
    postcode: isFrench ? "Section \"Historique d'emploi\" → Code postal du lieu de travail" : "\"Employment history\" section → Work location postcode",
    state: isFrench ? "Section \"Historique d'emploi\" → État/Territoire" : "\"Employment history\" section → State/Territory",
    industry: isFrench ? "Section \"Travail spécifié\" → Secteur d'activité" : "\"Specified work\" section → Industry/sector",
    specifiedWork: isFrench ? "Section \"Travail spécifié\" → Éligibilité au travail régional" : "\"Specified work\" section → Regional work eligibility",
  };

  async function copyToClipboard(value: string, field: string) {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  async function downloadPdf() {
    setIsDownloadingPdf(true);
    try {
      const res = await fetch(`/api/results/pdf?id=${analysisId}`);
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ozvisa-results-${analysisId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert(isFrench ? "Erreur lors de la génération du PDF" : "Error generating PDF");
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  function getConfidenceColor(score: number): string {
    if (score >= 0.8) return "text-green-600";
    if (score >= 0.5) return "text-yellow-600";
    return "text-red-600";
  }

  function getConfidenceLabel(score: number): string {
    if (score >= 0.8) return isFrench ? "Haute" : "High";
    if (score >= 0.5) return isFrench ? "Moyenne" : "Medium";
    return isFrench ? "Faible" : "Low";
  }

  const visaUrl = visaType === "417"
    ? "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417"
    : "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-and-holiday-462";

  const fieldOrder: (keyof ExtractedFields)[] = [
    "fullName", "employerName", "employerAbn", "jobTitle", "employmentType",
    "hoursPerWeek", "totalHours", "payPeriod", "grossIncome", "startDate",
    "postcode", "state", "industry", "specifiedWork",
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t("title")}</h1>
          <p className="mt-1 text-gray-500 text-sm">{t("subtitle")}</p>
          <p className="mt-1 text-xs text-gray-400">
            <Mail className="h-3 w-3 inline mr-1" />
            {t("email.sent")} {email}
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Button
            variant="outline"
            onClick={downloadPdf}
            disabled={isDownloadingPdf}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            {isDownloadingPdf ? t("download.generating") : t("download.pdf")}
          </Button>
        </div>
      </div>

      {/* Eligibility */}
      <Card
        className={`border-2 ${
          result.specified_work_eligible === true
            ? "border-green-400 bg-green-50"
            : result.specified_work_eligible === false
            ? "border-red-300 bg-red-50"
            : "border-yellow-300 bg-yellow-50"
        }`}
      >
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            {result.specified_work_eligible === true ? (
              <CheckCircle2 className="h-8 w-8 text-green-600 flex-shrink-0 mt-0.5" />
            ) : result.specified_work_eligible === false ? (
              <XCircle className="h-8 w-8 text-red-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-8 w-8 text-yellow-600 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">{t("eligibility.title")}</h2>
              <p className="text-gray-700">
                {result.specified_work_eligible === true
                  ? t("eligibility.eligible")
                  : result.specified_work_eligible === false
                  ? t("eligibility.notEligible")
                  : t("eligibility.uncertain")}
              </p>
              <p className="mt-2 text-sm text-gray-600">{result.specified_work_reason}</p>
              <a
                href="https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 text-sm text-blue-600 hover:underline flex items-center gap-1 w-fit"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("eligibility.learnMore")}
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Extracted Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            {t("extractedData.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-100">
            {fieldOrder.map((field) => {
              const value = result.fields[field];
              const confidence = result.confidence_scores[field] || 0;
              const isMissing = !value || result.missing_fields.includes(field);

              return (
                <div key={field} className="flex items-center gap-3 px-6 py-4 hover:bg-gray-50 group">
                  <div className="text-gray-400 flex-shrink-0">{FIELD_ICONS[field]}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {fieldLabels[field]}
                    </p>
                    {isMissing ? (
                      <p className="text-sm text-gray-400 italic mt-0.5">{t("extractedData.missing")}</p>
                    ) : (
                      <p className="text-sm font-medium text-gray-900 mt-0.5 font-mono">{value}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">{visaApplicationMapping[field]}</p>
                  </div>
                  {!isMissing && (
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`text-xs font-medium ${getConfidenceColor(confidence)}`}>
                        {getConfidenceLabel(confidence)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(value!, field)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity gap-1.5"
                      >
                        {copiedField === field ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-green-600" />
                            <span className="text-green-600 text-xs">{t("extractedData.copied")}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span className="text-xs">{t("extractedData.copy")}</span>
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Missing fields notice */}
      {result.missing_fields.length > 0 && (
        <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-200 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800">
              {isFrench ? "Informations manquantes" : "Missing information"}
            </p>
            <p className="text-sm text-yellow-700 mt-1">
              {isFrench
                ? `Les champs suivants n'ont pas pu être extraits : ${result.missing_fields.map(f => fieldLabels[f as keyof ExtractedFields] || f).join(", ")}. Vous devrez les renseigner manuellement.`
                : `The following fields could not be extracted: ${result.missing_fields.map(f => fieldLabels[f as keyof ExtractedFields] || f).join(", ")}. You'll need to fill them in manually.`}
            </p>
          </div>
        </div>
      )}

      {/* Step-by-step guide */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            {t("guide.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <GuideStep
            number={1}
            title={t("guide.step1.title")}
            description={t("guide.step1.description")}
          >
            <a
              href={visaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              {`WHV ${visaType} — immi.homeaffairs.gov.au`}
            </a>
          </GuideStep>

          <GuideStep
            number={2}
            title={t("guide.step2.title")}
            description={t("guide.step2.description")}
          >
            <a
              href="https://online.immi.gov.au/lusc/login"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              ImmiAccount Login
            </a>
          </GuideStep>

          <GuideStep
            number={3}
            title={t("guide.step3.title")}
            description={t("guide.step3.description")}
          >
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 space-y-1">
              <p>1. {isFrench ? "Cliquez sur" : "Click"} <strong>&quot;New application&quot;</strong></p>
              <p>2. {isFrench ? "Sélectionnez" : "Select"} <strong>&quot;Working Holiday&quot;</strong></p>
              <p>3. {isFrench ? "Choisissez la sous-classe" : "Choose subclass"} <strong>{visaType}</strong></p>
            </div>
          </GuideStep>

          <GuideStep
            number={4}
            title={t("guide.step4.title")}
            description={t("guide.step4.description")}
          >
            <div className="space-y-2">
              {fieldOrder
                .filter((f) => result.fields[f])
                .map((field) => (
                  <div key={field} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                    <div>
                      <span className="text-xs text-gray-500">{visaApplicationMapping[field]}</span>
                      <p className="text-sm font-mono font-medium text-gray-900">{result.fields[field]}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(result.fields[field]!, field + "_guide")}
                      className="gap-1.5 flex-shrink-0"
                    >
                      {copiedField === field + "_guide" ? (
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                ))}
            </div>
          </GuideStep>

          <GuideStep
            number={5}
            title={t("guide.step5.title")}
            description={t("guide.step5.description")}
          >
            <div className="bg-blue-50 rounded-lg p-3 space-y-1.5">
              {[
                isFrench ? "✅ Fiche de paie (payslip)" : "✅ Payslip",
                isFrench ? "✅ Lettre d'employeur (si disponible)" : "✅ Employer letter (if available)",
                isFrench ? "✅ Passeport (page photo + tampons)" : "✅ Passport (photo page + stamps)",
                isFrench ? "✅ Extrait de casier judiciaire (si demandé)" : "✅ Police clearance (if requested)",
              ].map((item, i) => (
                <p key={i} className="text-sm text-blue-800">{item}</p>
              ))}
            </div>
          </GuideStep>

          <GuideStep
            number={6}
            title={t("guide.step6.title")}
            description={t("guide.step6.description")}
          >
            <div className="flex gap-3 flex-wrap">
              <a
                href="https://www.abn.business.gov.au/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {isFrench ? "Vérifier un ABN" : "Verify ABN"}
              </a>
              <a
                href="https://www.fairwork.gov.au/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Fair Work Australia
              </a>
            </div>
          </GuideStep>
        </CardContent>
      </Card>

      {/* Official links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{isFrench ? "Liens officiels" : "Official links"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { label: `WHV ${visaType} Official Page`, href: visaUrl },
              { label: "ImmiAccount Login", href: "https://online.immi.gov.au/lusc/login" },
              { label: "Specified Work Info", href: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work" },
              { label: "ABN Lookup", href: "https://www.abn.business.gov.au/" },
              { label: "Fair Work Australia", href: "https://www.fairwork.gov.au/" },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
              >
                <ExternalLink className="h-4 w-4 text-blue-500 flex-shrink-0" />
                {link.label}
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Download CTA */}
      <div className="flex flex-col sm:flex-row gap-3 pb-6">
        <Button size="lg" onClick={downloadPdf} disabled={isDownloadingPdf} className="gap-2 flex-1">
          <Download className="h-5 w-5" />
          {isDownloadingPdf ? t("download.generating") : t("download.pdf")}
        </Button>
        <p className="flex items-center gap-2 text-sm text-gray-500 sm:flex-1 justify-center">
          <Mail className="h-4 w-4" />
          {t("email.sent")} <strong>{email}</strong>
        </p>
      </div>
    </div>
  );
}

function GuideStep({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
        {number}
      </div>
      <div className="flex-1 space-y-3">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
