"use client";

import { RichText } from "@/components/math/rich-text";
import { LanguageSelect, ListenButton, useT, useTranslated } from "@/lib/language/client";

/** Server pages can drop these in: text that follows the language picker, and a read-aloud bar. */
export function LocalizedText({ text, as, className }: { text: string; as?: "p" | "div" | "span"; className?: string }) {
  return <RichText as={as} text={useT(text)} className={className} />;
}

export function ReadAloudBar({ texts, label = "Read aloud", className }: { texts: string[]; label?: string; className?: string }) {
  const { texts: tr } = useTranslated(texts);
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <ListenButton text={tr.filter(Boolean).join(" ")} label={label} />
      <LanguageSelect />
    </div>
  );
}
