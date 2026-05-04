import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FAQItem } from "@/components/faq-item";
import {
  Upload,
  CreditCard,
  FileCheck,
  Shield,
  Database,
  Globe,
  CheckCircle2,
  ArrowRight,
  Copy,
  Download,
  Mail,
} from "lucide-react";

export default async function HomePage() {
  const locale = await getLocale();
  const t = await getTranslations("landing");
  const features = t.raw("pricing.features") as string[];

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar locale={locale} />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-blue-50 to-white py-20 sm:py-28">
          <div className="relative mx-auto max-w-4xl px-4 sm:px-6 text-center">
            <Badge className="mb-6 text-sm px-4 py-1.5">{t("hero.badge")}</Badge>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
              {t("hero.title")}{" "}
              <span className="text-blue-600">{t("hero.titleHighlight")}</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              {t("hero.subtitle")}
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/upload">
                <Button size="xl" className="gap-2 w-full sm:w-auto shadow-lg">
                  <Upload className="h-5 w-5" />
                  {t("hero.cta")}
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-sm text-gray-500">{t("hero.ctaSub")}</p>
          </div>
        </section>

        {/* Trust signals */}
        <section className="border-y border-gray-100 bg-gray-50 py-8">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
              <div className="flex flex-col items-center gap-2">
                <Shield className="h-7 w-7 text-blue-600" />
                <p className="font-semibold text-gray-900">{t("trust.secure")}</p>
                <p className="text-sm text-gray-500">{t("trust.secureDesc")}</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Database className="h-7 w-7 text-green-600" />
                <p className="font-semibold text-gray-900">{t("trust.noStorage")}</p>
                <p className="text-sm text-gray-500">{t("trust.noStorageDesc")}</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Globe className="h-7 w-7 text-purple-600" />
                <p className="font-semibold text-gray-900">{t("trust.official")}</p>
                <p className="text-sm text-gray-500">{t("trust.officialDesc")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 px-4 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">{t("howItWorks.title")}</h2>
              <p className="mt-3 text-gray-500 text-lg">{t("howItWorks.subtitle")}</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              <StepCard
                number="1"
                icon={<Upload className="h-8 w-8 text-blue-600" />}
                title={t("howItWorks.step1.title")}
                description={t("howItWorks.step1.description")}
              />
              <StepCard
                number="2"
                icon={<CreditCard className="h-8 w-8 text-blue-600" />}
                title={t("howItWorks.step2.title")}
                description={t("howItWorks.step2.description")}
              />
              <StepCard
                number="3"
                icon={<FileCheck className="h-8 w-8 text-blue-600" />}
                title={t("howItWorks.step3.title")}
                description={t("howItWorks.step3.description")}
              />
            </div>
          </div>
        </section>

        {/* What you get */}
        <section className="bg-blue-50 py-20 px-4 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
                {locale === "fr" ? "Ce que vous obtenez" : "What you get"}
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <FeatureItem icon={<Copy className="h-5 w-5 text-blue-600" />} text={locale === "fr" ? "Données extraites avec boutons copier-coller" : "Extracted data with copy-paste buttons"} />
              <FeatureItem icon={<CheckCircle2 className="h-5 w-5 text-green-600" />} text={locale === "fr" ? "Vérification éligibilité 2ème WHV" : "2nd WHV eligibility check"} />
              <FeatureItem icon={<FileCheck className="h-5 w-5 text-purple-600" />} text={locale === "fr" ? "Guide étape par étape personnalisé" : "Personalized step-by-step guide"} />
              <FeatureItem icon={<Globe className="h-5 w-5 text-blue-600" />} text={locale === "fr" ? "Liens directs vers les formulaires officiels" : "Direct links to official forms"} />
              <FeatureItem icon={<Download className="h-5 w-5 text-blue-600" />} text={locale === "fr" ? "PDF téléchargeable de votre résumé" : "Downloadable PDF summary"} />
              <FeatureItem icon={<Mail className="h-5 w-5 text-blue-600" />} text={locale === "fr" ? "Résultats envoyés par email" : "Results sent by email"} />
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="py-20 px-4 sm:px-6">
          <div className="mx-auto max-w-lg">
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">{t("pricing.title")}</h2>
            </div>
            <Card className="overflow-hidden border-2 border-blue-600 shadow-xl">
              <div className="bg-blue-600 py-8 text-center">
                <p className="text-5xl font-bold text-white">{t("pricing.price")}</p>
                <p className="text-blue-200 mt-2">{t("pricing.period")}</p>
              </div>
              <CardContent className="p-8">
                <ul className="space-y-3">
                  {features.map((feature: string, i: number) => (
                    <li key={i} className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/upload" className="mt-8 block">
                  <Button size="lg" className="w-full gap-2">
                    {t("pricing.cta")}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <p className="mt-4 text-center text-xs text-gray-400">{t("pricing.guarantee")}</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-gray-50 py-20 px-4 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">{t("faq.title")}</h2>
            </div>
            <div className="space-y-3">
              <FAQItem question={t("faq.q1")} answer={t("faq.a1")} />
              <FAQItem question={t("faq.q2")} answer={t("faq.a2")} />
              <FAQItem question={t("faq.q3")} answer={t("faq.a3")} />
              <FAQItem question={t("faq.q4")} answer={t("faq.a4")} />
              <FAQItem question={t("faq.q5")} answer={t("faq.a5")} />
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20 px-4 sm:px-6 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            {locale === "fr" ? "Prêt à renouveler votre visa ?" : "Ready to renew your visa?"}
          </h2>
          <p className="text-gray-500 mb-8 text-lg">
            {locale === "fr"
              ? "Commencez maintenant et obtenez vos résultats en moins de 2 minutes."
              : "Start now and get your results in under 2 minutes."}
          </p>
          <Link href="/upload">
            <Button size="xl" className="gap-2 shadow-lg">
              <Upload className="h-5 w-5" />
              {locale === "fr" ? "Analyser mes documents" : "Analyze my documents"}
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function StepCard({
  number,
  icon,
  title,
  description,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="relative flex flex-col items-center text-center p-6 rounded-2xl bg-white border border-gray-100 shadow-sm">
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
        {number}
      </div>
      <div className="mt-4 mb-4 p-3 rounded-full bg-blue-50">{icon}</div>
      <h3 className="font-bold text-gray-900 text-lg mb-2">{title}</h3>
      <p className="text-gray-500 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function FeatureItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 bg-white rounded-lg p-4 shadow-sm border border-gray-100">
      {icon}
      <span className="text-gray-700 text-sm font-medium">{text}</span>
    </div>
  );
}
