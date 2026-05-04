import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";
import { analyzeDocuments } from "@/lib/claude";
import { sendResultsEmail } from "@/lib/resend";
import Stripe from "stripe";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true });
  }

  const analysisId = session.metadata?.analysis_id;
  if (!analysisId) {
    console.error("No analysis_id in session metadata");
    return NextResponse.json({ error: "Missing analysis_id" }, { status: 400 });
  }

  // Fetch the analysis record
  const { data: analysis, error: fetchError } = await supabaseAdmin
    .from("analyses")
    .select("*")
    .eq("id", analysisId)
    .single();

  if (fetchError || !analysis) {
    console.error("Failed to fetch analysis:", fetchError);
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  // Update stripe status
  await supabaseAdmin
    .from("analyses")
    .update({
      stripe_status: "paid",
      payment_intent_id: typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.toString() || null,
    })
    .eq("id", analysisId);

  // Run AI analysis
  try {
    const payslipBuffer = Buffer.from(analysis.payslip_b64, "base64");

    let letterBuffer: Buffer | undefined;
    let letterName: string | undefined;

    if (analysis.letter_b64 && analysis.letter_name) {
      letterBuffer = Buffer.from(analysis.letter_b64, "base64");
      letterName = analysis.letter_name;
    }

    const result = await analyzeDocuments(
      payslipBuffer,
      analysis.payslip_name,
      letterBuffer,
      letterName,
      analysis.visa_type
    );

    // Store results and clear document data (security)
    await supabaseAdmin
      .from("analyses")
      .update({
        analysis_result: result,
        stripe_status: "completed",
        payslip_b64: null,
        payslip_name: null,
        letter_b64: null,
        letter_name: null,
      })
      .eq("id", analysisId);

    // Send email
    try {
      await sendResultsEmail(
        analysis.email,
        analysisId,
        result,
        analysis.visa_type,
        analysis.language
      );
    } catch (emailErr) {
      console.error("Failed to send email:", emailErr);
      // Don't fail the webhook for email errors
    }
  } catch (analysisErr) {
    console.error("Analysis failed:", analysisErr);
    await supabaseAdmin
      .from("analyses")
      .update({ stripe_status: "analysis_failed" })
      .eq("id", analysisId);
  }

  return NextResponse.json({ received: true });
}
