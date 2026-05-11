import Anthropic from "@anthropic-ai/sdk";
import { checkSpecifiedWorkEligibility } from "./specified-work";
import type { AnalysisResult, EmployerData } from "./supabase";

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey });
  }
  return _anthropic;
}

const EXTRACTION_PROMPT = `You are an expert at analyzing Australian employment documents for Working Holiday Visa (WHV) applications.

Analyze the provided document(s) and extract employment information needed for Australian WHV subclass 417 or 462 renewal application.

CRITICAL RULE: If payslips from DIFFERENT employers are provided, you MUST create a SEPARATE entry in the "employers" array for each employer. Each distinct employer name = a new entry. Do NOT merge different employers into one entry. If multiple payslips are from the SAME employer, combine them into one entry with the earliest startDate and most recent endDate.

Return a JSON object with EXACTLY this structure:
{
  "fullName": "string or null (applicant's full name, same across all documents)",
  "employers": [
    {
      "employerName": "string or null",
      "employerAbn": "string or null (Australian Business Number, format: XX XXX XXX XXX)",
      "jobTitle": "string or null",
      "employmentType": "casual | part-time | full-time | null",
      "hoursPerWeek": "string or null (average hours per week for this employer)",
      "totalHours": "string or null (sum of all hours worked for this employer across all their payslips)",
      "payPeriod": "weekly | fortnightly | monthly | null",
      "grossIncome": "string or null (amount with currency, per pay period)",
      "startDate": "string or null (DD/MM/YYYY — earliest date found for this employer)",
      "endDate": "string or null (DD/MM/YYYY — most recent payslip date for this employer)",
      "postcode": "string or null (4-digit Australian postcode)",
      "state": "QLD | NSW | VIC | SA | WA | TAS | NT | ACT | null",
      "industry": "string or null (agriculture, hospitality, construction, etc.)",
      "specifiedWork": "yes | no | possible | null (whether this qualifies as regional specified work)"
    }
  ],
  "confidence_scores": {
    "fullName": 0.0-1.0,
    "employerName": 0.0-1.0,
    "employerAbn": 0.0-1.0,
    "jobTitle": 0.0-1.0,
    "employmentType": 0.0-1.0,
    "hoursPerWeek": 0.0-1.0,
    "totalHours": 0.0-1.0,
    "payPeriod": 0.0-1.0,
    "grossIncome": 0.0-1.0,
    "startDate": 0.0-1.0,
    "postcode": 0.0-1.0,
    "state": 0.0-1.0,
    "industry": 0.0-1.0,
    "specifiedWork": 0.0-1.0
  },
  "missing_fields": ["array of field names not found in any document"],
  "raw_text": "brief summary of all document content"
}

Guidelines:
- Be conservative with confidence scores. Only use >0.9 if clearly stated in the document.
- For ABN: look for "ABN" followed by 11 digits, format as "XX XXX XXX XXX"
- For specified work: agriculture, horticulture, viticulture, aquaculture, fishing, pearling, tree felling/farming, mining, construction qualify
- For employment type: look for "casual", "part-time", "full-time" or infer from hours
- For totalHours: if multiple payslips exist for the same employer, sum the hours across all of them
- ALWAYS return at least one entry in the employers array, even if data is incomplete
- Return ONLY valid JSON, no markdown, no explanation.`;

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

export async function analyzeDocuments(
  payslips: Array<{ buffer: Buffer; name: string }>,
  letters: Array<{ buffer: Buffer; name: string }>,
  visaType: "417" | "462" = "417"
): Promise<AnalysisResult> {
  const content: ContentBlock[] = [
    {
      type: "text",
      text: `Please analyze the following document(s) for a Working Holiday Visa subclass ${visaType} renewal application.`,
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
    text: "\n\nNow extract all required information and return the JSON as specified.",
  });

  const anthropic = getAnthropic();
  console.log("[claude] Calling messages.create — payslips:", payslips.length, "letters:", letters.length, "visa:", visaType);

  let response: Awaited<ReturnType<typeof anthropic.messages.create>>;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
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

  interface RawClaudeResponse {
    fullName?: string | null;
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
    // Old format fallback
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

  // Normalise to employers array (handle both new and old format)
  const rawEmployers = raw.employers && raw.employers.length > 0
    ? raw.employers
    : raw.fields
    ? [raw.fields]
    : [];

  if (rawEmployers.length === 0) {
    throw new Error("Claude response contained no employer data");
  }

  const employers: EmployerData[] = rawEmployers.map((emp) => {
    const { eligible, reason, reasonFr } = checkSpecifiedWorkEligibility(
      emp.postcode ?? null,
      emp.state ?? null,
      emp.industry ?? null
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
      industry: emp.industry ?? null,
      specifiedWork: emp.specifiedWork ?? null,
      specified_work_eligible: eligible,
      specified_work_reason: reason,
      specified_work_reason_fr: reasonFr,
    };
  });

  // Primary fields from first employer + applicant name (for backwards compat)
  const first = rawEmployers[0];
  const firstFullName = "fullName" in first ? (first as { fullName?: string | null }).fullName : null;
  const fields = {
    fullName: raw.fullName ?? firstFullName ?? null,
    employerName: first.employerName ?? null,
    employerAbn: first.employerAbn ?? null,
    jobTitle: first.jobTitle ?? null,
    employmentType: first.employmentType ?? null,
    hoursPerWeek: first.hoursPerWeek ?? null,
    totalHours: first.totalHours ?? null,
    payPeriod: first.payPeriod ?? null,
    grossIncome: first.grossIncome ?? null,
    startDate: first.startDate ?? null,
    postcode: first.postcode ?? null,
    state: first.state ?? null,
    industry: first.industry ?? null,
    specifiedWork: first.specifiedWork ?? null,
  };

  // Overall eligibility: use first qualifying employer, else first employer
  const primaryEmployer = employers.find((e) => e.specified_work_eligible === true) ?? employers[0];

  console.log("[claude] Parsed employers count:", employers.length);

  return {
    fields,
    employers,
    missing_fields: raw.missing_fields ?? [],
    confidence_scores: raw.confidence_scores ?? {},
    raw_text: raw.raw_text ?? "",
    specified_work_eligible: primaryEmployer.specified_work_eligible,
    specified_work_reason: primaryEmployer.specified_work_reason,
    specified_work_reason_fr: primaryEmployer.specified_work_reason_fr,
  };
}
