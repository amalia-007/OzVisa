"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface NavbarProps {
  locale: string;
}

export function Navbar({ locale }: NavbarProps) {
  const t = useTranslations("nav");

  function switchLanguage(newLocale: string) {
    if (newLocale === locale) return;
    document.cookie = `locale=${newLocale}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.reload();
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🦘</span>
            <span className="text-xl font-bold text-gray-900">OzVisa</span>
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/upload">
              <Button size="sm" className="hidden sm:inline-flex">
                {t("upload")}
              </Button>
            </Link>
            <div className="flex items-center gap-1">
              <button
                onClick={() => switchLanguage("fr")}
                className={`text-xl px-2 py-1 rounded-md transition-colors ${
                  locale === "fr"
                    ? "bg-blue-100 ring-2 ring-blue-500"
                    : "hover:bg-gray-100 opacity-50 hover:opacity-80"
                }`}
                title="Français"
              >
                🇫🇷
              </button>
              <button
                onClick={() => switchLanguage("en")}
                className={`text-xl px-2 py-1 rounded-md transition-colors ${
                  locale === "en"
                    ? "bg-blue-100 ring-2 ring-blue-500"
                    : "hover:bg-gray-100 opacity-50 hover:opacity-80"
                }`}
                title="English"
              >
                🇬🇧
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
