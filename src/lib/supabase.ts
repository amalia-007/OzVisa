import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabaseAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _supabaseAdmin;
}

// Named export for backwards compatibility
export const supabaseAdmin = {
  from: (...args: Parameters<SupabaseClient["from"]>) => getSupabaseAdmin().from(...args),
};

export type PayslipRecord = {
  filename: string | null;
  payPeriodStart: string | null;
  payPeriodEnd: string | null;
  hoursWorked: string | null;
  grossPay: string | null;
  employerName: string | null;
  employerAbn: string | null;
  jobTitle: string | null;
  employmentType: string | null;
  postcode: string | null;
  state: string | null;
  industry: string | null;
};

export type EmployerData = {
  employerName: string | null;
  employerAbn: string | null;
  jobTitle: string | null;
  employmentType: string | null;
  hoursPerWeek: string | null;
  totalHours: string | null;
  payPeriod: string | null;
  grossIncome: string | null;
  startDate: string | null;
  endDate: string | null;
  postcode: string | null;
  state: string | null;
  industry: string | null;
  specifiedWork: string | null;
  specified_work_eligible: boolean | null;
  specified_work_reason: string;
  specified_work_reason_fr: string;
  upgrade_possible?: boolean;
  payslips: PayslipRecord[];
};

export type AnalysisResult = {
  fields: ExtractedFields;
  employers?: EmployerData[];
  missing_fields: string[];
  specified_work_eligible: boolean | null;
  specified_work_reason: string;
  specified_work_reason_fr?: string;
  confidence_scores: Record<string, number>;
  raw_text: string;
};

export type ExtractedFields = {
  fullName: string | null;
  employerName: string | null;
  employerAbn: string | null;
  jobTitle: string | null;
  employmentType: string | null;
  hoursPerWeek: string | null;
  totalHours: string | null;
  payPeriod: string | null;
  grossIncome: string | null;
  startDate: string | null;
  postcode: string | null;
  state: string | null;
  industry: string | null;
  specifiedWork: string | null;
};
