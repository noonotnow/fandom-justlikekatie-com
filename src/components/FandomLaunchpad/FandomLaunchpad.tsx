import { PUBLIC_ROUTE_PATHS } from "../../../shared/public-routes.js";
import { useEffect, useRef, useState } from "react";
import { trackHomepageGuideMenuLinkSelected, trackHomepageGuideMenuOpened } from "../../utils/analytics";
import styles from "./FandomLaunchpad.module.css";

export function FandomLaunchpad() {
  const [guidesOpen, setGuidesOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
        <p className={styles.kicker}>Fandom Vibes · a growing creative universe</p>
        <h1>Build a world<br /><i>worth sharing.</i></h1>
        <p className={styles.intro}>Fandom Vibes is a creative universe by Katie Hendley, creator of Just Like Katie. Start with the language, genres, and story patterns of C-drama fandom—then take what you notice into Vibe Atlas.</p>
        <nav className={styles.editorialNav} aria-label="Explore C-drama fandom">
          <a className={styles.primaryGuideLink} href="/c-drama-fandom/">Explore the C-drama guide <span aria-hidden="true">↗</span></a>
          <a className={styles.startGuideLink} href="/c-drama-fandom/getting-started/">New to C-dramas? Start here <span aria-hidden="true">↗</span></a>
          <div className={styles.guideMenu} ref={menuRef}>
            <button
              className={styles.guideMenuTrigger}
              ref={triggerRef}
              type="button"
              aria-expanded={guidesOpen}
              aria-controls="fandom-guide-menu"
              onClick={() => {
                if (!guidesOpen) trackHomepageGuideMenuOpened();
                setGuidesOpen(!guidesOpen);
              }}
            >
              More guides <span className={styles.menuChevron} aria-hidden="true">{guidesOpen ? "−" : "+"}</span>
            </button>
            {guidesOpen && (
              <div className={styles.guideMenuPanel} id="fandom-guide-menu">
                <div className={styles.guideMenuGroup}>
                  <h2>Learning</h2>
                  <a href="/c-drama-fandom/glossary/" onClick={() => trackHomepageGuideMenuLinkSelected('glossary')}>Glossary</a>
                  <a href="/c-drama-fandom/archetypes/" onClick={() => trackHomepageGuideMenuLinkSelected('archetypes')}>Archetypes</a>
                </div>
                <div className={styles.guideMenuGroup}>
                  <h2>Reading</h2>
                  <a href="/c-drama-fandom/watch-journal/" onClick={() => trackHomepageGuideMenuLinkSelected('watch_journal')}>Veteran journal</a>
                  <a href="/c-drama-fandom/vibing-now/" onClick={() => trackHomepageGuideMenuLinkSelected('vibing_now')}>Vibing Now</a>
                </div>
              </div>
            )}
          </div>
        </nav>
      </header>
      <section className={styles.editorialGateway} aria-labelledby="c-drama-gateway-title">
        <div className={styles.gatewayHeading}>
          <p className={styles.kicker}>Editorial front door / C-drama fandom</p>
          <h2 id="c-drama-gateway-title">Understand the fandom.<br /><i>Then make it yours.</i></h2>
        </div>
        <a className={styles.gatewayCard} href="/c-drama-fandom/">
          <span className={styles.index}>Begin with the field guide</span>
          <p>Learn the language fans use, tell xianxia from wuxia, recognize the archetypes, follow spoiler-aware story analysis, and enter the veteran first-watch journal.</p>
          <span className={styles.gatewayPaths}>Getting started · Glossary · Genres · Archetypes · Drama deep dives · Veteran journal</span>
          <span className={styles.enter}>Explore C-drama fandom →</span>
        </a>
      </section>
      <section className={styles.workbenches} aria-label="Fandom workbenches">
        <a className={`${styles.workbench} ${styles.atlas}`} href={PUBLIC_ROUTE_PATHS.vibeAtlas}>
          <span className={styles.index}>01 / daily C-drama card drop <b className={styles.launchStatus}>Now launching</b></span>
          <div className={styles.cardArt}><span>VIBE<br /><b>ATLAS</b></span><small>REDNOTE / C-DRAMA</small></div>
          <div className={styles.cardCopy}><h2>C-drama Vibe Atlas</h2><p>Collect the evidence. Confirm your type. <span lang="zh-CN">九张证据，一眼心动</span> Browse today’s drop, save the cards that hit, and build your own 3×3.</p><span className={styles.enter}>Browse today’s card drop →</span></div>
        </a>
        <a className={`${styles.workbench} ${styles.forge}`} href="/memeforge/middle-earth">
          <span className={styles.index}>Also in the studio / middle-earth reactions</span>
          <div className={styles.cardArt}><span>LOTR<br /><b>MEMEFORGE</b></span><small>MIDDLE-EARTH / FIRST WORLD</small></div>
          <div className={styles.cardCopy}><h2>LOTR MemeForge</h2><p>Search the visual record, find the feeling, and forge a Middle-earth reaction artifact worth sending.</p><span className={styles.enter}>Enter MemeForge →</span></div>
        </a>
      </section>
      <footer><span>FANDOM VIBES / VIBE ATLAS IS LIVE</span><span><a href="/c-drama-fandom/">C-drama fandom</a> · By Katie Hendley, creator of <a href="https://justlikekatie.com">Just Like Katie</a>.</span></footer>
    </main>
  );
}

export default FandomLaunchpad;