import { getLocale, getTranslations } from "next-intl/server";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { UploadForm } from "@/components/upload-form";

export default async function UploadPage() {
  const locale = await getLocale();
  const t = await getTranslations("upload");

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar locale={locale} />
      <main className="flex-1 py-12 px-4 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-gray-900">{t("title")}</h1>
            <p className="mt-3 text-gray-500">{t("subtitle")}</p>
          </div>
          <UploadForm locale={locale} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
