"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AnalysisResult, ExtractedFields, EmployerData, PayslipRecord } from "@/lib/supabase";
import {
  CheckCircle2,
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
  ChevronDown,
  ChevronUp,
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

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseDDMMYYYY(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

function calendarDaysInclusive(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

// Standard full-time thresholds (Australian NES / WHV official guidance)
const STANDARD_HOURS_PER_DAY = 7.6;   // 38h full-time week ÷ 5 days
const FULL_TIME_HOURS_PER_WEEK = 35;  // threshold for counting full pay period

function parseHours(hoursStr: string | null): number | null {
  if (!hoursStr) return null;
  // Handle "HH:MM" time notation
  const timeMatch = hoursStr.match(/^(\d+):(\d{2})$/);
  if (timeMatch) return parseInt(timeMatch[1]) + parseInt(timeMatch[2]) / 60;
  // Handle numeric with optional unit: "39.00", "39h", "39 hours"
  const numMatch = hoursStr.match(/(\d+\.?\d*)/);
  if (numMatch) {
    const n = parseFloat(numMatch[1]);
    return isNaN(n) || n < 0 ? null : n;
  }
  return null;
}

type PayslipDaysResult = {
  days: number;
  periodDays: number;
  hoursWorked: number | null;
  avgHoursPerWeek: number | null;
  isFullTime: boolean;
  isFallback: boolean;
};

function calcPayslipDays(p: PayslipRecord): PayslipDaysResult | null {
  const start = parseDDMMYYYY(p.payPeriodStart);
  const end = parseDDMMYYYY(p.payPeriodEnd);
  if (!start || !end || end < start) return null;
  const periodDays = calendarDaysInclusive(start, end);
  const hours = parseHours(p.hoursWorked);
  if (hours !== null && periodDays > 0) {
    const avgHoursPerWeek = hours / (periodDays / 7);
    if (avgHoursPerWeek >= FULL_TIME_HOURS_PER_WEEK) {
      return { days: periodDays, periodDays, hoursWorked: hours, avgHoursPerWeek, isFullTime: true, isFallback: false };
    }
    // Part-time: count equivalent full-time days, capped at period length
    const equivalentDays = Math.max(0, Math.min(Math.round(hours / STANDARD_HOURS_PER_DAY), periodDays));
    return { days: equivalentDays, periodDays, hoursWorked: hours, avgHoursPerWeek, isFullTime: false, isFallback: false };
  }
  // No hours data — fall back to calendar days (conservative, same as before)
  return { days: periodDays, periodDays, hoursWorked: null, avgHoursPerWeek: null, isFullTime: true, isFallback: true };
}

// ─── Day calculation (WHV official rule: actual work days based on hours worked) ─

type DaysResult = { days: number; note: string; isEstimate: boolean };

function calculateQualifyingDays(employer: EmployerData, isFrench: boolean): DaysResult {
  if (employer.specified_work_eligible !== true) {
    return { days: 0, note: "", isEstimate: false };
  }

  // Method 1: per-payslip hours-based calculation
  // Rule: count actual working days (hours worked ÷ 7.6), not elapsed pay period length.
  // If avg hours/week ≥ 35h → full period counts. Otherwise → equivalent days only.
  const payslips = employer.payslips ?? [];
  if (payslips.length > 0) {
    let totalDays = 0;
    let hasAnyPeriodData = false;
    for (const p of payslips) {
      const result = calcPayslipDays(p);
      if (result) {
        totalDays += result.days;
        hasAnyPeriodData = true;
      }
    }
    if (hasAnyPeriodData) {
      const n = payslips.length;
      const note = isFrench
        ? `${n} fiche${n > 1 ? "s" : ""} de paie · ${employer.startDate ?? "?"} → ${employer.endDate ?? "?"}`
        : `${n} payslip${n > 1 ? "s" : ""} · ${employer.startDate ?? "?"} → ${employer.endDate ?? "?"}`;
      return { days: totalDays, note, isEstimate: false };
    }
  }

  // Method 2: employer start → end date
  if (employer.startDate && employer.endDate) {
    const s = parseDDMMYYYY(employer.startDate);
    const e = parseDDMMYYYY(employer.endDate);
    if (s && e && e >= s) {
      const days = calendarDaysInclusive(s, e);
      const note = isFrench
        ? `Estimation : ${employer.startDate} → ${employer.endDate}`
        : `Estimate: ${employer.startDate} → ${employer.endDate}`;
      return { days, note, isEstimate: true };
    }
  }

  return { days: 0, note: "", isEstimate: false };
}

// ─── Verdict logic (Problem 1 fix: based on totalDays, not AI flag) ──────────

type VerdictKey = "eligible3rd" | "eligible2nd" | "insufficient" | "not_qualifying" | "unknown";

function computeVerdict(
  totalDays: number,
  anyEligible: boolean,
  allDisqualified: boolean
): VerdictKey {
  if (totalDays >= 179) return "eligible3rd";
  if (totalDays >= 88) return "eligible2nd";
  if (anyEligible) return "insufficient";
  if (allDisqualified) return "not_qualifying";
  return "unknown";
}

// ─── Email generator ──────────────────────────────────────────────────────────

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

// ─── Upgrade letter email generator ──────────────────────────────────────────

function generateUpgradeLetterEmail(
  lang: "fr" | "en",
  employerName: string | null,
  jobTitle: string | null,
  fullName: string | null
): string {
  const name = fullName ?? (lang === "fr" ? "[Votre Prénom Nom]" : "[Your Full Name]");
  const empName = employerName ?? (lang === "fr" ? "[Nom de l'employeur]" : "[Employer Name]");

  if (lang === "fr") {
    return `Objet : Confirmation de travail spécifié — WHV 417

Bonjour,

Je me permets de vous contacter afin d'obtenir une confirmation écrite de mon emploi, nécessaire pour ma demande de renouvellement de Working Holiday Visa (sous-classe 417) auprès du Department of Home Affairs australien.

Pourriez-vous me fournir une lettre officielle confirmant les informations suivantes :
• Nature exacte du travail effectué (type de chantier : construction, infrastructure minière, zone de reconstruction post-catastrophe, etc.)
• Lieu de travail exact (adresse du chantier, pas du siège social) et code postal
• Dates exactes d'emploi (début et fin)
• Nombre moyen d'heures travaillées par semaine
• Mon titre de poste${jobTitle ? ` (${jobTitle})` : ""}
• ABN de votre entreprise
• Signature et cachet de l'employeur

Ces informations sont requises pour prouver que mon travail constitue du « travail spécifié » (specified work) en zone régionale australienne.

Je vous remercie par avance pour votre aide.

Cordialement,
${name}`;
  }

  return `Subject: Specified work confirmation — WHV 417

Dear ${empName} team,

I am writing to request a written confirmation of my employment, required for my Working Holiday Visa (subclass 417) renewal application with the Australian Department of Home Affairs.

Could you please provide an official letter confirming the following details:
• Exact nature of work performed (e.g. construction site, mining infrastructure project, disaster recovery zone)
• Exact work location (site address, not company HQ) and postcode
• Exact dates of employment (start and end dates)
• Average weekly hours worked
• My job title${jobTitle ? ` (${jobTitle})` : ""}
• Your company's ABN
• Employer signature and stamp

This information is required to demonstrate that my work qualifies as "specified work" in a regional area of Australia under the Working Holiday Maker program.

Thank you in advance for your assistance.

Kind regards,
${name}`;
}

// ─── FieldRow ─────────────────────────────────────────────────────────────────

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
  const lowConf = !missing && confidence < 0.5;
  return (
    <div className="flex items-start gap-3 py-4 px-5 border-b border-gray-100 last:border-0">
      <div className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
          {lowConf && (
            <span
              title={isFrench ? "Vérifiez ce champ manuellement" : "Please verify this field manually"}
              className="cursor-help text-amber-500"
            >⚠️</span>
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
        >
          {copiedKey === "copied" ? (
            <><Check className="h-3.5 w-3.5 text-green-600" /><span className="text-green-600">✓</span></>
          ) : (
            <><Copy className="h-3.5 w-3.5" />{isFrench ? "Copier" : "Copy"}</>
          )}
        </button>
      )}
    </div>
  );
}

// ─── PayslipCard (Problem 3 fix) ──────────────────────────────────────────────

function PayslipCard({
  payslip,
  index,
  employerQualifies,
  isFrench,
  copiedField,
  onCopy,
}: {
  payslip: PayslipRecord;
  index: number;
  employerQualifies: boolean | null | "maybe";
  isFrench: boolean;
  copiedField: string | null;
  onCopy: (v: string, k: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const key = (f: string) => `ps_${index}_${f}`;
  const copied = (f: string) => copiedField === key(f) ? "copied" : key(f);

  const start = parseDDMMYYYY(payslip.payPeriodStart);
  const end = parseDDMMYYYY(payslip.payPeriodEnd);
  const periodDays = start && end && end >= start ? calendarDaysInclusive(start, end) : null;
  const payslipResult = calcPayslipDays(payslip);

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3 text-left">
          <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {isFrench ? `Fiche de paie #${index + 1}` : `Payslip #${index + 1}`}
              {payslip.employerName ? ` — ${payslip.employerName}` : ""}
            </p>
            {payslip.payPeriodStart && payslip.payPeriodEnd && (
              <p className="text-xs text-gray-500">
                {payslip.payPeriodStart} → {payslip.payPeriodEnd}
                {employerQualifies === true && payslipResult !== null ? (
                  <span className={`ml-2 font-semibold ${payslipResult.days > 0 ? "text-green-700" : "text-gray-400"}`}>
                    ({payslipResult.days} {isFrench ? "j. validés" : "d. validated"}{payslipResult.days > 0 ? " ✅" : ""})
                  </span>
                ) : periodDays !== null ? (
                  <span className="ml-2 font-semibold text-gray-500">
                    ({periodDays} {isFrench ? "jours" : "days"})
                  </span>
                ) : null}
              </p>
            )}
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="divide-y divide-gray-50">
          {[
            { label: isFrench ? "Période de paie" : "Pay period", value: payslip.payPeriodStart && payslip.payPeriodEnd ? `${payslip.payPeriodStart} → ${payslip.payPeriodEnd}` : null, icon: <Calendar className="h-4 w-4" />, f: "period", isJobTitle: false },
            { label: isFrench ? "Heures travaillées" : "Hours worked", value: payslip.hoursWorked, icon: <Clock className="h-4 w-4" />, f: "hours", isJobTitle: false },
            { label: isFrench ? "Salaire brut" : "Gross pay", value: payslip.grossPay, icon: <DollarSign className="h-4 w-4" />, f: "gross", isJobTitle: false },
            { label: isFrench ? "Titre du poste" : "Job title", value: payslip.jobTitle, icon: <Briefcase className="h-4 w-4" />, f: "title", isJobTitle: true },
            { label: "ABN", value: payslip.employerAbn, icon: <Building2 className="h-4 w-4" />, f: "abn", isJobTitle: false },
            { label: isFrench ? "Code postal / État" : "Postcode / State", value: [payslip.postcode, payslip.state].filter(Boolean).join(", ") || null, icon: <MapPin className="h-4 w-4" />, f: "loc", isJobTitle: false },
            { label: isFrench ? "Secteur" : "Industry", value: payslip.industry, icon: <Briefcase className="h-4 w-4" />, f: "ind", isJobTitle: false },
          ].map(({ label, value, icon, f, isJobTitle }) =>
            value ? (
              <div key={f} className="flex items-center gap-3 px-4 py-2.5 bg-white">
                <span className="text-gray-400 flex-shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400">{label}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-mono font-semibold text-gray-900">{value}</p>
                    {isJobTitle && employerQualifies === false && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold flex-shrink-0">
                        ❌ {isFrench ? "non qualifiant" : "non-qualifying"}
                      </span>
                    )}
                    {isJobTitle && employerQualifies === "maybe" && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold flex-shrink-0">
                        ⚠️ {isFrench ? "à confirmer" : "to confirm"}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onCopy(value!, key(f))}
                  className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-700 transition-colors text-xs"
                >
                  {copied(f) === "copied" ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            ) : null
          )}

          {/* Validated days summary — only for qualifying employers */}
          {employerQualifies === true && payslipResult !== null && (
            <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-start gap-2">
              <span className="text-sm flex-shrink-0 mt-px">
                {payslipResult.isFallback ? "ℹ️" : payslipResult.isFullTime ? "✅" : "⚠️"}
              </span>
              <p className="text-xs leading-snug">
                {payslipResult.isFallback ? (
                  <span className="text-gray-500">
                    {isFrench
                      ? `Heures non disponibles — ${payslipResult.periodDays} jours comptés (période complète)`
                      : `Hours not available — ${payslipResult.periodDays} days counted (full period)`}
                  </span>
                ) : payslipResult.isFullTime ? (
                  <span className="text-green-700 font-semibold">
                    {isFrench
                      ? `Plein temps (${payslipResult.avgHoursPerWeek!.toFixed(1)} h/sem) — ${payslipResult.days} jour${payslipResult.days !== 1 ? "s" : ""} validé${payslipResult.days !== 1 ? "s" : ""}`
                      : `Full time (${payslipResult.avgHoursPerWeek!.toFixed(1)} h/week) — ${payslipResult.days} validated day${payslipResult.days !== 1 ? "s" : ""}`}
                  </span>
                ) : (
                  <span className="text-amber-700 font-semibold">
                    {isFrench
                      ? `Temps partiel (${payslipResult.avgHoursPerWeek!.toFixed(1)} h/sem) — ${payslipResult.days} jour${payslipResult.days !== 1 ? "s" : ""} validé${payslipResult.days !== 1 ? "s" : ""} sur ${payslipResult.periodDays} jours de période`
                      : `Part time (${payslipResult.avgHoursPerWeek!.toFixed(1)} h/week) — ${payslipResult.days} day${payslipResult.days !== 1 ? "s" : ""} validated out of ${payslipResult.periodDays}-day period`}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── UpgradeBox ───────────────────────────────────────────────────────────────

function UpgradeBox({
  employer,
  fullName,
  isFrench,
}: {
  employer: EmployerData;
  fullName: string | null;
  isFrench: boolean;
}) {
  const [lang, setLang] = useState<"fr" | "en">(isFrench ? "fr" : "en");
  const [copied, setCopied] = useState(false);

  const potentialDays = calculateQualifyingDays(
    { ...employer, specified_work_eligible: true },
    isFrench
  ).days;

  const emailText = generateUpgradeLetterEmail(lang, employer.employerName, employer.jobTitle, fullName);

  return (
    <div className="mt-1 mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0">💡</span>
        <div>
          <p className="font-semibold text-amber-900 text-sm">
            {isFrench ? "Possibilité d'upgrade — lettre d'employeur requise" : "Upgrade possible — employer letter required"}
          </p>
          <p className="text-xs text-amber-800 mt-1 leading-relaxed">
            {isFrench
              ? `Ce travail (${employer.industry ?? "travaux"}) peut qualifier comme travail spécifié sous la catégorie "Construction" s'il a été réalisé sur un chantier de construction, une infrastructure minière, ou une zone de reconstruction post-catastrophe en zone régionale. Une lettre d'employeur confirmant le type de chantier suffit.`
              : `This work (${employer.industry ?? "civil works"}) may qualify as specified work under "Construction" if performed on a construction site, mining infrastructure project, or disaster recovery zone in a regional area. An employer letter confirming the site type is sufficient.`}
          </p>
          {potentialDays > 0 && (
            <p className="text-xs font-semibold text-amber-900 mt-2">
              📅{" "}
              {isFrench
                ? `Avec cette lettre, ce travail pourrait ajouter ${potentialDays} jours qualifiants à votre total.`
                : `With this letter, this work could add ${potentialDays} qualifying days to your total.`}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-amber-200 pt-3">
        <p className="text-xs font-semibold text-amber-800 mb-2">
          {isFrench ? "Modèle d'email à envoyer à votre employeur :" : "Email template to send to your employer:"}
        </p>
        <div className="flex gap-2 mb-2">
          {(["fr", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                lang === l
                  ? "bg-amber-600 text-white border-amber-600"
                  : "bg-white text-amber-700 border-amber-300 hover:border-amber-500"
              }`}
            >
              {l === "fr" ? "🇫🇷 Français" : "🇬🇧 English"}
            </button>
          ))}
        </div>
        <pre className="whitespace-pre-wrap text-xs bg-white rounded-lg p-3 border border-amber-200 font-sans leading-relaxed text-gray-800 max-h-64 overflow-y-auto">
          {emailText}
        </pre>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(emailText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-700 text-xs font-medium hover:bg-amber-50 transition-colors"
        >
          {copied
            ? <><Check className="h-3.5 w-3.5 text-green-600" />{isFrench ? "Copié !" : "Copied!"}</>
            : <><Copy className="h-3.5 w-3.5" />{isFrench ? "Copier l'email" : "Copy email"}</>}
        </button>
      </div>
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

  const { fields, confidence_scores, missing_fields } = result;
  const employers: EmployerData[] = result.employers ?? [];

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

  // ── Days calculation ──────────────────────────────────────────────────────
  const TARGET_2ND = 88;
  const TARGET_3RD = 179;

  const employerDays = employers.map((emp) => ({
    employer: emp,
    ...calculateQualifyingDays(emp, isFrench),
  }));

  // For old records with no employers array, fall back to result fields
  const singleFallback = employers.length === 0 && result.specified_work_eligible === true;
  let totalDays = employerDays.reduce((s, e) => s + e.days, 0);
  let fallbackNote = "";
  if (singleFallback && fields.startDate) {
    const s = parseDDMMYYYY(fields.startDate);
    const now = new Date();
    if (s && now > s) {
      totalDays = calendarDaysInclusive(s, now);
      fallbackNote = isFrench ? `Depuis le ${fields.startDate}` : `Since ${fields.startDate}`;
    }
  }

  const anyEligible = employers.length > 0
    ? employers.some((e) => e.specified_work_eligible === true)
    : result.specified_work_eligible === true;
  const allDisqualified = employers.length > 0
    ? employers.every((e) => e.specified_work_eligible === false && !e.upgrade_possible)
    : result.specified_work_eligible === false;

  const verdictKey = computeVerdict(totalDays, anyEligible, allDisqualified);
  const daysToGo2nd = Math.max(0, TARGET_2ND - totalDays);
  const pct2nd = Math.min(100, Math.round((totalDays / TARGET_2ND) * 100));
  const barColor = pct2nd >= 100 ? "bg-green-500" : pct2nd >= 80 ? "bg-yellow-400" : pct2nd >= 33 ? "bg-orange-400" : "bg-red-400";
  const daysTextColor = totalDays > 0 ? "text-green-700" : "text-red-500";

  // Verdict labels
  const verdictConfig: Record<VerdictKey, { icon: string; bgClass: string; borderClass: string; titleClass: string; title: string }> = {
    eligible3rd: {
      icon: "🏆",
      bgClass: "bg-green-100",
      borderClass: "border-green-400",
      titleClass: "text-green-800",
      title: isFrench ? "Éligible au 3ème WHV !" : "Eligible for 3rd WHV!",
    },
    eligible2nd: {
      icon: "✅",
      bgClass: "bg-green-100",
      borderClass: "border-green-400",
      titleClass: "text-green-800",
      title: isFrench ? "Éligible au 2ème WHV" : "Eligible for 2nd WHV",
    },
    insufficient: {
      icon: "⏳",
      bgClass: "bg-orange-50",
      borderClass: "border-orange-300",
      titleClass: "text-orange-800",
      title: isFrench
        ? `Pas encore éligible — ${daysToGo2nd} jours manquants`
        : `Not yet eligible — ${daysToGo2nd} more days needed`,
    },
    not_qualifying: {
      icon: "❌",
      bgClass: "bg-red-50",
      borderClass: "border-red-300",
      titleClass: "text-red-800",
      title: isFrench ? "Travail non qualifiant pour le WHV" : "Work does not qualify for WHV",
    },
    unknown: {
      icon: "❓",
      bgClass: "bg-yellow-50",
      borderClass: "border-yellow-300",
      titleClass: "text-yellow-800",
      title: isFrench ? "Éligibilité à vérifier" : "Eligibility needs verification",
    },
  };
  const vc = verdictConfig[verdictKey];

  // Primary reason text (FR-aware)
  const primary = employers.find((e) => e.specified_work_eligible === true) ?? employers[0];
  const verdictReason = primary
    ? (isFrench ? (primary.specified_work_reason_fr ?? primary.specified_work_reason) : primary.specified_work_reason)
    : (isFrench ? (result.specified_work_reason_fr ?? result.specified_work_reason) : result.specified_work_reason);

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

          <div className="flex items-end gap-3 mb-3">
            <span className={`text-5xl font-bold tabular-nums ${daysTextColor}`}>{totalDays}</span>
            <span className="text-2xl text-gray-400 font-light mb-1">/ {TARGET_2ND}</span>
            <span className="text-sm text-gray-500 mb-2">
              {isFrench ? "jours requis (2ème WHV)" : "days required (2nd WHV)"}
            </span>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden mb-2">
            <div className={`h-4 rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct2nd}%` }} />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mb-4">
            <span>0</span>
            <span className="font-medium">{TARGET_2ND} {isFrench ? "jours" : "days"}</span>
            <span>{TARGET_3RD} {isFrench ? "(3ème WHV)" : "(3rd WHV)"}</span>
          </div>

          {totalDays >= TARGET_2ND ? (
            <p className="text-sm font-semibold text-green-700">
              ✅ {isFrench ? `${totalDays} jours validés — seuil de ${TARGET_2ND} jours atteint !` : `${totalDays} days validated — ${TARGET_2ND}-day threshold reached!`}
            </p>
          ) : anyEligible ? (
            <p className="text-sm font-semibold text-orange-700">
              ⏳ {isFrench
                ? `${totalDays} jours validés — encore ${daysToGo2nd} jours avant le seuil de ${TARGET_2ND} jours.`
                : `${totalDays} days validated — ${daysToGo2nd} more days needed to reach ${TARGET_2ND}.`}
            </p>
          ) : totalDays > 0 ? (
            <p className="text-sm text-gray-500">
              {isFrench ? "Vérifiez que votre travail est bien du travail spécifié en zone régionale." : "Verify your work qualifies as regional specified work."}
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              {isFrench
                ? "Aucun jour calculé — fournissez des fiches de paie avec les dates de période de paie."
                : "No days calculated — provide payslips with pay period dates."}
            </p>
          )}

          {/* Per-employer breakdown */}
          {(employerDays.length > 0 || fallbackNote) && (
            <div className="mt-4 pt-4 border-t border-blue-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {isFrench ? "Détail par employeur" : "Breakdown by employer"}
              </p>
              <div className="space-y-2">
                {employerDays.map((e, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-lg ${
                      e.employer.specified_work_eligible === true
                        ? "bg-green-50 border border-green-200"
                        : e.employer.upgrade_possible
                        ? "bg-amber-50 border border-amber-200"
                        : "bg-red-50 border border-red-200"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {e.employer.employerName ?? "—"}{e.employer.jobTitle ? ` · ${e.employer.jobTitle}` : ""}
                      </p>
                      <p className="text-xs text-gray-500">
                        {e.employer.state ?? ""}{e.employer.postcode ? ` ${e.employer.postcode}` : ""}
                        {e.employer.industry ? ` · ${e.employer.industry}` : ""}
                      </p>
                      {e.note && <p className="text-xs text-gray-400 italic">{e.note}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-lg font-bold ${e.employer.specified_work_eligible === true ? daysTextColor : "text-gray-400"}`}>
                        {e.days} {isFrench ? "j." : "d."}
                      </p>
                      <p className="text-xs">
                        {e.employer.specified_work_eligible === true
                          ? (isFrench ? "✅ qualifié" : "✅ qualifies")
                          : e.employer.upgrade_possible
                          ? (isFrench ? "⚠️ potentiel" : "⚠️ potential")
                          : (isFrench ? "❌ non qualifié" : "❌ non-qualifying")}
                      </p>
                    </div>
                  </div>
                ))}
                {singleFallback && fallbackNote && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">{fields.employerName ?? "—"}</p>
                      <p className="text-xs text-gray-400 italic">{fallbackNote}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${daysTextColor}`}>{totalDays} {isFrench ? "j." : "d."}</p>
                      <p className="text-xs text-green-600">✅ {isFrench ? "qualifié" : "qualifies"}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Eligibility verdict (Problem 1 fix: driven by totalDays) ── */}
      <Card className={`border-2 ${vc.borderClass}`}>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-3xl ${vc.bgClass}`}>
              {vc.icon}
            </div>
            <div className="flex-1">
              <h2 className={`text-xl font-bold mb-1 ${vc.titleClass}`}>{vc.title}</h2>

              {/* Missing days callout */}
              {(verdictKey === "insufficient") && daysToGo2nd > 0 && (
                <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-800 rounded-lg px-3 py-1.5 text-sm font-semibold mb-3">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {isFrench
                    ? `Il vous manque ${daysToGo2nd} jours de travail spécifié en zone régionale`
                    : `You need ${daysToGo2nd} more days of specified work in a regional area`}
                </div>
              )}

              <p className="text-sm text-gray-700 mb-3">{verdictReason}</p>

              {/* Job qualification row */}
              {(primary || employers[0]) && (() => {
                const emp = primary ?? employers[0];
                return (
                  <div className={`rounded-lg p-3 text-sm ${
                    emp.specified_work_eligible === true ? "bg-green-50" :
                    emp.upgrade_possible ? "bg-amber-50" : "bg-red-50"
                  }`}>
                    <p className="font-semibold text-gray-800 mb-1">
                      {emp.jobTitle ?? emp.industry ?? (isFrench ? "Votre emploi" : "Your job")}
                      {emp.employerName ? ` · ${emp.employerName}` : ""}
                    </p>
                    <p className="text-xs text-gray-600">
                      {emp.specified_work_eligible === true
                        ? (isFrench ? "✅ Qualifie comme travail spécifié" : "✅ Qualifies as specified work")
                        : emp.upgrade_possible
                        ? (isFrench ? "⚠️ Potentiellement qualifiant — lettre d'employeur requise" : "⚠️ Potentially qualifying — employer letter required")
                        : (isFrench ? "❌ Ne qualifie pas comme travail spécifié" : "❌ Does not qualify as specified work")}
                    </p>
                    {emp.postcode && (
                      <p className="text-xs text-gray-500 mt-1">
                        📍 {emp.postcode}{emp.state ? `, ${emp.state}` : ""}
                        {" — "}
                        {emp.specified_work_eligible === true
                          ? (isFrench ? "zone régionale" : "regional area")
                          : emp.upgrade_possible
                          ? (isFrench ? "zone régionale — type de chantier à confirmer" : "regional area — site type to confirm")
                          : (isFrench ? "zone non régionale ou secteur non qualifiant" : "non-regional area or non-qualifying sector")}
                      </p>
                    )}
                  </div>
                );
              })()}

              <a
                href="https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 text-xs text-blue-600 hover:underline flex items-center gap-1 w-fit"
              >
                <ExternalLink className="h-3 w-3" />
                {isFrench ? "Règles officielles du travail spécifié (immi.homeaffairs.gov.au)" : "Official specified work rules (immi.homeaffairs.gov.au)"}
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 3. Extracted data — per payslip (Problem 3 fix) ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            {t("extractedData.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-2">

          {/* Personal info once */}
          {fields.fullName && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100 mb-4">
              <User className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-gray-500">{fieldLabels.fullName}</p>
                <p className="text-sm font-semibold font-mono text-gray-900">{fields.fullName}</p>
              </div>
              <button
                onClick={() => copyToClipboard(fields.fullName!, "fullName")}
                className="flex items-center gap-1 px-2 py-1 rounded border border-blue-200 text-blue-500 hover:bg-blue-100 transition-colors text-xs"
              >
                {copiedField === "fullName" ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          )}

          {/* Per-employer groups with per-payslip cards */}
          {employers.length > 0 ? (
            employers.map((emp, empIdx) => (
              <div key={empIdx} className="mb-6">
                <div className="flex items-center gap-2 px-1 py-2 mb-2">
                  <Building2 className="h-4 w-4 text-gray-500" />
                  <p className="text-sm font-bold text-gray-800">
                    {emp.employerName ?? (isFrench ? "Employeur inconnu" : "Unknown employer")}
                  </p>
                  {emp.specified_work_eligible === true ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      ✅ {isFrench ? "travail qualifiant" : "qualifying work"}
                    </span>
                  ) : emp.upgrade_possible ? (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      ⚠️ {isFrench ? "potentiellement qualifiant" : "potentially qualifying"}
                    </span>
                  ) : (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                      ❌ {isFrench ? "non qualifiant" : "non-qualifying"}
                    </span>
                  )}
                </div>

                {emp.payslips && emp.payslips.length > 0 ? (
                  <>
                    {emp.payslips.map((p, pIdx) => (
                      <PayslipCard
                        key={pIdx}
                        payslip={p}
                        index={pIdx}
                        employerQualifies={emp.upgrade_possible ? "maybe" : emp.specified_work_eligible}
                        isFrench={isFrench}
                        copiedField={copiedField}
                        onCopy={copyToClipboard}
                      />
                    ))}
                    {emp.upgrade_possible && (
                      <UpgradeBox
                        employer={emp}
                        fullName={fields.fullName}
                        isFrench={isFrench}
                      />
                    )}
                  </>
                ) : (
                  // Old format: show flat employer data
                  <div className="border border-gray-100 rounded-xl overflow-hidden mb-3">
                    {[
                      { label: fieldLabels.employerAbn, value: emp.employerAbn, icon: <Building2 className="h-4 w-4" />, f: `emp_${empIdx}_abn` },
                      { label: fieldLabels.jobTitle, value: emp.jobTitle, icon: <Briefcase className="h-4 w-4" />, f: `emp_${empIdx}_title` },
                      { label: fieldLabels.employmentType, value: emp.employmentType, icon: <FileText className="h-4 w-4" />, f: `emp_${empIdx}_type` },
                      { label: fieldLabels.startDate, value: emp.startDate, icon: <Calendar className="h-4 w-4" />, f: `emp_${empIdx}_start` },
                      { label: isFrench ? "Date de fin" : "End date", value: emp.endDate, icon: <Calendar className="h-4 w-4" />, f: `emp_${empIdx}_end` },
                      { label: fieldLabels.hoursPerWeek, value: emp.hoursPerWeek, icon: <Clock className="h-4 w-4" />, f: `emp_${empIdx}_hpw` },
                      { label: fieldLabels.grossIncome, value: emp.grossIncome, icon: <DollarSign className="h-4 w-4" />, f: `emp_${empIdx}_income` },
                      { label: fieldLabels.postcode, value: emp.postcode, icon: <MapPin className="h-4 w-4" />, f: `emp_${empIdx}_post` },
                      { label: fieldLabels.state, value: emp.state, icon: <MapPin className="h-4 w-4" />, f: `emp_${empIdx}_state` },
                      { label: fieldLabels.industry, value: emp.industry, icon: <Briefcase className="h-4 w-4" />, f: `emp_${empIdx}_ind` },
                    ].filter((row) => row.value).map(({ label, value, icon, f }) => (
                      <div key={f} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
                        <span className="text-gray-400 flex-shrink-0">{icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-400">{label}</p>
                          <p className="text-sm font-mono font-semibold text-gray-900 truncate">{value}</p>
                        </div>
                        <button
                          onClick={() => copyToClipboard(value!, f)}
                          className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-700 transition-colors text-xs"
                        >
                          {copiedField === f ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            /* Fallback: old single-employer format */
            <div>
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Missing fields notice ── */}
      {(() => {
        const anyPayslipHasJobTitle = employers.some(
          (emp) => emp.jobTitle || emp.payslips?.some((p) => p.jobTitle)
        );
        const filteredMissing = missing_fields.filter((f) => {
          if (f === "jobTitle" && (anyPayslipHasJobTitle || employers.length > 0)) return false;
          return true;
        });
        return filteredMissing.length > 0 ? (
          <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-200 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800 text-sm">
                {isFrench ? "Champs non extraits" : "Fields not extracted"}
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                {filteredMissing.map((f) => fieldLabels[f as keyof ExtractedFields] || f).join(", ")}
                {" — "}
                {isFrench ? "à saisir manuellement dans ImmiAccount." : "enter these manually in ImmiAccount."}
              </p>
            </div>
          </div>
        ) : null;
      })()}

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
              variant="outline" size="sm" className="gap-2"
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
