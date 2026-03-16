import { de } from "./locales/de";

export type Locale = "en" | "de" | "zh-CN" | "ja" | "kr";

export interface TranslationDictionary {
  [key: string]: string;
}

class I18nService {
  private dictionaries: Partial<Record<Locale, TranslationDictionary>> = {};
  private regexCache: Partial<Record<Locale, RegExp>> = {};
  private sortedKeysCache: Partial<Record<Locale, string[]>> = {};

  constructor() {
    this.loadDictionary("de", de);
  }

  /**
   * Load a dictionary for a specific locale.
   */
  loadDictionary(locale: Locale, dict: TranslationDictionary) {
    this.dictionaries[locale] = {
      ...(this.dictionaries[locale] || {}),
      ...dict,
    };
    // Invalidate caches
    delete this.regexCache[locale];
    delete this.sortedKeysCache[locale];
  }

  /**
   * Translates a string using the dictionary of the specified locale.
   * If an exact match is found, it returns the translation.
   * Otherwise, it performs substring replacement using longest-match-first strategy.
   */
  translate(text: string, fromLocale: Locale): string {
    if (!text) return text;

    const dict = this.dictionaries[fromLocale];
    if (!dict) return text;

    // Exact match optimization
    if (dict[text]) return dict[text];

    const regex = this.getRegexForLocale(fromLocale);
    if (!regex) return text;

    return text.replace(regex, (match) => dict[match] || match);
  }

  /**
   * Returns the full dictionary for a locale.
   */
  getDictionary(locale: Locale): TranslationDictionary {
    return this.dictionaries[locale] || {};
  }

  /**
   * Returns all supported locales that have a loaded dictionary.
   */
  getSupportedLocales(): Locale[] {
    return Object.keys(this.dictionaries) as Locale[];
  }

  private getRegexForLocale(locale: Locale): RegExp | null {
    if (this.regexCache[locale]) return this.regexCache[locale]!;

    const keys = this.getSortedKeysForLocale(locale);
    if (keys.length === 0) return null;

    const regex = new RegExp(
      keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
      "g",
    );

    this.regexCache[locale] = regex;
    return regex;
  }

  private getSortedKeysForLocale(locale: Locale): string[] {
    if (this.sortedKeysCache[locale]) return this.sortedKeysCache[locale]!;

    const dict = this.dictionaries[locale];
    if (!dict) return [];

    const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
    this.sortedKeysCache[locale] = keys;
    return keys;
  }
}

export const i18n = new I18nService();
