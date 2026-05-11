"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Suspense } from "react";

interface ProcessingClientProps {
  locale: string;
  title: string;
  subtitle: string;
  stepPayment: string;
  stepExtracting: string;
  stepAnalyzing: string;
  stepGenerating: string;
  redirectText: string;
}

type Step = "payment" | "extracting" | "analyzing" | "generating" | "done";

function ProcessingInner({
  locale,
  title,
  subtitle,
  stepPayment,
  stepExtracting,
  stepAnalyzing,
  stepGenerating,
  redirectText,
}: ProcessingClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session_id");

  const [currentStep, setCurrentStep] = useState<Step>("payment");
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const steps: { key: Step; label: string }[] = [
    { key: "payment", label: stepPayment },
    { key: "extracting", label: stepExtracting },
    { key: "analyzing", label: stepAnalyzing },
    { key: "generating", label: stepGenerating },
  ];

  useEffect(() => {
    if (!sessionId) {
      setError(locale === "fr" ? "Session invalide. Veuillez recommencer." : "Invalid session. Please start again.");
      return;
    }

    let attempts = 0;
    const maxAttempts = 150; // 300 seconds max (150 × 2s), matching server maxDuration

    const poll = async () => {
      try {
        const res = await fetch(`/api/results?session_id=${sessionId}`);
        const data = await res.json();

        if (!res.ok) {
          if (attempts < 5) {
            attempts++;
            setTimeout(poll, 3000);
            return;
          }
          setError(locale === "fr" ? "Erreur lors du traitement. Veuillez contacter le support." : "Processing error. Please contact support.");
          return;
        }

        const status = data.stripe_status;

        if (status === "pending" || status === "paid") {
          // Let the visual timers handle step progression — only keep polling
          if (attempts < maxAttempts) {
            attempts++;
            setTimeout(poll, 2000);
          }
        } else if (status === "completed") {
          setCurrentStep("done");
          setAnalysisId(data.id);
          // Auto-redirect after 1.5s
          setTimeout(() => {
            router.push(`/results?id=${data.id}`);
          }, 1500);
        } else if (status === "analysis_failed") {
          setError(
            locale === "fr"
              ? "L'analyse a échoué. Vérifiez que vos documents sont lisibles et réessayez."
              : "Analysis failed. Please ensure your documents are readable and try again."
          );
        }
      } catch {
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 3000);
        } else {
          setError(locale === "fr" ? "Erreur de connexion." : "Connection error.");
        }
      }
    };

    // Simulate step progression for UX
    setTimeout(() => setCurrentStep("extracting"), 3000);
    setTimeout(() => setCurrentStep("analyzing"), 8000);
    setTimeout(() => setCurrentStep("generating"), 15000);

    poll();
  }, [sessionId, locale, router]);

  function getStepStatus(step: Step): "done" | "active" | "pending" {
    const order: Step[] = ["payment", "extracting", "analyzing", "generating", "done"];
    const stepIndex = order.indexOf(step);
    const currentIndex = order.indexOf(currentStep);

    if (currentStep === "done") return "done";
    if (stepIndex < currentIndex) return "done";
    if (stepIndex === currentIndex) return "active";
    return "pending";
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-3">
            {locale === "fr" ? "Une erreur s'est produite" : "An error occurred"}
          </h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/upload"
            className="inline-flex items-center px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            {locale === "fr" ? "Réessayer" : "Try again"}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-10">
          <span className="text-5xl">🦘</span>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">{title}</h1>
          <p className="mt-2 text-gray-500">{subtitle}</p>
        </div>

        {/* Steps */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="space-y-5">
            {steps.map(({ key, label }) => {
              const status = getStepStatus(key);
              return (
                <div key={key} className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    {status === "done" ? (
                      <CheckCircle2 className="h-7 w-7 text-green-500" />
                    ) : status === "active" ? (
                      <Loader2 className="h-7 w-7 text-blue-500 animate-spin" />
                    ) : (
                      <div className="h-7 w-7 rounded-full border-2 border-gray-200" />
                    )}
                  </div>
                  <span
                    className={`text-base font-medium ${
                      status === "done"
                        ? "text-green-700"
                        : status === "active"
                        ? "text-blue-700"
                        : "text-gray-400"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          {currentStep === "done" && analysisId && (
            <div className="mt-6 pt-6 border-t border-gray-100 text-center">
              <p className="text-green-600 font-medium flex items-center justify-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                {redirectText}
              </p>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-gray-400">
          {locale === "fr"
            ? "Ne fermez pas cette page. L'analyse dure généralement moins de 60 secondes."
            : "Don't close this page. Analysis usually takes less than 60 seconds."}
        </p>
      </div>
    </div>
  );
}

export function ProcessingClient(props: ProcessingClientProps) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
      </div>
    }>
      <ProcessingInner {...props} />
    </Suspense>
  );
}
