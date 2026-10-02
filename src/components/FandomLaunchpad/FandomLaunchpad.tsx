import { PUBLIC_ORIGIN, PUBLIC_ROUTE_PATHS, publicAlternatePaths, publicRouteUrl } from "../../../shared/public-routes.js";
import { useEffect, useRef, useState } from "react";
import { trackAgainstTheCurrentEntryClicked, trackHomepageGuideMenuLinkSelected, trackHomepageGuideMenuOpened } from "../../utils/analytics";
import { useLocale } from "../../i18n/LocaleProvider";
import styles from "./FandomLaunchpad.module.css";

export function FandomLaunchpad() {
  const { t, path } = useLocale();
  const [guidesOpen, setGuidesOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const title = t(
      "Fandom Vibes | Daily C-Drama Collectibles & Fandom Guides",
      "Fandom Vibes｜古装剧粉丝指南与 Vibe Atlas",
    );
    const description = t(
      "Browse Vibe Atlas’s daily C-drama collectible: one star, one vibe, and nine pieces of evidence, alongside guides and fandom games.",
      "探索中国古装剧粉丝文化与 Vibe Atlas：每日精选一位演员、一个氛围主题和九张视觉证据。",
    );
    const canonicalPath = path(PUBLIC_ROUTE_PATHS.launchpad);
    const canonicalUrl = publicRouteUrl(canonicalPath);

    document.title = title;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?? document.head.appendChild(document.createElement("link"));
    canonical.rel = "canonical";
    canonical.href = canonicalUrl;

    for (const alternate of publicAlternatePaths(PUBLIC_ROUTE_PATHS.launchpad)) {
      const link = document.querySelector<HTMLLinkElement>(
        `link[rel="alternate"][hreflang="${alternate.hreflang}"]`,
      ) ?? document.head.appendChild(document.createElement("link"));
      link.rel = "alternate";
      link.hreflang = alternate.hreflang;
      link.href = publicRouteUrl(alternate.path);
    }

    const setMetaContent = (
      selector: string,
      attribute: "name" | "property",
      key: string,
      content: string,
    ) => {
      const meta = document.querySelector<HTMLMetaElement>(selector)
        ?? document.head.appendChild(document.createElement("meta"));
      meta.setAttribute(attribute, key);
      meta.content = content;
    };
    setMetaContent('meta[name="description"]', "name", "description", description);
    setMetaContent('meta[property="og:title"]', "property", "og:title", title);
    setMetaContent('meta[property="og:description"]', "property", "og:description", description);
    setMetaContent('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    setMetaContent('meta[property="og:image"]', "property", "og:image", `${PUBLIC_ORIGIN}/assets/c-drama-fandom/lg01-master-og.jpg`);
    setMetaContent('meta[name="twitter:title"]', "name", "twitter:title", title);
    setMetaContent('meta[name="twitter:description"]', "name", "twitter:description", description);
    setMetaContent('meta[name="twitter:image"]', "name", "twitter:image", `${PUBLIC_ORIGIN}/assets/c-drama-fandom/lg01-master-og.jpg`);
  }, [path, t]);

  useEffect(() => {
    if (!guidesOpen) return;

    const dismissOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setGuidesOpen(false);
    };
    const dismissOnFocusOutside = (event: FocusEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setGuidesOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setGuidesOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOnFocusOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOnFocusOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [guidesOpen]);

  return (
    <main className={styles.launchpad}>
      <header className={styles.header}>
        <div className={styles.mark}>FV / 01</div>
        <p className={styles.kicker}>{t("Fandom Vibes · a growing creative universe", "Fandom Vibes · 不断生长的创作宇宙")}</p>
        <h1>{t("Build a world", "构筑一个")}<br /><i>{t("worth sharing.", "值得分享的世界。")}</i></h1>
        <p className={styles.intro}>{t("Fandom Vibes is a creative universe by Katie Hendley, creator of Just Like Katie. Start with the language, genres, and story patterns of C-drama fandom—then take what you notice into Vibe Atlas.", "Fandom Vibes 是由 Just Like Katie 创作者 Katie Hendley 打造的创作宇宙。从中剧粉丝文化的语言、类型与故事模式开始探索，再将你的发现带入氛围图鉴。")}</p>
        <nav className={styles.editorialNav} aria-label={t("Explore C-drama fandom", "探索中剧粉丝文化")}>
          <a className={styles.primaryGuideLink} href="/c-drama-fandom/">{t("Explore the C-drama guide (English)", "探索中剧指南（英文）")} <span aria-hidden="true">↗</span></a>
          <a className={styles.startGuideLink} href="/c-drama-fandom/getting-started/">{t("New to C-dramas? Start here (English)", "中剧新手？从这里开始（英文）")} <span aria-hidden="true">↗</span></a>
          <div className={styles.guideMenu} ref={menuRef}>
            <button
              className={styles.guideMenuTrigger}
              ref={triggerRef}
              type="button"
              aria-expanded={guidesOpen}
              aria-controls="fandom-guide-menu"
              aria-label={t("More guides", "更多指南")}
              onClick={() => {
                if (!guidesOpen) trackHomepageGuideMenuOpened();
                setGuidesOpen(!guidesOpen);
              }}
            >
              {t("More guides", "更多指南")} <span className={styles.menuChevron} aria-hidden="true">{guidesOpen ? "−" : "+"}</span>
            </button>
            {guidesOpen && (
              <div className={styles.guideMenuPanel} id="fandom-guide-menu">
                <div className={styles.guideMenuGroup}>
                  <h2>{t("Learning · English", "学习 · 英文")}</h2>
                  <a href="/c-drama-fandom/glossary/" onClick={() => trackHomepageGuideMenuLinkSelected('glossary')}>{t("Glossary (English)", "术语表（英文）")}</a>
                  <a href="/c-drama-fandom/archetypes/" onClick={() => trackHomepageGuideMenuLinkSelected('archetypes')}>{t("Archetypes (English)", "角色原型（英文）")}</a>
                </div>
                <div className={styles.guideMenuGroup}>
                  <h2>{t("Reading · English", "阅读 · 英文")}</h2>
                  <a href="/c-drama-fandom/watch-journal/" onClick={() => trackHomepageGuideMenuLinkSelected('watch_journal')}>{t("Veteran journal (English)", "追剧老粉手记（英文）")}</a>
                  <a href="/c-drama-fandom/vibing-now/" onClick={() => trackHomepageGuideMenuLinkSelected('vibing_now')}>{t("Vibing Now (English)", "正在追的剧（英文）")}</a>
                </div>
              </div>
            )}
          </div>
        </nav>
      </header>
      <section className={styles.editorialGateway} aria-labelledby="c-drama-gateway-title">
        <div className={styles.gatewayHeading}>
          <p className={styles.kicker}>{t("Editorial front door / C-drama fandom", "中剧粉丝文化指南")}</p>
          <h2 id="c-drama-gateway-title">{t("Understand the fandom.", "读懂粉丝文化。")}<br /><i>{t("Then make it yours.", "再创作属于你的故事。")}</i></h2>
        </div>
        <div className={styles.gatewayLinks}>
          <a className={styles.gatewayCard} href="/c-drama-fandom/">
            <span className={styles.index}>{t("Begin with the field guide (English)", "从粉丝文化指南开始（英文）")}</span>
            <p>{t("Learn the language fans use, tell xianxia from wuxia, recognize the archetypes, follow spoiler-aware story analysis, and enter the veteran first-watch journal.", "了解粉丝常用语、辨别仙侠与武侠、认识角色原型、阅读注意剧透边界的剧情分析，并进入资深粉丝的首次追剧手记。")}</p>
            <span className={styles.gatewayPaths}>{t("Getting started · Glossary · Genres · Archetypes · Drama deep dives · Veteran journal (English)", "入门 · 术语 · 类型 · 角色原型 · 剧集深读 · 资深粉丝手记（英文）")}</span>
            <span className={styles.enter}>{t("Explore C-drama fandom (English)", "探索中剧粉丝文化（英文）")} →</span>
          </a>
          <a className={styles.seriesFeature} href="/c-drama-fandom/vibing-now/" onClick={trackAgainstTheCurrentEntryClicked}>
            <span className={styles.index}>{t("Featured reading / Vibing Now (English)", "精选阅读 / 正在追的剧（英文）")}</span>
            <strong>Against the Current</strong>
            <span>{t("Follow three spoiler-bounded C-drama readings. Choose your safe stopping point: Episode 21, Episodes 22–25, or Episodes 26–30.", "阅读三篇标明剧透范围的中剧解读。按自己的观看进度选择：第 21 集、第 22–25 集或第 26–30 集。")}</span>
            <span className={styles.enter}>{t("Explore the Against the Current series (English)", "阅读《逆流而上》系列（英文）")} →</span>
          </a>
        </div>
      </section>
      <section className={styles.workbenches} aria-label={t("Fandom workbenches", "粉丝创作工作台")}>
        <a className={`${styles.workbench} ${styles.atlas}`} href={path(PUBLIC_ROUTE_PATHS.vibeAtlas)}>
          <span className={styles.index}>{t("01 / daily C-drama card drop", "01 / 每日中剧卡组")} <b className={styles.launchStatus}>{t("Now launching", "现已上线")}</b></span>
          <div className={styles.cardArt}><span>VIBE<br /><b>ATLAS</b></span><small>REDNOTE / C-DRAMA</small></div>
          <div className={styles.cardCopy}><h2>{t("C-drama Vibe Atlas", "中剧氛围图鉴")}</h2><p>{t("Collect the evidence. Confirm your type.", "收集心动证据，确认你的偏爱。")} <span lang="zh-CN">九张证据，一眼心动</span> {t("Browse today’s drop, save the cards that hit, and build your own 3×3.", "浏览今日卡组，收藏心动卡片，拼出专属 3×3 九宫格。")}</p><span className={styles.enter}>{t("Browse today’s card drop", "浏览今日卡组")} →</span></div>
        </a>
        <a className={`${styles.workbench} ${styles.forge}`} href="/memeforge/middle-earth">
          <span className={styles.index}>{t("Also in the studio / middle-earth reactions (English)", "工作室另有 / 中洲表情创作（英文）")}</span>
          <div className={styles.cardArt}><span>LOTR<br /><b>MEMEFORGE</b></span><small>MIDDLE-EARTH / FIRST WORLD</small></div>
          <div className={styles.cardCopy}><h2>LOTR MemeForge</h2><p>{t("Search the visual record, find the feeling, and forge a Middle-earth reaction artifact worth sending. (English)", "搜索影像资料，找到契合的情绪，制作值得分享的中洲反应图。（英文）")}</p><span className={styles.enter}>{t("Enter MemeForge (English)", "进入 MemeForge（英文）")} →</span></div>
        </a>
      </section>
      <footer><span>{t("FANDOM VIBES / VIBE ATLAS IS LIVE", "FANDOM VIBES / 氛围图鉴现已上线")}</span><span><a href="/c-drama-fandom/">{t("C-drama fandom guide (English)", "中剧粉丝文化指南（英文）")}</a> · {t("By Katie Hendley, creator of", "由 Katie Hendley 创作，她也是")} <a href="https://justlikekatie.com">Just Like Katie (English)</a>.</span></footer>
    </main>
  );
}

export default FandomLaunchpad;
