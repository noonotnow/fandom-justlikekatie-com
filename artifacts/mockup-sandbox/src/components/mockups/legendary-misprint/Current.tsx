const filters = ['All', 'Legendary Misprints', 'Dylan Wang', 'David Bowie'];

function Icon({ kind, className = '' }: { kind: 'archive' | 'badge' | 'download' | 'eye' | 'lock' | 'sparkle'; className?: string }) {
  const paths = {
    archive: <><path d="M3 5h18v4H3z" /><path d="M5 9h14v10H5zM10 13h4" /></>,
    badge: <><path d="m12 3 2 2.2 3-.3.8 2.9 2.6 1.6-1.1 2.8.8 2.9-2.7 1.5L12 21l-2.3-2.2-3-.8-1.1-2.8-2.6-1.6.8-2.9-1.1-2.8 2.6-1.5.8-2.9 3 .3L12 3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    download: <><path d="M12 3v11" /><path d="m8 10 4 4 4-4M5 20h14" /></>,
    eye: <><path d="M2.5 12s3.2-5 9.5-5 9.5 5 9.5 5-3.2 5-9.5 5-9.5-5-9.5-5Z" /><circle cx="12" cy="12" r="2.2" /></>,
    lock: <><rect x="4" y="10" width="16" height="10" rx="1.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" /></>,
    sparkle: <path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z" />,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-[1em] w-[1em] fill-none stroke-current stroke-[1.8] ${className}`}>{paths[kind]}</svg>;
}

function MisprintSeal() {
  return (
    <div
      role="img"
      aria-label="Legendary Misprint"
      title="Legendary Misprint"
      className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full border-2 border-dashed border-[#9467ff] bg-[#1b1530]/85 text-[#bda3ff] shadow-[0_0_0_3px_rgba(148,103,255,.16),0_5px_16px_rgba(0,0,0,.45)] backdrop-blur"
    >
      <svg viewBox="0 0 28 28" aria-hidden="true" className="h-6 w-6 fill-none stroke-current">
        <rect x="6" y="6" width="15" height="15" rx="1.5" strokeWidth="1.7" />
        <rect x="8.5" y="4" width="15" height="15" rx="1.5" strokeWidth="1.15" opacity=".6" />
        <path d="m10.5 10.5 6 6m0-6-6 6" strokeWidth="1.8" />
        <path d="M4 20.5h5M19.5 23v-4" strokeWidth="1.1" opacity=".75" />
      </svg>
      <span className="sr-only">Legendary Misprint</span>
    </div>
  );
}

export function Current() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#111116] px-4 py-7 font-sans text-[#f4f0e8] sm:px-7">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-4 border-b border-[#c9a96e]/35 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.22em] text-[#d8bd83]">
              <Icon kind="archive" className="text-[13px]" />
              Vibe Atlas / Collection
            </p>
            <h1 className="font-serif text-3xl leading-none tracking-tight text-[#d8bd83] sm:text-4xl">
              我的收藏 · My Collection
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#f4f0e8]/65">
              Keep complete visual worlds and individual finds ready for their next form.
            </p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#d8bd83]">4 grids · 18 results</span>
        </header>

        <section className="my-5 flex flex-col gap-3 border-b border-white/10 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[#f4f0e8]/72">Synced as <strong className="font-semibold text-[#f4f0e8]">elara@atlas.studio</strong></p>
          <button className="w-fit border border-white/20 px-3 py-1.5 text-xs text-[#f4f0e8]/75 transition hover:border-[#d8bd83] hover:text-[#d8bd83]">
            Sign out
          </button>
        </section>

        <nav className="flex gap-6 border-b border-white/15 text-sm" aria-label="Collection artifact type">
          <button className="border-b-2 border-[#d8bd83] pb-3 font-medium text-white">
            Grids <span className="ml-1 text-xs text-[#d8bd83]">4</span>
          </button>
          <button className="pb-3 text-[#f4f0e8]/55 transition hover:text-white">
            Saved results <span className="ml-1 text-xs text-[#d8bd83]">18</span>
          </button>
          <button className="pb-3 text-[#f4f0e8]/55 transition hover:text-white">Build a grid</button>
        </nav>

        <div className="flex flex-wrap gap-2 py-5" aria-label="Filter collection by actor">
          {filters.map((filter) => (
            <button
              key={filter}
              aria-pressed={filter === 'Legendary Misprints'}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                filter === 'Legendary Misprints'
                  ? 'border-[#e3c77f] bg-[#d8bd83] text-[#17130d]'
                  : 'border-[#d8bd83]/35 text-[#d8bd83] hover:bg-[#d8bd83]/10'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        <section className="border-t border-white/10 pt-6" aria-label="Saved grids">
          <article className="grid gap-6 pb-8 md:grid-cols-[minmax(220px,320px)_minmax(0,1fr)]">
            <button className="group relative overflow-hidden rounded-xl bg-[#201b20] text-left shadow-[0_18px_45px_rgba(0,0,0,.32)] ring-1 ring-[#d8bd83]/35">
              <img
                src="/__mockup/images/mixed-grid.png"
                alt="Saved mixed Vibe Atlas grid, unexpectedly showing Gandalf in a reaction image workflow"
                className="block aspect-square w-full object-cover object-center opacity-95 transition duration-300 group-hover:scale-[1.025]"
              />
              <MisprintSeal />
              <span className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0d0c10]/90 to-transparent" />
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-[#111116]/80 px-2.5 py-1.5 text-[10px] font-semibold tracking-wide text-white backdrop-blur">
                <Icon kind="eye" className="text-[12px]" /> View larger
              </span>
            </button>

            <div className="flex min-w-0 flex-col justify-end">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#e3c77f]">
                    <Icon kind="sparkle" className="text-[13px]" /> Exception artifact
                  </p>
                  <h2 className="font-serif text-3xl leading-none text-[#f7df9d]">Legendary Misprint</h2>
                  <p className="mt-2 text-sm font-semibold text-[#d8bd83]">Vibe Atlas × Gandalf · Study session reaction</p>
                </div>
                <time className="whitespace-nowrap pt-1 text-[11px] text-[#f4f0e8]/52">Jun 18, 2025</time>
              </div>

              <div className="mt-5 rounded-md border border-[#d8bd83]/20 bg-[#d8bd83]/10 px-3 py-2 font-mono text-xs text-[#f4f0e8]/78">
                <span className="mr-2 text-[#e3c77f]">⌕</span>
                boromir one does not simply study session meme reaction gif
              </div>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-[#f4f0e8]/70">
                A one-time, event-scoped historical system blooper. This Vibe Atlas grid unexpectedly resolved to Gandalf and is preserved here as a Legendary Misprint; same-universe anomalies, such as a Dylan Wangtermelon event, can be preserved the same way.
              </p>

              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-[#f4f0e8]/48">
                <span>9 source results · vibe-atlas-v1</span>
                <span className="inline-flex items-center gap-1 text-[#e3c77f]"><Icon kind="badge" className="text-[13px]" /> Legendary · Misprint</span>
              </div>

              <aside className="mt-5 flex gap-2 rounded-lg border border-white/10 bg-white/[.035] p-3 text-xs leading-5 text-[#f4f0e8]/65">
                <Icon kind="lock" className="mt-0.5 shrink-0 text-[15px] text-[#d8bd83]" />
                <p><strong className="font-semibold text-[#f4f0e8]/85">Preservation boundary.</strong> This saved artifact lives only in this member’s Collection and the dedicated Legendary Misprints view. It never changes the regular Dylan Wang Star of the Day grid or ordinary Builder proposals; MemeForge remains a separate universe.</p>
              </aside>

              <div className="mt-5 flex flex-wrap gap-2">
                <button className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#d8bd83] px-4 text-xs font-bold text-[#17130d] transition hover:bg-[#e7cf98]">
                  <Icon kind="download" className="text-[15px]" /> Export grid
                </button>
                <button className="min-h-10 rounded-md border border-white/20 px-4 text-xs font-semibold text-[#f4f0e8]/82 transition hover:border-[#d8bd83] hover:text-[#d8bd83]">
                  Archive details
                </button>
              </div>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}