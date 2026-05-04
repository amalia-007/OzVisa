import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const sessionId = searchParams.get("session_id");

  if (id) {
    const { data, error } = await supabaseAdmin
      .from("analyses")
      .select("id, email, visa_type, stripe_status, analysis_result, language, created_at")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  }

  if (sessionId) {
    const { data, error } = await supabaseAdmin
      .from("analyses")
      .select("id, email, visa_type, stripe_status, analysis_result, language, created_at")
      .eq("stripe_session_id", sessionId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "id or session_id required" }, { status: 400 });
}
