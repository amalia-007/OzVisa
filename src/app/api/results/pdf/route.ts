import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { AnalysisResult, ExtractedFields } from "@/lib/supabase";

export const runtime = "nodejs";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FIELD_LABELS_FR: Record<keyof ExtractedFields, string> = {
  fullName: "Nom complet",
  employerName: "Nom de l'employeur",
  employerAbn: "ABN de l'employeur",
  jobTitle: "Titre du poste",
  employmentType: "Type de contrat",
  hoursPerWeek: "Heures par semaine",
  totalHours: "Total des heures",
  payPeriod: "Période de paie",
  grossIncome: "Revenu brut par période",
  startDate: "Date de début",
  postcode: "Code postal",
  state: "État",
  industry: "Secteur d'activité",
  specifiedWork: "Travail spécifié",
};

const FIELD_LABELS_EN: Record<keyof ExtractedFields, string> = {
  fullName: "Full name",
  employerName: "Employer name",
  employerAbn: "Employer ABN",
  jobTitle: "Job title",
  employmentType: "Employment type",
  hoursPerWeek: "Hours per week",
  totalHours: "Total hours",
  payPeriod: "Pay period",
  grossIncome: "Gross income per period",
  startDate: "Start date",
  postcode: "Work postcode",
  state: "Work state",
  industry: "Industry",
  specifiedWork: "Specified work",
};

function generatePdfHtml(
  analysisId: string,
  email: string,
  visaType: string,
  language: string,
  result: AnalysisResult,
  createdAt: string
): string {
  const isFrench = language === "fr";
  const labels = isFrench ? FIELD_LABELS_FR : FIELD_LABELS_EN;

  const fieldOrder: (keyof ExtractedFields)[] = [
    "fullName", "employerName", "employerAbn", "jobTitle", "employmentType",
    "hoursPerWeek", "totalHours", "payPeriod", "grossIncome", "startDate",
    "postcode", "state", "industry", "specifiedWork",
  ];

  const eligibilityText = result.specified_work_eligible === true
    ? (isFrench ? "✅ Éligible au 2ème WHV" : "✅ Eligible for 2nd WHV")
    : result.specified_work_eligible === false
    ? (isFrench ? "❌ Non éligible au 2ème WHV" : "❌ Not eligible for 2nd WHV")
    : (isFrench ? "⚠️ Éligibilité incertaine" : "⚠️ Eligibility uncertain");

  const visaUrl = visaType === "417"
    ? "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417"
    : "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-and-holiday-462";

  const rows = fieldOrder
    .map((field) => {
      const value = result.fields[field];
      const confidence = result.confidence_scores[field] || 0;
      const isMissing = !value;
      const confLabel = confidence >= 0.8 ? (isFrench ? "Haute" : "High") : confidence >= 0.5 ? (isFrench ? "Moyenne" : "Medium") : (isFrench ? "Faible" : "Low");

      return `
      <tr>
        <td style="padding:10px 12px;font-size:13px;color:#6b7280;font-weight:500;width:40%;border-bottom:1px solid #f3f4f6;">${escapeHtml(labels[field])}</td>
        <td style="padding:10px 12px;font-size:13px;font-family:monospace;font-weight:600;border-bottom:1px solid #f3f4f6;">${isMissing ? `<span style="color:#9ca3af;font-style:italic;font-family:sans-serif;">${isFrench ? "Non trouvé" : "Not found"}</span>` : escapeHtml(value!)}</td>
        <td style="padding:10px 12px;font-size:11px;text-align:right;border-bottom:1px solid #f3f4f6;color:${confidence >= 0.8 ? "#059669" : confidence >= 0.5 ? "#d97706" : "#dc2626"};">${isMissing ? "" : confLabel}</td>
      </tr>`;
    })
    .join("");

  const guideSteps = isFrench ? [
    { n: 1, title: "Accéder au site officiel", body: `<a href="${visaUrl}">${escapeHtml(visaUrl)}</a>` },
    { n: 2, title: "Se connecter à ImmiAccount", body: '<a href="https://online.immi.gov.au/lusc/login">https://online.immi.gov.au/lusc/login</a>' },
    { n: 3, title: "Créer une nouvelle demande", body: 'Cliquez sur "New application" → Sélectionnez "Working Holiday" → Choisissez la sous-classe ' + visaType },
    { n: 4, title: "Remplir le formulaire", body: "Utilisez les données extraites dans le tableau ci-dessus pour remplir chaque section." },
    { n: 5, title: "Joindre les documents", body: "Fiche de paie · Lettre d'employeur (si disponible) · Passeport" },
    { n: 6, title: "Soumettre la demande", body: "Vérifiez toutes les informations et soumettez. Conservez le numéro de référence." },
  ] : [
    { n: 1, title: "Access the official website", body: `<a href="${visaUrl}">${escapeHtml(visaUrl)}</a>` },
    { n: 2, title: "Log in to ImmiAccount", body: '<a href="https://online.immi.gov.au/lusc/login">https://online.immi.gov.au/lusc/login</a>' },
    { n: 3, title: "Create a new application", body: 'Click "New application" → Select "Working Holiday" → Choose subclass ' + visaType },
    { n: 4, title: "Fill in the form", body: "Use the extracted data in the table above to fill each section." },
    { n: 5, title: "Attach documents", body: "Payslip · Employer letter (if available) · Passport" },
    { n: 6, title: "Submit the application", body: "Review all information and submit. Keep your reference number." },
  ];

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 14px; line-height: 1.5; }
    .header { background: #1e40af; color: white; padding: 32px 40px; }
    .header h1 { font-size: 28px; font-weight: bold; }
    .header p { opacity: 0.85; margin-top: 4px; }
    .content { padding: 32px 40px; }
    .section { margin-bottom: 32px; }
    .section-title { font-size: 18px; font-weight: bold; color: #1e40af; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 16px; }
    .eligibility { padding: 16px; border-radius: 8px; margin-bottom: 24px; }
    .eligible { background: #d1fae5; }
    .not-eligible { background: #fee2e2; }
    .uncertain { background: #fef3c7; }
    table { width: 100%; border-collapse: collapse; }
    .step { display: flex; gap: 16px; margin-bottom: 16px; }
    .step-num { width: 28px; height: 28px; border-radius: 50%; background: #1e40af; color: white; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; flex-shrink: 0; }
    .footer { border-top: 1px solid #e5e7eb; padding: 20px 40px; color: #9ca3af; font-size: 11px; text-align: center; }
    a { color: #1e40af; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🦘 OzVisa — WHV ${escapeHtml(visaType)} Analysis</h1>
    <p>${isFrench ? "Résultats d'analyse" : "Analysis results"} · ${email} · ${new Date(createdAt).toLocaleDateString()}</p>
  </div>
  <div class="content">
    <div class="section">
      <div class="eligibility ${result.specified_work_eligible === true ? "eligible" : result.specified_work_eligible === false ? "not-eligible" : "uncertain"}">
        <p style="font-weight:bold;font-size:16px;">${eligibilityText}</p>
        <p style="margin-top:6px;font-size:13px;">${escapeHtml(result.specified_work_reason)}</p>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">${isFrench ? "Données extraites" : "Extracted data"}</h2>
      <table>
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">${isFrench ? "Champ" : "Field"}</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">${isFrench ? "Valeur" : "Value"}</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">${isFrench ? "Confiance" : "Confidence"}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="section">
      <h2 class="section-title">${isFrench ? "Guide étape par étape" : "Step-by-step guide"}</h2>
      ${guideSteps.map(step => `
        <div class="step">
          <div class="step-num">${step.n}</div>
          <div>
            <p style="font-weight:600;">${escapeHtml(step.title)}</p>
            <p style="color:#6b7280;font-size:13px;margin-top:2px;">${step.body}</p>
          </div>
        </div>
      `).join("")}
    </div>

    <div class="section">
      <h2 class="section-title">${isFrench ? "Liens officiels" : "Official links"}</h2>
      <p style="font-size:13px;">
        🔗 <a href="${visaUrl}">WHV ${escapeHtml(visaType)} — immi.homeaffairs.gov.au</a><br>
        🔗 <a href="https://online.immi.gov.au/lusc/login">ImmiAccount Login</a><br>
        🔗 <a href="https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work">Specified Work</a><br>
        🔗 <a href="https://www.abn.business.gov.au/">ABN Lookup</a><br>
        🔗 <a href="https://www.fairwork.gov.au/">Fair Work Australia</a>
      </p>
    </div>
  </div>
  <div class="footer">
    OzVisa · ${isFrench ? "Vos documents n'ont pas été stockés sur nos serveurs." : "Your documents were not stored on our servers."} · ID: ${escapeHtml(analysisId)}
  </div>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { data: analysis, error } = await supabaseAdmin
    .from("analyses")
    .select("id, email, visa_type, language, analysis_result, created_at")
    .eq("id", id)
    .single();

  if (error || !analysis || !analysis.analysis_result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const html = generatePdfHtml(
    analysis.id,
    analysis.email,
    analysis.visa_type,
    analysis.language,
    analysis.analysis_result,
    analysis.created_at
  );

  // Return HTML as a downloadable PDF-equivalent (browser print)
  // For a real PDF, you'd use puppeteer or react-pdf here
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="ozvisa-results-${id.slice(0, 8)}.html"`,
    },
  });
}
