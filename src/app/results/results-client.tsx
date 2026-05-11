"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AnalysisResult, ExtractedFields, EmployerData } from "@/lib/supabase";
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
  TrendingUp,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseNumber(s: string | null): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/[^\d.]/g, ""));
  return isNaN(n) ? null : n;
}

function parseDateDDMMYYYY(dateStr: string): Date | null {
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const d = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
  return isNaN(d.getTime()) ? null : d;
}

type DaysEstimate = { days: number; isEstimate: boolean; note: string };

function estimateDaysForEmployer(
  emp: {
    totalHours: string | null;
    hoursPerWeek: string | null;
    startDate: string | null;
    endDate?: string | null;
    specified_work_eligible: boolean | null;
  },
  isFrench: boolean
): DaysEstimate {
  // Non-qualifying work = 0 days
  if (emp.specified_work_eligible !== true) {
    return { days: 0, isEstimate: false, note: "" };
  }

  const totalH = parseNumber(emp.totalHours);
  const hpw = parseNumber(emp.hoursPerWeek);

  // Method 1: totalHours ÷ hoursPerWeek × 7 (only if avg ≥ 35 h/week)
  if (totalH !== null && hpw !== null && hpw > 0) {
    if (hpw >= 35) {
      const weeks = totalH / hpw;
      return {
        days: Math.round(weeks * 7),
        isEstimate: true,
        note: isFrench
          ? `Estimation : ${emp.totalHours}h ÷ ${emp.hoursPerWeek}h/sem × 7`
          : `Estimate: ${emp.totalHours}h ÷ ${emp.hoursPerWeek}h/week × 7`,
      };
    }
    return {
      days: 0,
      isEstimate: false,
      note: isFrench
        ? `${hpw}h/sem < 35h minimum requis`
        : `${hpw}h/week < 35h minimum required`,
    };
  }

  // Method 2: date range (only if avg ≥ 35 h/week)
  if (emp.startDate && hpw !== null && hpw >= 35) {
    const start = parseDateDDMMYYYY(emp.startDate);
    if (start) {
      const end = emp.endDate ? (parseDateDDMMYYYY(emp.endDate) ?? new Date()) : new Date();
      if (end > start) {
        const calDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
        return {
          days: calDays,
          isEstimate: true,
          note: isFrench
            ? `Estimation : ${emp.startDate} → ${emp.endDate ?? "aujourd'hui"}`
            : `Estimate: ${emp.startDate} → ${emp.endDate ?? "today"}`,
        };
      }
    }
  }

  // Fallback: can't calculate → 0 (not "?")
  return { days: 0, isEstimate: false, note: "" };
}

type BreakdownEntry = {
  name: string | null;
  jobTitle: string | null;
  postcode: string | null;
  state: string | null;
  industry: string | null;
  eligible: boolean | null;
  reason: string;
  days: number;
  isEstimate: boolean;
  note: string;
};

function buildBreakdowns(result: AnalysisResult, isFrench: boolean): BreakdownEntry[] {
  const employers: EmployerData[] = result.employers ?? [];

  if (employers.length > 0) {
    return employers.map((emp) => {
      const { days, isEstimate, note } = estimateDaysForEmployer(emp, isFrench);
      return {
        name: emp.employerName,
        jobTitle: emp.jobTitle,
        postcode: emp.postcode,
        state: emp.state,
        industry: emp.industry,
        eligible: emp.specified_work_eligible,
        reason: isFrench
          ? (emp.specified_work_reason_fr ?? emp.specified_work_reason)
          : emp.specified_work_reason,
        days,
        isEstimate,
        note,
      };
    });
  }

  // Single-employer fallback (old DB records without employers array)
  const { fields, specified_work_eligible } = result;
  const est = estimateDaysForEmployer(
    {
      totalHours: fields.totalHours,
      hoursPerWeek: fields.hoursPerWeek,
      startDate: fields.startDate,
      endDate: null,
      specified_work_eligible,
    },
    isFrench
  );
  return [
    {
      name: fields.employerName,
      jobTitle: fields.jobTitle,
      postcode: fields.postcode,
      state: fields.state,
      industry: fields.industry,
      eligible: specified_work_eligible,
      reason: isFrench
        ? (result.specified_work_reason_fr ?? result.specified_work_reason)
        : result.specified_work_reason,
      ...est,
    },
  ];
}

function generateEmployerEmail(
  lang: "fr" | "en",
  employerName: string,
  fullName: string | null,
  missingFields: string[]
): string {
  const name = fullName ?? (lang === "fr" ? "[Votre Prénom Nom]" : "[Your Full Name]");
  const hasMissingDates = missingFields.some((f) =>
    ["startDate", "hoursPerWeek", "grossIncome", "totalHours"].includes(f)
  );
  const hasMissingAbn = missingFields.includes("employerAbn");

  if (lang === "fr") {
    return `Objet : Documents requis — Renouvellement de Working Holiday Visa

Bonjour,

Je me permets de vous contacter concernant mon dossier de renouvellement de Working Holiday Visa (sous-classe 417/462) auprès du Department of Home Affairs australien.

Pour compléter ma demande, j'ai besoin des documents suivants :
${hasMissingDates ? "• Mes fiches de paie couvrant l'intégralité de ma période d'emploi (avec dates de début/fin, heures travaillées par semaine et revenu brut)\n" : ""}${hasMissingAbn || !hasMissingDates ? "• Une lettre d'employeur confirmant : ma période d'emploi exacte, mon titre de poste, mes heures hebdomadaires moyennes, et l'ABN de votre entreprise\n" : ""}
Ces documents sont indispensables pour prouver mon expérience de travail régional auprès des autorités d'immigration australiennes.

Je vous remercie par avance pour votre aide et reste disponible pour toute question.

Cordialement,
${name}`;
  }

  return `Subject: Employment documents required — Working Holiday Visa renewal

Dear ${employerName} team,

I am writing to request employment documents for my Working Holiday Visa (subclass 417/462) renewal application with the Australian Department of Home Affairs.

To complete my application, I need the following:
${hasMissingDates ? "• Payslips covering my full period of employment (with start/end dates, weekly hours worked, and gross income)\n" : ""}${hasMissingAbn || !hasMissingDates ? "• An employer letter confirming: my exact employment period, job title, average weekly hours, and your company's ABN\n" : ""}
These documents are required to verify my regional work experience with Australian immigration authorities.

Thank you in advance for your assistance. Please don't hesitate to contact me if you have any questions.

Kind regards,
${name}`;
}

// ─── Field row ────────────────────────────────────────────────────────────────

function FieldRow({
  icon,
  label,
  value,
  hint,
  confidence,
  copiedKey,
  onCopy,
  isFrench,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  hint: string;
  confidence: number;
  copiedKey: string;
  onCopy: (v: string, k: string) => void;
  isFrench?: boolean;
}) {
  const missing = !value;
  const lowConfidence = !missing && confidence < 0.5;

  return (
    <div className="flex items-start gap-3 py-4 px-5 border-b border-gray-100 last:border-0">
      <div className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
          {lowConfidence && (
            <span
              title={isFrench ? "Vérifiez ce champ manuellement" : "Please verify this field manually"}
              className="cursor-help text-amber-500"
            >
              ⚠️
            </span>
          )}
        </div>
        {missing ? (
          <p className="text-base text-gray-400 italic">—</p>
        ) : (
          <p className="text-base font-semibold text-gray-900 font-mono">{value}</p>
        )}
        <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
      </div>
      {!missing && (
        <button
          onClick={() => onCopy(value!, copiedKey)}
          className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors text-xs font-medium mt-0.5"
          title={isFrench ? "Copier" : "Copy"}
        >
          {copiedKey === "copied" ? (
            <><Check className="h-3.5 w-3.5 text-green-600" /> <span className="text-green-600">✓</span></>
          ) : (
            <><Copy className="h-3.5 w-3.5" /> {isFrench ? "Copier" : "Copy"}</>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ResultsClient({
  analysisId,
  email,
  visaType,
  language,
  result,
  locale,
}: ResultsClientProps) {
  const t = useTranslations("results");
  const isFrench = language === "fr" || locale === "fr";

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [checklist, setChecklist] = useState<Record<number, boolean>>({});
  const [emailLang, setEmailLang] = useState<"fr" | "en">(isFrench ? "fr" : "en");
  const [emailCopied, setEmailCopied] = useState(false);

  const { fields, confidence_scores, specified_work_eligible, specified_work_reason, missing_fields } = result;

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

  const immiHints: Record<keyof ExtractedFields, string> = {
    fullName: isFrench ? "Détails personnels → Nom complet" : "Personal details → Full name",
    employerName: isFrench ? "Historique d'emploi → Employeur" : "Employment history → Employer name",
    employerAbn: isFrench ? "Historique d'emploi → ABN employeur" : "Employment history → Employer ABN",
    jobTitle: isFrench ? "Historique d'emploi → Titre du poste" : "Employment history → Job title",
    employmentType: isFrench ? "Historique d'emploi → Type de contrat" : "Employment history → Employment type",
    hoursPerWeek: isFrench ? "Historique d'emploi → Heures/semaine" : "Employment history → Hours/week",
    totalHours: isFrench ? "Travail spécifié → Total heures" : "Specified work → Total hours",
    payPeriod: isFrench ? "Revenus → Fréquence de paiement" : "Income → Pay frequency",
    grossIncome: isFrench ? "Revenus → Revenu brut par période" : "Income → Gross income per period",
    startDate: isFrench ? "Historique d'emploi → Date de début" : "Employment history → Start date",
    postcode: isFrench ? "Historique d'emploi → Code postal" : "Employment history → Work postcode",
    state: isFrench ? "Historique d'emploi → État/Territoire" : "Employment history → State/Territory",
    industry: isFrench ? "Travail spécifié → Secteur" : "Specified work → Industry sector",
    specifiedWork: isFrench ? "Travail spécifié → Éligibilité régionale" : "Specified work → Regional eligibility",
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
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ozvisa-${analysisId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert(isFrench ? "Erreur PDF" : "PDF error");
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  const visaUrl = visaType === "417"
    ? "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417"
    : "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-and-holiday-462";

  // ── Days calculation (multi-employer) ──
  const TARGET_DAYS_2ND = 88;
  const TARGET_DAYS_3RD = 179;

  const breakdowns = buildBreakdowns(result, isFrench);
  const totalDays = breakdowns.reduce((s, e) => s + e.days, 0);
  const hasEstimate = breakdowns.some((e) => e.isEstimate);
  const daysNotes = breakdowns.filter((e) => e.note).map((e) => e.note);

  const daysToGo2nd = Math.max(0, TARGET_DAYS_2ND - totalDays);
  const pct = Math.min(100, Math.round((totalDays / TARGET_DAYS_2ND) * 100));
  const barColor = pct >= 100 ? "bg-green-500" : pct >= 80 ? "bg-yellow-400" : pct >= 33 ? "bg-orange-400" : "bg-red-400";
  const barTextColor = pct >= 100 ? "text-green-700" : pct >= 80 ? "text-yellow-700" : pct >= 33 ? "text-orange-700" : "text-red-700";

  // Top-level verdict reason (FR-aware)
  const verdictReason = isFrench
    ? (result.specified_work_reason_fr ?? specified_work_reason)
    : specified_work_reason;

  // Checklist items
  const checklistItems = isFrench ? [
    "J'ai mon TFN (Tax File Number)",
    "Mon passeport est disponible (page photo + tampons d'entrée)",
    "J'ai toutes mes fiches de paie sauvegardées",
    "J'ai l'ABN de mon employeur",
    "J'ai une lettre d'employeur (ou j'en ai fait la demande)",
    "Je me suis connecté à ImmiAccount",
    "J'ai vérifié mon éligibilité au travail spécifié (88 jours)",
    "J'ai soumis ma demande de renouvellement WHV",
  ] : [
    "I have my TFN (Tax File Number)",
    "My passport is available (photo page + entry stamps)",
    "I have all my payslips saved",
    "I have my employer's ABN",
    "I have an employer letter (or have requested one)",
    "I have logged into ImmiAccount",
    "I have verified my specified work eligibility (88 days)",
    "I have submitted my WHV renewal application",
  ];

  const checkedCount = Object.values(checklist).filter(Boolean).length;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="mt-1 text-xs text-gray-400 flex items-center gap-1">
            <Mail className="h-3 w-3" /> {t("email.sent")} {email}
          </p>
        </div>
        <Button variant="outline" onClick={downloadPdf} disabled={isDownloadingPdf} className="gap-2 flex-shrink-0">
          <Download className="h-4 w-4" />
          {isDownloadingPdf ? t("download.generating") : t("download.pdf")}
        </Button>
      </div>

      {/* ── 1. Days counter ── */}
      <Card className="border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-white overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">
              {isFrench ? "Jours de travail spécifié validés" : "Validated specified work days"}
            </h2>
          </div>

          {/* Counter display */}
          <div className="flex items-end gap-3 mb-3">
            <span className={`text-5xl font-bold tabular-nums ${barTextColor}`}>
              {totalDays}
            </span>
            <span className="text-2xl text-gray-400 font-light mb-1">/ {TARGET_DAYS_2ND}</span>
            <span className="text-sm text-gray-500 mb-2">
              {isFrench ? "jours requis (2ème WHV)" : "days required (2nd WHV)"}
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden mb-2">
            <div
              className={`h-4 rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mb-4">
            <span>0</span>
            <span className="font-medium">{TARGET_DAYS_2ND} {isFrench ? "jours" : "days"}</span>
            <span>{TARGET_DAYS_3RD} {isFrench ? "(3ème WHV)" : "(3rd WHV)"}</span>
          </div>

          {/* Status line */}
          {daysToGo2nd === 0 ? (
            <p className="text-sm font-semibold text-green-700">
              ✅ {isFrench ? "Vous avez atteint les 88 jours requis pour le 2ème WHV." : "You have reached the 88 days required for your 2nd WHV."}
            </p>
          ) : totalDays > 0 ? (
            <p className="text-sm font-semibold text-orange-700">
              ⏳ {isFrench
                ? `Il vous manque encore ${daysToGo2nd} jours pour atteindre les 88 jours requis.`
                : `You still need ${daysToGo2nd} more days to reach the required 88 days.`}
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              {isFrench
                ? "Impossible d'estimer automatiquement — fournissez une fiche de paie avec le total d'heures et les heures par semaine (≥ 35h)."
                : "Cannot estimate automatically — provide a payslip showing total hours and hours per week (≥ 35h)."}
            </p>
          )}

          {/* Employer breakdown — all employers */}
          <div className="mt-4 pt-4 border-t border-blue-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {isFrench ? "Détail par employeur" : "Breakdown by employer"}
            </p>
            <div className="space-y-2">
              {breakdowns.map((emp, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    emp.eligible === true
                      ? "bg-green-50 border border-green-200"
                      : emp.eligible === false
                      ? "bg-red-50 border border-red-200"
                      : "bg-gray-50 border border-gray-200"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {emp.name ?? "—"}{emp.jobTitle ? ` · ${emp.jobTitle}` : ""}
                    </p>
                    <p className="text-xs text-gray-500">
                      {emp.state ?? ""}{emp.postcode ? ` ${emp.postcode}` : ""}
                      {emp.industry ? ` · ${emp.industry}` : ""}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-lg font-bold ${emp.eligible === true ? barTextColor : "text-gray-400"}`}>
                      {emp.days} {isFrench ? "j." : "d."}
                    </p>
                    <p className="text-xs">
                      {emp.eligible === true
                        ? (isFrench ? "✅ qualifié" : "✅ qualifies")
                        : emp.eligible === false
                        ? (isFrench ? "❌ non qualifié" : "❌ non-qualifying")
                        : (isFrench ? "❓ à vérifier" : "❓ to check")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {hasEstimate && daysNotes.length > 0 && (
            <p className="mt-3 text-xs text-gray-400 italic">
              {daysNotes.join(" · ")}
            </p>
          )}
          {!hasEstimate && totalDays === 0 && (
            <p className="mt-2 text-xs text-gray-400">
              {isFrench
                ? "0 jour calculé — les semaines < 35h/sem ne comptent pas comme travail spécifié."
                : "0 days calculated — weeks < 35h/week do not count as specified work."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Eligibility verdict ── */}
      <Card className={`border-2 ${
        specified_work_eligible === true ? "border-green-400" :
        specified_work_eligible === false ? "border-red-300" : "border-yellow-300"
      }`}>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-3xl ${
              specified_work_eligible === true ? "bg-green-100" :
              specified_work_eligible === false ? "bg-red-100" : "bg-yellow-100"
            }`}>
              {specified_work_eligible === true ? "✅" : specified_work_eligible === false ? "❌" : "❓"}
            </div>
            <div className="flex-1">
              <h2 className={`text-xl font-bold mb-1 ${
                specified_work_eligible === true ? "text-green-800" :
                specified_work_eligible === false ? "text-red-800" : "text-yellow-800"
              }`}>
                {specified_work_eligible === true
                  ? (isFrench ? "Vous êtes éligible au 2ème WHV" : "You ARE eligible for your 2nd WHV")
                  : specified_work_eligible === false
                  ? (isFrench ? "Pas encore éligible au 2ème WHV" : "You are NOT yet eligible for your 2nd WHV")
                  : (isFrench ? "Éligibilité à vérifier" : "Eligibility needs verification")}
              </h2>

              {/* Days missing callout */}
              {specified_work_eligible !== true && daysToGo2nd > 0 && (
                <div className="inline-flex items-center gap-2 bg-red-100 text-red-800 rounded-lg px-3 py-1.5 text-sm font-semibold mb-3">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {isFrench
                    ? `Il vous manque ${daysToGo2nd} jours de travail spécifié en zone régionale`
                    : `You need ${daysToGo2nd} more days of specified work in a regional area`}
                </div>
              )}

              <p className="text-sm text-gray-700 mb-3">{verdictReason}</p>

              {/* Job qualification breakdown (primary employer) */}
              {breakdowns.length > 0 && (
                <div className={`rounded-lg p-3 text-sm ${
                  specified_work_eligible === true ? "bg-green-50" :
                  specified_work_eligible === false ? "bg-red-50" : "bg-gray-50"
                }`}>
                  <p className="font-semibold text-gray-800 mb-1">
                    {breakdowns[0].jobTitle ?? breakdowns[0].industry ?? (isFrench ? "Votre emploi" : "Your job")}
                    {breakdowns[0].name ? ` · ${breakdowns[0].name}` : ""}
                  </p>
                  <p className="text-xs text-gray-600">
                    {specified_work_eligible === true
                      ? (isFrench ? "✅ Qualifie comme travail spécifié" : "✅ Qualifies as specified work")
                      : specified_work_eligible === false
                      ? (isFrench ? "❌ Ne qualifie pas comme travail spécifié" : "❌ Does not qualify as specified work")
                      : (isFrench ? "❓ À vérifier avec le service de l'immigration" : "❓ To verify with immigration")}
                  </p>
                  {breakdowns[0].postcode && (
                    <p className="text-xs text-gray-500 mt-1">
                      📍 {breakdowns[0].postcode}{breakdowns[0].state ? `, ${breakdowns[0].state}` : ""}
                      {" — "}
                      {specified_work_eligible === false
                        ? (isFrench ? "zone non régionale ou secteur non qualifiant" : "non-regional area or non-qualifying sector")
                        : (isFrench ? "zone régionale" : "regional area")}
                    </p>
                  )}
                </div>
              )}

              <a
                href="https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 text-xs text-blue-600 hover:underline flex items-center gap-1 w-fit"
              >
                <ExternalLink className="h-3 w-3" />
                {isFrench ? "Voir les règles officielles (immi.homeaffairs.gov.au)" : "Official specified work rules (immi.homeaffairs.gov.au)"}
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 3. Extracted data — grouped ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            {t("extractedData.title")}
          </CardTitle>
          <p className="text-xs text-gray-400">
            {isFrench ? "⚠️ = valeur à faible confiance — vérifiez manuellement" : "⚠️ = low confidence field — verify manually"}
          </p>
        </CardHeader>
        <CardContent className="p-0">

          {/* 👤 Personal Info */}
          <SectionHeader icon="👤" title={isFrench ? "Informations personnelles" : "Personal info"} />
          <FieldRow
            icon={<User className="h-4 w-4" />}
            label={fieldLabels.fullName}
            value={fields.fullName}
            hint={immiHints.fullName}
            confidence={confidence_scores.fullName ?? 1}
            copiedKey={copiedField === "fullName" ? "copied" : "fullName"}
            onCopy={copyToClipboard}
            isFrench={isFrench}
          />

          {/* 🏢 Employer */}
          <SectionHeader icon="🏢" title={isFrench ? "Employeur" : "Employer"} />
          {(["employerName", "employerAbn", "jobTitle", "employmentType", "industry"] as const).map((f) => (
            <FieldRow
              key={f}
              icon={f === "employerName" ? <Building2 className="h-4 w-4" /> : f === "industry" ? <Briefcase className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              label={fieldLabels[f]}
              value={fields[f]}
              hint={immiHints[f]}
              confidence={confidence_scores[f] ?? 1}
              copiedKey={copiedField === f ? "copied" : f}
              onCopy={copyToClipboard}
              isFrench={isFrench}
            />
          ))}

          {/* 💰 Pay */}
          <SectionHeader icon="💰" title={isFrench ? "Rémunération" : "Pay"} />
          {(["payPeriod", "grossIncome", "hoursPerWeek", "totalHours"] as const).map((f) => (
            <FieldRow
              key={f}
              icon={f === "grossIncome" ? <DollarSign className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
              label={fieldLabels[f]}
              value={fields[f]}
              hint={immiHints[f]}
              confidence={confidence_scores[f] ?? 1}
              copiedKey={copiedField === f ? "copied" : f}
              onCopy={copyToClipboard}
              isFrench={isFrench}
            />
          ))}

          {/* 📍 Location & Dates */}
          <SectionHeader icon="📍" title={isFrench ? "Lieu & Dates" : "Location & Dates"} />
          {(["startDate", "postcode", "state"] as const).map((f) => (
            <FieldRow
              key={f}
              icon={f === "startDate" ? <Calendar className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
              label={fieldLabels[f]}
              value={fields[f]}
              hint={immiHints[f]}
              confidence={confidence_scores[f] ?? 1}
              copiedKey={copiedField === f ? "copied" : f}
              onCopy={copyToClipboard}
              isFrench={isFrench}
            />
          ))}

          {/* ✅ Eligibility */}
          <SectionHeader icon="✅" title={isFrench ? "Travail spécifié" : "Specified work"} />
          <FieldRow
            icon={<CheckCircle2 className="h-4 w-4" />}
            label={fieldLabels.specifiedWork}
            value={fields.specifiedWork}
            hint={immiHints.specifiedWork}
            confidence={confidence_scores.specifiedWork ?? 1}
            copiedKey={copiedField === "specifiedWork" ? "copied" : "specifiedWork"}
            onCopy={copyToClipboard}
            isFrench={isFrench}
          />
        </CardContent>
      </Card>

      {/* ── Missing fields notice ── */}
      {missing_fields.length > 0 && (
        <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-200 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800 text-sm">
              {isFrench ? "Champs non extraits" : "Fields not extracted"}
            </p>
            <p className="text-sm text-yellow-700 mt-1">
              {missing_fields.map((f) => fieldLabels[f as keyof ExtractedFields] || f).join(", ")}
              {" — "}
              {isFrench ? "à saisir manuellement dans ImmiAccount." : "enter these manually in ImmiAccount."}
            </p>
          </div>
        </div>
      )}

      {/* ── Employer email generator ── */}
      {fields.employerName && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-5 w-5 text-blue-600" />
              {isFrench ? "Email à envoyer à l'employeur" : "Email to send to your employer"}
            </CardTitle>
            <p className="text-sm text-gray-500">
              {isFrench
                ? "Modèle prêt à envoyer pour demander vos fiches de paie ou lettre d'employeur."
                : "Ready-to-send template to request payslips or employer letter."}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              {(["fr", "en"] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setEmailLang(lang)}
                  className={`px-3 py-1 rounded-md text-sm font-medium border transition-colors ${emailLang === lang ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}
                >
                  {lang === "fr" ? "🇫🇷 Français" : "🇬🇧 English"}
                </button>
              ))}
            </div>
            <pre className="whitespace-pre-wrap text-sm bg-gray-50 rounded-lg p-4 border border-gray-200 font-sans leading-relaxed text-gray-800">
              {generateEmployerEmail(emailLang, fields.employerName, fields.fullName, missing_fields)}
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  generateEmployerEmail(emailLang, fields.employerName!, fields.fullName, missing_fields)
                );
                setEmailCopied(true);
                setTimeout(() => setEmailCopied(false), 2000);
              }}
            >
              {emailCopied
                ? <><Check className="h-4 w-4 text-green-600" />{isFrench ? "Copié !" : "Copied!"}</>
                : <><Copy className="h-4 w-4" />{isFrench ? "Copier l'email" : "Copy email"}</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step-by-step guide ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            {t("guide.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <GuideStep number={1} title={t("guide.step1.title")} description={t("guide.step1.description")}>
            <a href={visaUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors">
              <ExternalLink className="h-4 w-4" /> {`WHV ${visaType} — immi.homeaffairs.gov.au`}
            </a>
          </GuideStep>
          <GuideStep number={2} title={t("guide.step2.title")} description={t("guide.step2.description")}>
            <a href="https://online.immi.gov.au/lusc/login" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors">
              <ExternalLink className="h-4 w-4" /> ImmiAccount Login
            </a>
          </GuideStep>
          <GuideStep number={3} title={t("guide.step3.title")} description={t("guide.step3.description")}>
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 space-y-1">
              <p>1. {isFrench ? "Cliquez sur" : "Click"} <strong>&quot;New application&quot;</strong></p>
              <p>2. {isFrench ? "Sélectionnez" : "Select"} <strong>&quot;Working Holiday&quot;</strong></p>
              <p>3. {isFrench ? "Choisissez la sous-classe" : "Choose subclass"} <strong>{visaType}</strong></p>
            </div>
          </GuideStep>
          <GuideStep number={4} title={t("guide.step4.title")} description={t("guide.step4.description")}>
            <div className="space-y-2">
              {(Object.keys(fields) as (keyof ExtractedFields)[]).filter((f) => fields[f]).map((f) => (
                <div key={f} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500">{immiHints[f]}</p>
                    <p className="text-sm font-mono font-semibold text-gray-900 truncate">{fields[f]}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="flex-shrink-0 gap-1.5"
                    onClick={() => copyToClipboard(fields[f]!, f + "_g")}>
                    {copiedField === f + "_g" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ))}
            </div>
          </GuideStep>
          <GuideStep number={5} title={t("guide.step5.title")} description={t("guide.step5.description")}>
            <div className="bg-blue-50 rounded-lg p-3 space-y-1.5">
              {[
                isFrench ? "✅ Fiche de paie (payslip)" : "✅ Payslip",
                isFrench ? "✅ Lettre d'employeur (si disponible)" : "✅ Employer letter (if available)",
                isFrench ? "✅ Passeport (page photo + tampons)" : "✅ Passport (photo page + stamps)",
                isFrench ? "✅ Casier judiciaire (si demandé)" : "✅ Police clearance (if requested)",
              ].map((item, i) => <p key={i} className="text-sm text-blue-800">{item}</p>)}
            </div>
          </GuideStep>
          <GuideStep number={6} title={t("guide.step6.title")} description={t("guide.step6.description")}>
            <div className="flex gap-3 flex-wrap">
              <a href="https://www.abn.business.gov.au/" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                <ExternalLink className="h-3.5 w-3.5" /> {isFrench ? "Vérifier un ABN" : "Verify ABN"}
              </a>
              <a href="https://www.fairwork.gov.au/" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                <ExternalLink className="h-3.5 w-3.5" /> Fair Work Australia
              </a>
            </div>
          </GuideStep>
        </CardContent>
      </Card>

      {/* ── Interactive checklist ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            {isFrench ? "Ma checklist de renouvellement" : "My renewal checklist"}
          </CardTitle>
          <p className="text-sm text-gray-500">
            {isFrench ? "Cochez chaque étape au fur et à mesure." : "Tick each item as you go."}
          </p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {checklistItems.map((item, i) => (
              <li key={i} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setChecklist((prev) => ({ ...prev, [i]: !prev[i] }))}
                  className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${checklist[i] ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-green-400"}`}
                  aria-label={checklist[i] ? (isFrench ? "Décocher" : "Uncheck") : (isFrench ? "Cocher" : "Check")}
                >
                  {checklist[i] && <Check className="h-3.5 w-3.5 text-white" />}
                </button>
                <span className={`text-sm ${checklist[i] ? "line-through text-gray-400" : "text-gray-700"}`}>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${(checkedCount / checklistItems.length) * 100}%` }} />
            </div>
            <span className="text-xs text-gray-400">{checkedCount}/{checklistItems.length}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Official links ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{isFrench ? "Liens officiels" : "Official links"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { label: `WHV ${visaType} Official Page`, href: visaUrl },
              { label: "ImmiAccount Login", href: "https://online.immi.gov.au/lusc/login" },
              { label: "Specified Work Rules", href: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work" },
              { label: "ABN Lookup", href: "https://www.abn.business.gov.au/" },
              { label: "Fair Work Australia", href: "https://www.fairwork.gov.au/" },
            ].map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors">
                <ExternalLink className="h-4 w-4 text-blue-500 flex-shrink-0" />
                {link.label}
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Download CTA ── */}
      <div className="flex flex-col sm:flex-row gap-3 pb-6">
        <Button size="lg" onClick={downloadPdf} disabled={isDownloadingPdf} className="gap-2 flex-1">
          <Download className="h-5 w-5" />
          {isDownloadingPdf ? t("download.generating") : t("download.pdf")}
        </Button>
        <p className="flex items-center gap-2 text-sm text-gray-500 sm:flex-1 justify-center">
          <Mail className="h-4 w-4" /> {t("email.sent")} <strong>{email}</strong>
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 px-5 py-2.5 bg-gray-50 border-y border-gray-100">
      <span className="text-base">{icon}</span>
      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{title}</span>
    </div>
  );
}

function GuideStep({ number, title, description, children }: {
  number: number; title: string; description: string; children?: React.ReactNode;
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
