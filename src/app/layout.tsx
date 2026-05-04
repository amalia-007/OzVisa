import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "OzVisa — Renew your Working Holiday Visa easily",
  description:
    "Upload your payslip or employer letter. AI extracts all the data and guides you step by step through your Australian WHV 417/462 renewal.",
  keywords: "Working Holiday Visa, WHV 417, WHV 462, Australia visa renewal, immigration",
  openGraph: {
    title: "OzVisa — Renew your Working Holiday Visa easily",
    description:
      "Upload your payslip or employer letter. AI extracts all the data and guides you step by step through your Australian WHV 417/462 renewal.",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className="h-full">
      <body className="min-h-full flex flex-col bg-white text-gray-900 antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
