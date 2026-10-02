import type { Locale } from "./locale";
import styles from "./LocaleProvider.module.css";

interface Props {
  locale: Locale;
  languageLabel: string;
  onChange: (locale: Locale) => void;
}

export function LanguageSelector({ locale, languageLabel, onChange }: Props) {
  return (
    <div className={styles.selector}>
      <label className={styles.visuallyHidden} htmlFor="fandom-language-selector">
        {languageLabel}
      </label>
      <select
        id="fandom-language-selector"
        aria-label={languageLabel}
        value={locale}
        onChange={event => onChange(event.target.value === "zh-CN" ? "zh-CN" : "en")}
      >
        <option value="en">English</option>
        <option value="zh-CN">简体中文</option>
      </select>
    </div>
  );
}