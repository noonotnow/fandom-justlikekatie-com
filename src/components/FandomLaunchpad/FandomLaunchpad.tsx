import styles from "./FandomLaunchpad.module.css";

export function FandomLaunchpad() {
  return (
    <main className={styles.launchpad}>
      <header className={styles.header}>
        <div className={styles.mark}>FV / 01</div>
        <p className={styles.kicker}>Fandom Vibes · a growing creative universe</p>
        <h1>Build a world<br /><i>worth sharing.</i></h1>
        <p className={styles.intro}>Fandom Vibes is a home for the tools we make around the worlds we love — from daily C-drama atmosphere to Middle-earth reaction craft and whatever fandom comes next.</p>
      </header>
      <section className={styles.workbenches} aria-label="Fandom workbenches">
        <a className={`${styles.workbench} ${styles.atlas}`} href="/vibe-atlas">
          <span className={styles.index}>01 / c-drama atmosphere studio</span>
          <div className={styles.cardArt}><span>VIBE<br /><b>ATLAS</b></span><small>REDNOTE / C-DRAMA</small></div>
          <div className={styles.cardCopy}><h2>C-drama Vibe Atlas</h2><p>Build the moodboard, caption, and tiny emotional weather system for your next post.</p><span className={styles.enter}>Enter workbench →</span></div>
        </a>
        <a className={`${styles.workbench} ${styles.forge}`} href="/memeforge/middle-earth">
          <span className={styles.index}>02 / middle-earth reaction studio</span>
          <div className={styles.cardArt}><span>LOTR<br /><b>MEMEFORGE</b></span><small>MIDDLE-EARTH / FIRST WORLD</small></div>
          <div className={styles.cardCopy}><h2>LOTR MemeForge</h2><p>A separate Middle-earth workbench — independent from Vibe Atlas admin and CREATE. Search the visual record, find the feeling, and forge a caption artifact worth sending.</p><span className={styles.enter}>Enter separate workbench →</span></div>
        </a>
      </section>
      <footer><span>FANDOM VIBES / MODULAR BY DESIGN</span><span>Two worlds now. More universes to come.</span></footer>
    </main>
  );
}

export default FandomLaunchpad;