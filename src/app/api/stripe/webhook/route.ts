import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";
import { analyzeDocuments } from "@/lib/claude";
import { sendResultsEmail } from "@/lib/resend";
import Stripe from "stripe";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  console.log("[webhook] POST received");

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET is not set — signature verification skipped (sandbox mode)");
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    console.error("[webhook] Missing stripe-signature header");
    return NextResponse.json({ error: "Missing stripe signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  if (webhookSecret) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      console.log("[webhook] Signature verified OK — event type:", event.type);
    } catch (err) {
      console.error("[webhook] Signature verification failed:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  } else {
    // No secret configured — parse raw body and proceed (sandbox only)
    try {
      event = JSON.parse(body) as Stripe.Event;
      console.warn("[webhook] No STRIPE_WEBHOOK_SECRET — parsed event without verification. Type:", event.type);
    } catch {
      console.error("[webhook] Failed to parse body as JSON");
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
  }

  if (event.type !== "checkout.session.completed") {
    console.log("[webhook] Ignoring event type:", event.type);
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  console.log("[webhook] checkout.session.completed — payment_status:", session.payment_status, "| session id:", session.id);

  if (session.payment_status !== "paid") {
    console.log("[webhook] Payment not yet paid — skipping");
    return NextResponse.json({ received: true });
  }

  const analysisId = session.metadata?.analysis_id;
  if (!analysisId) {
    console.error("[webhook] No analysis_id in session metadata. Metadata:", JSON.stringify(session.metadata));
    return NextResponse.json({ error: "Missing analysis_id" }, { status: 400 });
  }
  console.log("[webhook] analysis_id:", analysisId);

  // Fetch the analysis record
  const { data: analysis, error: fetchError } = await supabaseAdmin
    .from("analyses")
    .select("*")
    .eq("id", analysisId)
    .single();

  if (fetchError || !analysis) {
    console.error("[webhook] Failed to fetch analysis record — id:", analysisId, "| error:", fetchError?.message, fetchError?.code);
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }
  console.log("[webhook] Analysis record found — current status:", analysis.stripe_status);

  // Update stripe status to paid
  const { error: updatePaidErr } = await supabaseAdmin
    .from("analyses")
    .update({
      stripe_status: "paid",
      payment_intent_id: typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.toString() || null,
    })
    .eq("id", analysisId);
  if (updatePaidErr) console.error("[webhook] Failed to update status to paid:", updatePaidErr.message);
  else console.log("[webhook] Status updated to 'paid'");

  // Run AI analysis
  try {
    console.log("[webhook] Parsing payslip_b64...");
    const payslipsRaw: Array<{ b64: string; name: string }> = JSON.parse(analysis.payslip_b64);
    const payslips = payslipsRaw.map((p) => ({ buffer: Buffer.from(p.b64, "base64"), name: p.name }));
    console.log("[webhook] Payslips count:", payslips.length);

    const letters: Array<{ buffer: Buffer; name: string }> = [];
    if (analysis.letter_b64) {
      const lettersRaw: Array<{ b64: string; name: string }> = JSON.parse(analysis.letter_b64);
      for (const l of lettersRaw) letters.push({ buffer: Buffer.from(l.b64, "base64"), name: l.name });
    }
    console.log("[webhook] Letters count:", letters.length);

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    console.log("[webhook] ANTHROPIC_API_KEY set:", !!anthropicKey, "| starts with:", anthropicKey?.substring(0, 10));

    console.log("[webhook] Calling analyzeDocuments...");
    const result = await analyzeDocuments(payslips, letters, analysis.visa_type);
    console.log("[webhook] analyzeDocuments completed — fields extracted:", Object.keys(result.fields || {}).length);

    // Store results and clear document data
    const { error: updateCompleteErr } = await supabaseAdmin
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
    if (updateCompleteErr) console.error("[webhook] Failed to update status to completed:", updateCompleteErr.message);
    else console.log("[webhook] Status updated to 'completed' — analysis stored");

    // Send email
    try {
      console.log("[webhook] Sending results email to:", analysis.email);
      await sendResultsEmail(analysis.email, analysisId, result, analysis.visa_type, analysis.language);
      console.log("[webhook] Email sent OK");
    } catch (emailErr) {
      console.error("[webhook] Email send failed (non-fatal):", emailErr);
    }
  } catch (analysisErr) {
    console.error("[webhook] analyzeDocuments threw an error:", analysisErr);
    await supabaseAdmin
      .from("analyses")
      .update({ stripe_status: "analysis_failed" })
      .eq("id", analysisId);
    console.log("[webhook] Status updated to 'analysis_failed'");
  }

  console.log("[webhook] Done — returning 200");
  return NextResponse.json({ received: true });
}
