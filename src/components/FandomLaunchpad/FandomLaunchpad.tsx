import styles from "./FandomLaunchpad.module.css";

export function FandomLaunchpad() {
  return (
    <main className={styles.launchpad}>
      <header className={styles.header}>
        <div className={styles.mark}>F / 01</div>
        <p className={styles.kicker}>Personal fandom workbenches</p>
        <h1>Make the feeling<br /><i>shareable.</i></h1>
        <p className={styles.intro}>Fandom is a modular launchpad for turning the worlds you love into post-ready visual artifacts — with a little more taste and a lot less scrolling.</p>
      </header>
      <section className={styles.workbenches} aria-label="Fandom workbenches">
        <a className={`${styles.workbench} ${styles.atlas}`} href="/vibe-atlas">
          <span className={styles.index}>01 / social-post engine</span>
          <div className={styles.cardArt}><span>VIBE<br /><b>ATLAS</b></span><small>REDNOTE / C-DRAMA</small></div>
          <div className={styles.cardCopy}><h2>C-drama Vibe Atlas</h2><p>Build the moodboard, caption, and tiny emotional weather system for your next post.</p><span className={styles.enter}>Enter workbench →</span></div>
        </a>
        <a className={`${styles.workbench} ${styles.forge}`} href="/memeforge/middle-earth">
          <span className={styles.index}>02 / meme & caption engine</span>
          <div className={styles.cardArt}><span>LOTR<br /><b>MEMEFORGE</b></span><small>MIDDLE-EARTH / FIRST WORLD</small></div>
          <div className={styles.cardCopy}><h2>LOTR MemeForge</h2><p>Search the visual record, find the feeling, and forge a caption artifact worth sending.</p><span className={styles.enter}>Enter workbench →</span></div>
        </a>
      </section>
      <footer><span>FANDOM / MODULAR BY DESIGN</span><span>Two worlds. One deliberate system.</span></footer>
    </main>
  );
}

export default FandomLaunchpad;