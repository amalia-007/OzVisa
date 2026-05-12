import Anthropic from "@anthropic-ai/sdk";
import { checkSpecifiedWorkEligibility } from "./specified-work";
import type { AnalysisResult, EmployerData, PayslipRecord } from "./supabase";

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey });
  }
  return _anthropic;
}

const EXTRACTION_PROMPT = `You are an expert at analyzing Australian employment payslips and employer letters for Working Holiday Visa (WHV) applications.

Analyze each payslip document SEPARATELY and extract per-payslip information.

CRITICAL RULES:
- Create ONE entry in the "payslips" array for EACH payslip document provided — do NOT combine multiple payslips
- Extract the EXACT pay period dates printed on each payslip (look for "Pay Period", "Period From/To", "Period Start/End", "Pay From/To", "Pay Date" range)
- hoursWorked = the hours worked in THIS specific pay period (NOT the year-to-date total)
- grossPay = the gross pay for THIS specific pay period (NOT year-to-date)
- payPeriodStart and payPeriodEnd MUST be in DD/MM/YYYY format

POSTCODE EXTRACTION — CRITICAL:
- Extract the postcode of WHERE THE WORK WAS PHYSICALLY PERFORMED, NOT the employer's registered office or billing address
- Look for: work site address, job site, branch address, deployed location, site location, work location, or any field indicating where the employee actually worked
- For labour hire companies (e.g. "People Hire", "Workforce", "Labour Solutions", "Staffing"), the work location is ALWAYS the client/site address — look for a site name, mine name, property name, farm name, or client location
- For farm/orchard work: the farm or orchard address/postcode is the work location
- For mine site work: the mine site postcode is the work location (NOT the company's Perth/city office)
- If you can only find the employer's company registered address or head office (typically a city address) and cannot determine the actual work site, set postcode to null — do NOT use the HQ address as work location

INDUSTRY CLASSIFICATION — use these exact categories for WHV specified work:
- Orchard work, fruit picking, vegetable picking, farm work → classify as "horticulture"
- Any farm/agricultural work (crops, dairy, livestock, poultry, vineyard, beekeeping) → classify as "agriculture"
- Security guards, sentries, emergency response personnel, or labour hire workers physically deployed TO A MINE SITE → classify as "mining" (mine site work qualifies regardless of the contractor's own industry)
- Riklan Emergency Management Services, any employer with "emergency management" providing services TO mining companies → classify as "mining"
- Any employer whose name includes "mine", "mining", "goldfields", "resources" AND job title is security/sentry/emergency/maintenance → classify as "mining"
- Fishing boats, aquaculture, pearl farming → classify as "fishing and pearling"
- Logging, tree planting, forestry → classify as "tree farming and felling"
- Road, civil, building works → classify as "construction"
- Landscaping or grounds maintenance (may qualify if on construction/mining site — use "landscaping") → classify as "landscaping"
- Hotel, bar, cafe, kitchen work → classify as "hospitality"
- When in doubt for farm-adjacent work: lean toward the most specific qualifying category

CONFIDENCE SCORES — be confident:
- Australian payslips have standardised formats; if the value is clearly printed, use 0.9+
- If the same information appears consistently across multiple payslips from the same employer, use 0.95+
- Only use <0.7 if the field is genuinely ambiguous, partially obscured, or inferred rather than explicitly stated
- postcode: use 0.9 if you found an explicit site/work location address; use 0.5 if you are deriving it; use null if you cannot determine work location (NOT employer HQ)

Return a JSON object with EXACTLY this structure:
{
  "fullName": "string or null (applicant's full name, same across all documents)",
  "payslips": [
    {
      "filename": "string or null (document name/identifier)",
      "payPeriodStart": "DD/MM/YYYY or null (start of this pay period)",
      "payPeriodEnd": "DD/MM/YYYY or null (end of this pay period)",
      "hoursWorked": "string or null (hours in THIS pay period, e.g. '76.00')",
      "grossPay": "string or null (gross pay THIS period, e.g. 'AUD 2,450.00')",
      "employerName": "string or null",
      "employerAbn": "string or null (format: XX XXX XXX XXX)",
      "jobTitle": "string or null",
      "employmentType": "casual | part-time | full-time | null",
      "postcode": "string or null (4-digit postcode of WORK SITE — null if only employer HQ visible)",
      "state": "QLD | NSW | VIC | SA | WA | TAS | NT | ACT | null",
      "industry": "string or null — use WHV categories: agriculture, horticulture, mining, construction, fishing and pearling, tree farming and felling, hospitality, retail, etc."
    }
  ],
  "confidence_scores": {
    "fullName": 0.0-1.0,
    "payPeriodStart": 0.0-1.0,
    "payPeriodEnd": 0.0-1.0,
    "hoursWorked": 0.0-1.0,
    "grossPay": 0.0-1.0,
    "employerName": 0.0-1.0,
    "employerAbn": 0.0-1.0,
    "jobTitle": 0.0-1.0,
    "postcode": 0.0-1.0,
    "state": 0.0-1.0,
    "industry": 0.0-1.0
  },
  "missing_fields": ["list of field names absent from ALL documents"],
  "raw_text": "brief summary of all documents"
}

Additional guidelines:
- For ABN: look for "ABN" followed by 11 digits, format as "XX XXX XXX XXX"
- For payPeriodStart/End: if only one date is shown, use it for both start and end
- ALWAYS return at least one entry in payslips even if data is incomplete
- Return ONLY valid JSON — no markdown, no explanation`;

function getMimeType(filename: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "application/pdf" {
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, "image/jpeg" | "image/png" | "image/webp" | "application/pdf"> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
  };
  return mimeTypes[ext || ""] || "application/pdf";
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

function fileToContentBlock(buffer: Buffer, name: string): ContentBlock {
  const mime = getMimeType(name);
  const b64 = buffer.toString("base64");
  if (mime === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } };
  }
  return { type: "image", source: { type: "base64", media_type: mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: b64 } };
}

function parseDateStr(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

function sortDateStr(dates: (string | null | undefined)[], desc = false): string[] {
  return dates
    .filter((d): d is string => !!d && parseDateStr(d) !== null)
    .sort((a, b) => {
      const da = parseDateStr(a)!.getTime();
      const db = parseDateStr(b)!.getTime();
      return desc ? db - da : da - db;
    });
}

// Employer names known to provide services TO mine sites — all work qualifies as mining
const MINING_EMPLOYER_OVERRIDES = [
  "riklan",                     // Riklan Emergency Management Services
  "goldfields people hire",     // GPH labour hire for mine sites
  "gph goldfields",
];

function getEffectiveIndustry(
  employerName: string | null,
  extractedIndustry: string | null,
  jobTitle: string | null
): string | null {
  const empLower = (employerName ?? "").toLowerCase();
  const titleLower = (jobTitle ?? "").toLowerCase();

  // Explicit employer whitelist: these companies deploy workers to mine sites
  if (MINING_EMPLOYER_OVERRIDES.some((k) => empLower.includes(k))) {
    return "mining";
  }

  // Generic inference: employer name has mine/mining + job title is security/emergency/sentry
  const empIsMining = empLower.includes("mine") || empLower.includes("mining") || empLower.includes("goldfields");
  const titleIsMineRole =
    titleLower.includes("sentry") ||
    titleLower.includes("security") ||
    titleLower.includes("guard") ||
    titleLower.includes("emergency") ||
    titleLower.includes("warden");
  if (empIsMining && titleIsMineRole) {
    return "mining";
  }

  return extractedIndustry ?? null;
}

function groupPayslipsToEmployers(payslips: PayslipRecord[]): EmployerData[] {
  const map = new Map<string, PayslipRecord[]>();
  for (const p of payslips) {
    const key = (p.employerName ?? "__unknown__").trim().toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }

  return Array.from(map.values()).map((empPayslips) => {
    const first = empPayslips[0];

    const starts = sortDateStr(empPayslips.map((p) => p.payPeriodStart));
    const ends = sortDateStr(empPayslips.map((p) => p.payPeriodEnd), true);
    const startDate = starts[0] ?? null;
    const endDate = ends[0] ?? null;

    const totalHoursNum = empPayslips.reduce((sum, p) => {
      const h = parseFloat((p.hoursWorked ?? "").replace(/[^\d.]/g, ""));
      return isNaN(h) ? sum : sum + h;
    }, 0);

    // Estimate average hours/week from total hours and date span
    let hoursPerWeek: string | null = null;
    if (totalHoursNum > 0 && startDate && endDate) {
      const s = parseDateStr(startDate);
      const e = parseDateStr(endDate);
      if (s && e && e > s) {
        const weeks = (e.getTime() - s.getTime()) / (7 * 24 * 60 * 60 * 1000);
        if (weeks > 0) hoursPerWeek = (totalHoursNum / weeks).toFixed(1);
      }
    }

    const effectiveIndustry = getEffectiveIndustry(
      first.employerName ?? null,
      first.industry ?? null,
      first.jobTitle ?? null
    );

    const { eligible, reason, reasonFr, upgradePossible } = checkSpecifiedWorkEligibility(
      first.postcode ?? null,
      first.state ?? null,
      effectiveIndustry
    );

    return {
      employerName: first.employerName ?? null,
      employerAbn: first.employerAbn ?? null,
      jobTitle: first.jobTitle ?? null,
      employmentType: first.employmentType ?? null,
      hoursPerWeek,
      totalHours: totalHoursNum > 0 ? totalHoursNum.toFixed(2) : null,
      payPeriod: null,
      grossIncome: null,
      startDate,
      endDate,
      postcode: first.postcode ?? null,
      state: first.state ?? null,
      industry: effectiveIndustry ?? first.industry ?? null,
      specifiedWork: eligible === true ? "yes" : "no",
      specified_work_eligible: eligible,
      specified_work_reason: reason,
      specified_work_reason_fr: reasonFr,
      upgrade_possible: upgradePossible,
      payslips: empPayslips,
    };
  });
}

export async function analyzeDocuments(
  payslips: Array<{ buffer: Buffer; name: string }>,
  letters: Array<{ buffer: Buffer; name: string }>,
  visaType: "417" | "462" = "417"
): Promise<AnalysisResult> {
  const content: ContentBlock[] = [
    {
      type: "text",
      text: `Please analyze the following document(s) for a Working Holiday Visa subclass ${visaType} renewal application. Extract per-payslip data as instructed.`,
    },
  ];

  payslips.forEach((doc, i) => {
    content.push({ type: "text", text: `\nPayslip ${i + 1}: ${doc.name}` });
    content.push(fileToContentBlock(doc.buffer, doc.name));
  });

  letters.forEach((doc, i) => {
    content.push({ type: "text", text: `\nEmployer Letter ${i + 1}: ${doc.name}` });
    content.push(fileToContentBlock(doc.buffer, doc.name));
  });

  content.push({
    type: "text",
    text: "\n\nExtract per-payslip information and return the JSON as specified.",
  });

  const anthropic = getAnthropic();
  console.log("[claude] Calling messages.create — payslips:", payslips.length, "letters:", letters.length, "visa:", visaType);

  let response: Awaited<ReturnType<typeof anthropic.messages.create>>;
  try {
    response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001", // fastest model; note: user requested "claude-sonnet-4-5" which is not a valid ID
      max_tokens: 4000,
      system: EXTRACTION_PROMPT,
      messages: [
        {
          role: "user",
          content: content as Parameters<typeof anthropic.messages.create>[0]["messages"][0]["content"],
        },
      ],
    });
  } catch (apiErr: unknown) {
    const e = apiErr as { status?: number; message?: string; error?: unknown };
    console.error("[claude] API call failed — status:", e?.status, "| message:", e?.message, "| error:", JSON.stringify(e?.error));
    throw apiErr;
  }

  console.log("[claude] Response received — stop_reason:", response.stop_reason, "| content blocks:", response.content.length);

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    console.error("[claude] No text block in response. Content:", JSON.stringify(response.content));
    throw new Error("No text response from Claude");
  }

  interface RawPayslip {
    filename?: string | null;
    payPeriodStart?: string | null;
    payPeriodEnd?: string | null;
    hoursWorked?: string | null;
    grossPay?: string | null;
    employerName?: string | null;
    employerAbn?: string | null;
    jobTitle?: string | null;
    employmentType?: string | null;
    postcode?: string | null;
    state?: string | null;
    industry?: string | null;
  }

  interface RawClaudeResponse {
    fullName?: string | null;
    payslips?: RawPayslip[];
    // Old employer-array format (backwards compat)
    employers?: Array<{
      employerName?: string | null;
      employerAbn?: string | null;
      jobTitle?: string | null;
      employmentType?: string | null;
      hoursPerWeek?: string | null;
      totalHours?: string | null;
      payPeriod?: string | null;
      grossIncome?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      postcode?: string | null;
      state?: string | null;
      industry?: string | null;
      specifiedWork?: string | null;
    }>;
    // Very old fields format
    fields?: {
      fullName?: string | null;
      employerName?: string | null;
      employerAbn?: string | null;
      jobTitle?: string | null;
      employmentType?: string | null;
      hoursPerWeek?: string | null;
      totalHours?: string | null;
      payPeriod?: string | null;
      grossIncome?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      postcode?: string | null;
      state?: string | null;
      industry?: string | null;
      specifiedWork?: string | null;
    };
    confidence_scores?: Record<string, number>;
    missing_fields?: string[];
    raw_text?: string;
  }

  let raw: RawClaudeResponse;
  try {
    const jsonText = textContent.text.replace(/```json\n?|\n?```/g, "").trim();
    raw = JSON.parse(jsonText);
  } catch {
    console.error("[claude] Failed to parse JSON. Raw text:", textContent.text.substring(0, 500));
    throw new Error("Failed to parse Claude response as JSON");
  }

  let employers: EmployerData[];

  if (raw.payslips && raw.payslips.length > 0) {
    // New per-payslip format
    const payslipRecords: PayslipRecord[] = raw.payslips.map((p) => ({
      filename: p.filename ?? null,
      payPeriodStart: p.payPeriodStart ?? null,
      payPeriodEnd: p.payPeriodEnd ?? null,
      hoursWorked: p.hoursWorked ?? null,
      grossPay: p.grossPay ?? null,
      employerName: p.employerName ?? null,
      employerAbn: p.employerAbn ?? null,
      jobTitle: p.jobTitle ?? null,
      employmentType: p.employmentType ?? null,
      postcode: p.postcode ?? null,
      state: p.state ?? null,
      industry: p.industry ?? null,
    }));
    employers = groupPayslipsToEmployers(payslipRecords);
    console.log("[claude] New format — payslips:", payslipRecords.length, "→ employers:", employers.length);
  } else if (raw.employers && raw.employers.length > 0) {
    // Old employer-array format
    employers = raw.employers.map((emp) => {
      const effectiveIndustry = getEffectiveIndustry(emp.employerName ?? null, emp.industry ?? null, emp.jobTitle ?? null);
      const { eligible, reason, reasonFr, upgradePossible } = checkSpecifiedWorkEligibility(
        emp.postcode ?? null, emp.state ?? null, effectiveIndustry
      );
      return {
        employerName: emp.employerName ?? null,
        employerAbn: emp.employerAbn ?? null,
        jobTitle: emp.jobTitle ?? null,
        employmentType: emp.employmentType ?? null,
        hoursPerWeek: emp.hoursPerWeek ?? null,
        totalHours: emp.totalHours ?? null,
        payPeriod: emp.payPeriod ?? null,
        grossIncome: emp.grossIncome ?? null,
        startDate: emp.startDate ?? null,
        endDate: emp.endDate ?? null,
        postcode: emp.postcode ?? null,
        state: emp.state ?? null,
        industry: effectiveIndustry ?? emp.industry ?? null,
        specifiedWork: emp.specifiedWork ?? null,
        specified_work_eligible: eligible,
        specified_work_reason: reason,
        specified_work_reason_fr: reasonFr,
        upgrade_possible: upgradePossible,
        payslips: [],
      };
    });
    console.log("[claude] Old employers format — employers:", employers.length);
  } else if (raw.fields) {
    // Very old fields format
    const f = raw.fields;
    const effectiveIndustryF = getEffectiveIndustry(f.employerName ?? null, f.industry ?? null, f.jobTitle ?? null);
    const { eligible, reason, reasonFr, upgradePossible } = checkSpecifiedWorkEligibility(
      f.postcode ?? null, f.state ?? null, effectiveIndustryF
    );
    employers = [{
      employerName: f.employerName ?? null,
      employerAbn: f.employerAbn ?? null,
      jobTitle: f.jobTitle ?? null,
      employmentType: f.employmentType ?? null,
      hoursPerWeek: f.hoursPerWeek ?? null,
      totalHours: f.totalHours ?? null,
      payPeriod: f.payPeriod ?? null,
      grossIncome: f.grossIncome ?? null,
      startDate: f.startDate ?? null,
      endDate: f.endDate ?? null,
      postcode: f.postcode ?? null,
      state: f.state ?? null,
      industry: effectiveIndustryF ?? f.industry ?? null,
      specifiedWork: f.specifiedWork ?? null,
      specified_work_eligible: eligible,
      specified_work_reason: reason,
      specified_work_reason_fr: reasonFr,
      upgrade_possible: upgradePossible,
      payslips: [],
    }];
    console.log("[claude] Very old fields format");
  } else {
    throw new Error("Claude response contained no payslip or employer data");
  }

  // Build legacy fields object from first employer (backwards compat)
  const first = employers[0];
  const firstPayslip = first.payslips[0] ?? null;
  const fields = {
    fullName: raw.fullName ?? null,
    employerName: first.employerName,
    employerAbn: first.employerAbn,
    jobTitle: first.jobTitle,
    employmentType: first.employmentType,
    hoursPerWeek: first.hoursPerWeek,
    totalHours: first.totalHours,
    payPeriod: firstPayslip
      ? (firstPayslip.payPeriodStart && firstPayslip.payPeriodEnd
        ? `${firstPayslip.payPeriodStart} – ${firstPayslip.payPeriodEnd}`
        : null)
      : first.payPeriod,
    grossIncome: firstPayslip?.grossPay ?? first.grossIncome,
    startDate: first.startDate,
    postcode: first.postcode,
    state: first.state,
    industry: first.industry,
    specifiedWork: first.specifiedWork,
  };

  // Overall eligibility: use first qualifying employer, else first
  const primary = employers.find((e) => e.specified_work_eligible === true) ?? employers[0];

  return {
    fields,
    employers,
    missing_fields: raw.missing_fields ?? [],
    confidence_scores: raw.confidence_scores ?? {},
    raw_text: raw.raw_text ?? "",
    specified_work_eligible: primary.specified_work_eligible,
    specified_work_reason: primary.specified_work_reason,
    specified_work_reason_fr: primary.specified_work_reason_fr,
  };
}
