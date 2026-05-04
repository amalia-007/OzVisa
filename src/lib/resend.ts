import { Resend } from "resend";
import type { AnalysisResult } from "./supabase";

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}

function getFromEmail() {
  return process.env.RESEND_FROM_EMAIL || "noreply@ozvisa.app";
}

function formatField(value: string | null, missing = "Not found"): string {
  return value || missing;
}

function getConfidenceEmoji(score: number): string {
  if (score >= 0.8) return "✅";
  if (score >= 0.5) return "⚠️";
  return "❓";
}

export async function sendResultsEmail(
  email: string,
  analysisId: string,
  analysis: AnalysisResult,
  visaType: "417" | "462",
  language: string
): Promise<void> {
  const { fields, confidence_scores, specified_work_eligible, specified_work_reason } = analysis;

  const isFrench = language === "fr";
  const resultsUrl = `${process.env.NEXT_PUBLIC_APP_URL}/results?id=${analysisId}`;

  const subject = isFrench
    ? `OzVisa - Vos résultats d'analyse WHV ${visaType}`
    : `OzVisa - Your WHV ${visaType} analysis results`;

  const eligibilityText = specified_work_eligible === true
    ? (isFrench ? "✅ Éligible au 2ème WHV (specified work)" : "✅ Eligible for 2nd WHV (specified work)")
    : specified_work_eligible === false
    ? (isFrench ? "❌ Non éligible au 2ème WHV" : "❌ Not eligible for 2nd WHV")
    : (isFrench ? "❓ Éligibilité incertaine" : "❓ Eligibility uncertain");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; }
    .header { background: #1e40af; color: white; padding: 24px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 8px 0 0; opacity: 0.9; }
    .content { padding: 24px; background: #f9fafb; }
    .section { background: white; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
    .section h2 { margin: 0 0 16px; font-size: 18px; color: #1e40af; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    .field { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
    .field-name { color: #6b7280; font-size: 14px; }
    .field-value { font-weight: 600; font-size: 14px; }
    .eligibility { padding: 16px; border-radius: 8px; margin-bottom: 16px; }
    .eligible { background: #d1fae5; color: #065f46; }
    .not-eligible { background: #fee2e2; color: #991b1b; }
    .uncertain { background: #fef3c7; color: #92400e; }
    .cta { text-align: center; padding: 24px; }
    .btn { background: #1e40af; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; }
    .footer { padding: 16px; text-align: center; color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🦘 OzVisa</h1>
    <p>${isFrench ? `Vos résultats d'analyse WHV ${visaType}` : `Your WHV ${visaType} analysis results`}</p>
  </div>
  <div class="content">
    <div class="eligibility ${specified_work_eligible === true ? "eligible" : specified_work_eligible === false ? "not-eligible" : "uncertain"}">
      <strong>${eligibilityText}</strong>
      <p style="margin: 8px 0 0; font-size: 14px;">${specified_work_reason}</p>
    </div>

    <div class="section">
      <h2>${isFrench ? "Données extraites" : "Extracted data"}</h2>
      ${[
        ["Full name / Nom complet", fields.fullName, confidence_scores.fullName],
        ["Employer / Employeur", fields.employerName, confidence_scores.employerName],
        ["ABN", fields.employerAbn, confidence_scores.employerAbn],
        ["Job title / Poste", fields.jobTitle, confidence_scores.jobTitle],
        ["Employment type / Type de contrat", fields.employmentType, confidence_scores.employmentType],
        ["Hours/week / Heures/semaine", fields.hoursPerWeek, confidence_scores.hoursPerWeek],
        ["Pay period / Période de paie", fields.payPeriod, confidence_scores.payPeriod],
        ["Gross income / Revenu brut", fields.grossIncome, confidence_scores.grossIncome],
        ["Start date / Date de début", fields.startDate, confidence_scores.startDate],
        ["Postcode / Code postal", fields.postcode, confidence_scores.postcode],
        ["State / État", fields.state, confidence_scores.state],
        ["Industry / Secteur", fields.industry, confidence_scores.industry],
      ]
        .map(([name, value, score]) => `
          <div class="field">
            <span class="field-name">${name}</span>
            <span class="field-value">${getConfidenceEmoji(score as number)} ${formatField(value as string | null, isFrench ? "Non trouvé" : "Not found")}</span>
          </div>
        `)
        .join("")}
    </div>

    <div class="cta">
      <a href="${resultsUrl}" class="btn">
        ${isFrench ? "Voir mes résultats complets →" : "View my full results →"}
      </a>
      <p style="color: #6b7280; font-size: 14px; margin-top: 12px;">
        ${isFrench ? "Le lien reste valide 30 jours." : "Link remains valid for 30 days."}
      </p>
    </div>

    <div class="section" style="font-size: 14px; color: #4b5563;">
      <h2>${isFrench ? "Liens officiels" : "Official links"}</h2>
      <p>🔗 <a href="https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-${visaType}">WHV ${visaType} - immi.homeaffairs.gov.au</a></p>
      <p>🔗 <a href="https://online.immi.gov.au/lusc/login">ImmiAccount Login</a></p>
      <p>🔗 <a href="https://www.abn.business.gov.au/">ABN Lookup</a></p>
    </div>
  </div>
  <div class="footer">
    <p>OzVisa · ${isFrench ? "Vos documents n'ont pas été stockés" : "Your documents were not stored"}</p>
    <p>${isFrench ? "Paiement sécurisé via Stripe" : "Secure payment via Stripe"}</p>
  </div>
</body>
</html>
  `;

  await getResend().emails.send({
    from: getFromEmail(),
    to: email,
    subject,
    html,
  });
}
