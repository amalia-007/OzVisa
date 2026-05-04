import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token || token !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: analyses, error } = await supabaseAdmin
    .from("analyses")
    .select("id, email, visa_type, stripe_status, language, created_at, payment_intent_id")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }

  const totalRevenue = analyses?.filter((a) => a.stripe_status === "completed" || a.stripe_status === "paid")
    .length * 29 || 0;

  const totalAnalyses = analyses?.length || 0;
  const paidAnalyses = analyses?.filter((a) => ["completed", "paid"].includes(a.stripe_status)).length || 0;
  const conversionRate = totalAnalyses > 0 ? Math.round((paidAnalyses / totalAnalyses) * 100) : 0;

  return NextResponse.json({
    analyses,
    stats: {
      totalRevenue,
      totalAnalyses,
      paidAnalyses,
      conversionRate,
    },
  });
}
