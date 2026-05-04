import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ResultsClient } from "./results-client";

interface ResultsPageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function ResultsPage({ searchParams }: ResultsPageProps) {
  const params = await searchParams;
  const id = params.id;

  if (!id) notFound();

  const { data: analysis, error } = await supabaseAdmin
    .from("analyses")
    .select("id, email, visa_type, stripe_status, analysis_result, language, created_at")
    .eq("id", id)
    .single();

  if (error || !analysis) notFound();

  if (!["completed"].includes(analysis.stripe_status) || !analysis.analysis_result) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar locale={analysis.language || "fr"} />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <p className="text-6xl mb-6">⏳</p>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">
              {analysis.language === "fr" ? "Analyse en cours..." : "Analysis in progress..."}
            </h1>
            <p className="text-gray-500 mb-6">
              {analysis.language === "fr"
                ? "Votre analyse est en cours de traitement. Revenez dans quelques instants."
                : "Your analysis is being processed. Check back in a moment."}
            </p>
            <a
              href={`/results?id=${id}`}
              className="inline-flex px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              {analysis.language === "fr" ? "Actualiser" : "Refresh"}
            </a>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const locale = await getLocale();

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar locale={locale} />
      <main className="flex-1 py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <ResultsClient
            analysisId={analysis.id}
            email={analysis.email}
            visaType={analysis.visa_type}
            language={analysis.language}
            result={analysis.analysis_result}
            createdAt={analysis.created_at}
            locale={locale}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
