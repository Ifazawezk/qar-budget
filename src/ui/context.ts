import { categoryName } from "../lib/categories";
import { formatPercent } from "../lib/format";
import { isRtl, type Lang, localeFor, type Translate, translator } from "../lib/i18n";
import { type Dirhams, formatQAR } from "../lib/money";

/** Everything a view needs to speak the current language. */
export interface UiContext {
  lang: Lang;
  locale: string;
  rtl: boolean;
  t: Translate;
  category: (id: string) => string;
  money: (amount: Dirhams) => string;
  percent: (value: number) => string;
  count: (value: number) => string;
}

export function uiContext(lang: Lang): UiContext {
  const locale = localeFor(lang);
  const numbers = new Intl.NumberFormat(locale);
  return {
    lang,
    locale,
    rtl: isRtl(lang),
    t: translator(lang),
    category: (id) => categoryName(id, lang),
    money: (amount) => formatQAR(amount, locale),
    percent: (value) => formatPercent(value, locale),
    count: (value) => numbers.format(value),
  };
}
