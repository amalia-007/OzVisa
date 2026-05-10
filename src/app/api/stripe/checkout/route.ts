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

  const payslipFiles = formData.getAll("payslip").filter((v): v is File => v instanceof File && v.size > 0);
  const letterFiles = formData.getAll("employerLetter").filter((v): v is File => v instanceof File && v.size > 0);
  const email = formData.get("email") as string | null;
  const visaType = formData.get("visaType") as string | null;
  const language = formData.get("language") as string | null;

  // Validate required fields
  if (payslipFiles.length === 0) {
    return NextResponse.json({ error: "At least one payslip is required" }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  if (!visaType || !["417", "462"].includes(visaType)) {
    return NextResponse.json({ error: "Visa type must be 417 or 462" }, { status: 400 });
  }

  // Validate all payslip files
  for (const file of payslipFiles) {
    if (!VALID_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Invalid file type for ${file.name}` }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `File too large (max 10MB): ${file.name}` }, { status: 400 });
    }
  }

  // Validate all letter files
  for (const file of letterFiles) {
    if (!VALID_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Invalid file type for ${file.name}` }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `File too large (max 10MB): ${file.name}` }, { status: 400 });
    }
  }

  // Read all files into base64 (process in memory, never store to disk)
  const payslipsData: Array<{ b64: string; name: string }> = [];
  for (const file of payslipFiles) {
    const buffer = Buffer.from(await file.arrayBuffer());
    payslipsData.push({ b64: buffer.toString("base64"), name: file.name });
  }

  const lettersData: Array<{ b64: string; name: string }> = [];
  for (const file of letterFiles) {
    const buffer = Buffer.from(await file.arrayBuffer());
    lettersData.push({ b64: buffer.toString("base64"), name: file.name });
  }

  // Create Supabase record — store arrays as JSON in existing text columns
  const { data: analysis, error: dbError } = await supabaseAdmin
    .from("analyses")
    .insert({
      email,
      visa_type: visaType as "417" | "462",
      stripe_status: "pending",
      language: language || "fr",
      payslip_b64: JSON.stringify(payslipsData),
      payslip_name: null,
      letter_b64: lettersData.length > 0 ? JSON.stringify(lettersData) : null,
      letter_name: null,
    })
    .select("id")
    .single();

  if (dbError || !analysis) {
    console.error("DB insert failed — code:", dbError?.code);
    console.error("DB insert failed — message:", dbError?.message);
    console.error("DB insert failed — details:", dbError?.details);
    console.error("DB insert failed — hint:", dbError?.hint);
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
      allow_promotion_codes: true,
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
