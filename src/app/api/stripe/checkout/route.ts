import { NextRequest, NextResponse } from "next/server";
import { stripe, PRICE_IN_CENTS, CURRENCY } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const VALID_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  const { allowed } = checkRateLimit(ip);

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const payslipFile = formData.get("payslip") as File | null;
  const employerLetterFile = formData.get("employerLetter") as File | null;
  const email = formData.get("email") as string | null;
  const visaType = formData.get("visaType") as string | null;
  const language = formData.get("language") as string | null;

  // Validate required fields
  if (!payslipFile || payslipFile.size === 0) {
    return NextResponse.json({ error: "Payslip is required" }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  if (!visaType || !["417", "462"].includes(visaType)) {
    return NextResponse.json({ error: "Visa type must be 417 or 462" }, { status: 400 });
  }

  // Validate file types and sizes
  if (!VALID_TYPES.includes(payslipFile.type)) {
    return NextResponse.json({ error: "Invalid payslip file type" }, { status: 400 });
  }

  if (payslipFile.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Payslip file too large (max 10MB)" }, { status: 400 });
  }

  if (employerLetterFile && employerLetterFile.size > 0) {
    if (!VALID_TYPES.includes(employerLetterFile.type)) {
      return NextResponse.json({ error: "Invalid employer letter file type" }, { status: 400 });
    }
    if (employerLetterFile.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Employer letter too large (max 10MB)" }, { status: 400 });
    }
  }

  // Read files into buffers (process in memory, never store)
  const payslipBuffer = Buffer.from(await payslipFile.arrayBuffer());
  const payslipBase64 = payslipBuffer.toString("base64");
  const payslipName = payslipFile.name;

  let letterBase64: string | null = null;
  let letterName: string | null = null;

  if (employerLetterFile && employerLetterFile.size > 0) {
    const letterBuffer = Buffer.from(await employerLetterFile.arrayBuffer());
    letterBase64 = letterBuffer.toString("base64");
    letterName = employerLetterFile.name;
  }

  // Create Supabase record (before Stripe to get the ID)
  const { data: analysis, error: dbError } = await supabaseAdmin
    .from("analyses")
    .insert({
      email,
      visa_type: visaType as "417" | "462",
      stripe_status: "pending",
      language: language || "fr",
      payslip_b64: payslipBase64,
      payslip_name: payslipName,
      letter_b64: letterBase64,
      letter_name: letterName,
    })
    .select("id")
    .single();

  if (dbError || !analysis) {
    console.error("DB error:", dbError);
    return NextResponse.json({ error: "Failed to create analysis record" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Create Stripe Checkout session
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: CURRENCY,
            product_data: {
              name: `OzVisa — WHV ${visaType} Analysis`,
              description: language === "fr"
                ? "Analyse de documents et guide personnalisé pour votre renouvellement de Working Holiday Visa"
                : "Document analysis and personalized guide for your Working Holiday Visa renewal",
            },
            unit_amount: PRICE_IN_CENTS,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_email: email,
      success_url: `${appUrl}/processing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/upload?cancelled=true`,
      metadata: {
        analysis_id: analysis.id,
        visa_type: visaType,
        language: language || "fr",
      },
    });

    // Update record with Stripe session ID
    await supabaseAdmin
      .from("analyses")
      .update({ stripe_session_id: session.id })
      .eq("id", analysis.id);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    // Clean up the DB record if Stripe fails
    await supabaseAdmin.from("analyses").delete().eq("id", analysis.id);
    return NextResponse.json({ error: "Failed to create payment session" }, { status: 500 });
  }
}
