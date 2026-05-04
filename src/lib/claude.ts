import Anthropic from "@anthropic-ai/sdk";
import { checkSpecifiedWorkEligibility } from "./specified-work";
import type { AnalysisResult } from "./supabase";

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _anthropic;
}

const EXTRACTION_PROMPT = `You are an expert at analyzing Australian employment documents for Working Holiday Visa (WHV) applications.

Analyze the provided document(s) and extract the following information needed for Australian WHV subclass 417 or 462 renewal application.

Return a JSON object with EXACTLY this structure:
{
  "fields": {
    "fullName": "string or null",
    "employerName": "string or null",
    "employerAbn": "string or null (Australian Business Number, format: XX XXX XXX XXX)",
    "jobTitle": "string or null",
    "employmentType": "casual | part-time | full-time | null",
    "hoursPerWeek": "string or null (average hours)",
    "totalHours": "string or null (if visible on document)",
    "payPeriod": "weekly | fortnightly | monthly | null",
    "grossIncome": "string or null (amount with currency)",
    "startDate": "string or null (DD/MM/YYYY format)",
    "postcode": "string or null (4-digit Australian postcode)",
    "state": "QLD | NSW | VIC | SA | WA | TAS | NT | ACT | null",
    "industry": "string or null (agriculture, hospitality, construction, etc.)",
    "specifiedWork": "yes | no | possible | null (whether this qualifies as regional specified work)"
  },
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
  "missing_fields": ["array of field names not found in document"],
  "raw_text": "brief summary of document content"
}

Guidelines:
- Be conservative with confidence scores. Only use >0.9 if clearly stated in the document.
- For ABN: look for "ABN" followed by 11 digits, format as "XX XXX XXX XXX"
- For specified work: agriculture, horticulture, viticulture, aquaculture, fishing, pearling, tree felling/farming, mining, construction qualify
- For employment type: look for "casual", "part-time", "full-time" or infer from hours
- Return ONLY valid JSON, no markdown, no explanation.`;

function fileToBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

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

export async function analyzeDocuments(
  payslipBuffer: Buffer,
  payslipName: string,
  employerLetterBuffer?: Buffer,
  employerLetterName?: string,
  visaType: "417" | "462" = "417"
): Promise<AnalysisResult> {
  const payslipMime = getMimeType(payslipName);
  const payslipBase64 = fileToBase64(payslipBuffer);

  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string } }
    | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

  const content: ContentBlock[] = [
    {
      type: "text",
      text: `Please analyze the following document(s) for a Working Holiday Visa subclass ${visaType} renewal application.\n\nDocument 1: Payslip`,
    },
  ];

  if (payslipMime === "application/pdf") {
    content.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: payslipBase64,
      },
    });
  } else {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: payslipMime as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: payslipBase64,
      },
    });
  }

  if (employerLetterBuffer && employerLetterName) {
    const letterMime = getMimeType(employerLetterName);
    const letterBase64 = fileToBase64(employerLetterBuffer);

    content.push({
      type: "text",
      text: "\nDocument 2: Employer Letter",
    });

    if (letterMime === "application/pdf") {
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: letterBase64,
        },
      });
    } else {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: letterMime as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: letterBase64,
        },
      });
    }
  }

  content.push({
    type: "text",
    text: "\n\nNow extract all required information and return the JSON as specified.",
  });

  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: EXTRACTION_PROMPT,
    messages: [
      {
        role: "user",
        content: content as Parameters<typeof anthropic.messages.create>[0]["messages"][0]["content"],
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text response from Claude");
  }

  let parsed: Omit<AnalysisResult, "specified_work_eligible" | "specified_work_reason">;
  try {
    const jsonText = textContent.text.replace(/```json\n?|\n?```/g, "").trim();
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Failed to parse Claude response as JSON");
  }

  const { eligible, reason } = checkSpecifiedWorkEligibility(
    parsed.fields.postcode,
    parsed.fields.state,
    parsed.fields.industry
  );

  return {
    ...parsed,
    specified_work_eligible: eligible,
    specified_work_reason: reason,
  };
}
