import styles from "./FandomLaunchpad.module.css";

export function FandomLaunchpad() {
  return (
    <main className={styles.launchpad}>
      <header className={styles.header}>
        <div className={styles.mark}>FV / 01</div>
        <p className={styles.kicker}>Fandom Vibes · a growing creative universe</p>
        <h1>Build a world<br /><i>worth sharing.</i></h1>
        <p className={styles.intro}>Fandom Vibes is a creative universe by Katie Hendley, creator of Just Like Katie. Start with the language, genres, and story patterns of C-drama fandom—then take what you notice into Vibe Atlas.</p>
        <nav className={styles.editorialNav} aria-label="Explore C-drama fandom">
          <a href="/c-drama-fandom/">Enter C-drama fandom</a>
          <a href="/c-drama-fandom/getting-started/">Start here</a>
          <a href="/c-drama-fandom/glossary/">Browse the glossary</a>
          <a href="/c-drama-fandom/archetypes/">Decode archetypes</a>
          <a href="/c-drama-fandom/watch-journal/">Veteran journal</a>
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
        <a className={`${styles.workbench} ${styles.atlas}`} href="/vibe-atlas">
          <span className={styles.index}>01 / daily C-drama card drop <b className={styles.launchStatus}>Now launching</b></span>
          <div className={styles.cardArt}><span>VIBE<br /><b>ATLAS</b></span><small>REDNOTE / C-DRAMA</small></div>
          <div className={styles.cardCopy}><h2>C-drama Vibe Atlas</h2><p>One star, one vibe, nine pieces of evidence. Like Pokémon, but thirsty. You wanna catch all these. Browse today’s drop, save the cards that hit, and build your own 3×3.</p><span className={styles.enter}>Browse today’s card drop →</span></div>
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