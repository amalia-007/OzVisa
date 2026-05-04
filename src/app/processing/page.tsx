import { getLocale, getTranslations } from "next-intl/server";
import { ProcessingClient } from "./processing-client";

export default async function ProcessingPage() {
  const locale = await getLocale();
  const t = await getTranslations("processing");

  return (
    <ProcessingClient
      locale={locale}
      title={t("title")}
      subtitle={t("subtitle")}
      stepPayment={t("steps.payment")}
      stepExtracting={t("steps.extracting")}
      stepAnalyzing={t("steps.analyzing")}
      stepGenerating={t("steps.generating")}
      redirectText={t("redirect")}
    />
  );
}
