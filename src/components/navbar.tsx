"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface NavbarProps {
  locale: string;
}

export function Navbar({ locale }: NavbarProps) {
  const t = useTranslations("nav");
  const [isChangingLang, setIsChangingLang] = useState(false);

  async function toggleLanguage() {
    setIsChangingLang(true);
    const newLocale = locale === "fr" ? "en" : "fr";
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
            <Button
              variant="outline"
              size="sm"
              onClick={toggleLanguage}
              disabled={isChangingLang}
              className="gap-1.5"
            >
              <span className="text-base">{locale === "fr" ? "🇫🇷" : "🇬🇧"}</span>
              <span>{locale === "fr" ? "EN" : "FR"}</span>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
