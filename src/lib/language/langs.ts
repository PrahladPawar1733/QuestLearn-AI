/**
 * Languages offered in games. Each is supported by both Cloud Translation (`code`) and
 * Cloud Text-to-Speech (`tts`). English is the source language: no translation call.
 */
export const LANGUAGES = [
  { code: "en", label: "English", tts: "en-IN" },
  { code: "hi", label: "हिन्दी", tts: "hi-IN" },
  { code: "bn", label: "বাংলা", tts: "bn-IN" },
  { code: "ta", label: "தமிழ்", tts: "ta-IN" },
  { code: "te", label: "తెలుగు", tts: "te-IN" },
  { code: "mr", label: "मराठी", tts: "mr-IN" },
  { code: "gu", label: "ગુજરાતી", tts: "gu-IN" },
  { code: "kn", label: "ಕನ್ನಡ", tts: "kn-IN" },
  { code: "ml", label: "മലയാളം", tts: "ml-IN" },
  { code: "pa", label: "ਪੰਜਾਬੀ", tts: "pa-IN" },
  { code: "es", label: "Español", tts: "es-ES" },
  { code: "fr", label: "Français", tts: "fr-FR" },
  { code: "ar", label: "العربية", tts: "ar-XA" },
] as const;

export type Lang = (typeof LANGUAGES)[number]["code"];
export const LANG_CODES = LANGUAGES.map((l) => l.code) as [Lang, ...Lang[]];
export const isLang = (s: unknown): s is Lang => typeof s === "string" && (LANG_CODES as string[]).includes(s);
export const ttsCode = (l: Lang) => LANGUAGES.find((x) => x.code === l)!.tts;
export const isRtl = (l: Lang) => l === "ar";
