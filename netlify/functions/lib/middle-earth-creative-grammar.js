export const MEME_FLAVORS = [
  {
    name: "One Does Not Simply",
    coreEmotion: "solemn overwhelm",
    socialSituation: "an apparently small task reveals impossible levels of lore, bureaucracy, or effort",
    visualCues: "grave expression, council-room weight, epic lighting",
    creativeBrief: "Treat a tiny task like an administrative saga. Keep the joke original; never reproduce a template or quotation.",
    prototype: {
      corePattern: "A mundane task is announced with wildly disproportionate gravity.",
      defaultStillFamily: "boromir-council",
      exemplar: { line1: "ONE EMAIL ON A FRIDAY", line2: "AN ENTIRE QUEST." },
      comedicMechanism: "Solemn overstatement: the scale of the reaction is the punchline.",
      avoid: ["generic hardship", "earnest perseverance", "a literal source quotation"],
      mutationRules: ["Name the specific small task from the moment.", "Escalate its importance absurdly.", "Land on the mismatch, not advice."],
    },
  },
  {
    name: "You Shall Not Pass",
    coreEmotion: "firm refusal",
    socialSituation: "a distraction, bad habit, or unreasonable request reaches a hard boundary",
    visualCues: "decisive silhouette, high contrast, clear threshold",
    creativeBrief: "Frame a clear boundary as an original moment of resolve. Do not quote or recreate the original scene.",
    prototype: {
      corePattern: "An ordinary intrusion meets a comically final boundary.",
      defaultStillFamily: "gandalf-bridge",
      exemplar: { line1: "MY WEEKEND: CLOSED.", line2: "THE EMAIL: STILL TRYING." },
      comedicMechanism: "A tiny nuisance is treated as an invader at the gate.",
      avoid: ["motivational resolve", "generic self-care", "the source catchphrase"],
      mutationRules: ["Make the intruder concrete.", "Use a crisp refusal or consequence.", "Keep the dramatic scale aimed at something mundane."],
    },
  },
  {
    name: "Taking the Hobbits to Isengard",
    coreEmotion: "chaotic momentum",
    socialSituation: "errands, tabs, reminders, or hyperfocus turn into an escalating loop",
    visualCues: "movement, repetition, mounting energy",
    creativeBrief: "Build rhythmic, escalating momentum without reproducing the source song, video, or template.",
    prototype: {
      corePattern: "A harmless first step becomes an uncontrollable loop.",
      defaultStillFamily: "gollum-smeagol-debate",
      exemplar: { line1: "ME: ONE QUICK TAB.", line2: "MY BRAIN: SIDE QUESTS." },
      comedicMechanism: "Immediate escalation and repetition-adjacent loss of control.",
      avoid: ["a calm productivity tip", "explaining the spiral", "lyrics or repeated source phrases"],
      mutationRules: ["Start with the user's supposedly small action.", "Make the second line speed up or multiply it.", "End before explanation."],
    },
  },
  {
    name: "Second Breakfast",
    coreEmotion: "cozy indulgence",
    socialSituation: "a small treat, pause, or reward is entirely justified",
    visualCues: "warm light, food, soft comfort",
    creativeBrief: "Make the indulgence playful and earned, never moralizing or sentimental.",
    prototype: {
      corePattern: "A reasonable little reward instantly argues for another.",
      defaultStillFamily: "hobbits-eating",
      exemplar: { line1: "ME: ONE LITTLE TREAT.", line2: "ALSO ME: MAKE IT TWO." },
      comedicMechanism: "Cozy self-justification that escalates before anyone can object.",
      avoid: ["wellness affirmation", "food guilt", "a long comfort speech"],
      mutationRules: ["Use the specific treat or pause in the moment.", "Make the escalation immediate.", "Keep the speaker gently unreasonable."],
    },
  },
  {
    name: "Precious / My Precious",
    coreEmotion: "delightful obsession",
    socialSituation: "a favorite object, ritual, fandom detail, or special interest becomes all-consuming",
    visualCues: "close focus, secret treasure, magnetic attention",
    creativeBrief: "Express affectionate obsession without character imitation or direct quotation.",
    prototype: {
      corePattern: "A person denies wanting a thing while obviously already committed.",
      defaultStillFamily: "gollum-smeagol-debate",
      exemplar: { line1: "ME: I DO NOT NEED IT.", line2: "ALSO ME: IT'S ON SALE." },
      comedicMechanism: "The denial and the evidence contradict each other instantly.",
      avoid: ["sincere product praise", "generic retail copy", "character-voice imitation"],
      mutationRules: ["Name the object, ritual, or niche fixation.", "Pair denial with incriminating evidence.", "Let the contradiction be the joke."],
    },
  },
  {
    name: "Council of Elrond",
    coreEmotion: "collective overthinking",
    socialSituation: "a group chat, meeting, or decision has far too many opinions",
    visualCues: "circle of deliberation, notes, competing gestures",
    creativeBrief: "Turn many competing opinions into a compact original scenario.",
    prototype: {
      corePattern: "One small question causes an unnecessarily formal group deliberation.",
      defaultStillFamily: "council-wide-shot",
      exemplar: { line1: "ME: QUICK QUESTION.", line2: "THE GROUP CHAT: A COUNCIL." },
      comedicMechanism: "A tiny decision inflates into committee theatre.",
      avoid: ["teamwork praise", "a meeting summary", "generic leadership advice"],
      mutationRules: ["Start with the smallest possible decision.", "Show the group escalating it.", "Favor social specificity over lore explanation."],
    },
  },
  {
    name: "Samwise Loyalty",
    coreEmotion: "gentle enforcement",
    socialSituation: "a supportive friend refuses to let someone self-isolate, quit, or suffer quietly",
    visualCues: "road companionship, exasperated support, practical resolve",
    creativeBrief: "Make support funny through a practical refusal or contradiction, never an encouragement poster.",
    prototype: {
      corePattern: "One friend tries to suffer alone; the loyal friend refuses the premise.",
      defaultStillFamily: "sam-carrying-frodo",
      exemplar: { line1: "ME: I'LL SUFFER QUIETLY.", line2: "MY SAMWISE FRIEND: INCORRECT." },
      comedicMechanism: "Supportive contradiction: the friend agrees it is bad, then joins or intervenes anyway.",
      avoid: ["carries the load", "generic encouragement", "inspirational quote language", "a tender summary"],
      mutationRules: ["Map the moment to someone trying to quit, deny, or suffer alone.", "Make the friend practical, loyal, and slightly deadpan.", "Include a refusal, twist, or social contradiction."],
    },
  },
  {
    name: "Gollum’s Debate",
    coreEmotion: "internal conflict",
    socialSituation: "two impulses negotiate over discipline, cravings, procrastination, or a bad idea",
    visualCues: "split focus, competing shadows, comic tension",
    creativeBrief: "Write an original internal debate without imitating dialogue from the films or books.",
    prototype: {
      corePattern: "The responsible self makes a case; the gremlin self wins with one inconvenient fact.",
      defaultStillFamily: "gollum-smeagol-debate",
      exemplar: { line1: "ME: BE RESPONSIBLE.", line2: "ALSO ME: BUT IT'S ON SALE." },
      comedicMechanism: "The second voice instantly derails the first with a selfish exception.",
      avoid: ["earnest self-improvement", "a balanced pros-and-cons list", "character imitation"],
      mutationRules: ["Let both lines use modern internal voices.", "Make the second line undermine the first.", "Use the moment's exact temptation when possible."],
    },
  },
  {
    name: "Unexpected Journey",
    coreEmotion: "reluctant adventure",
    socialSituation: "an errand, trip, or new project unexpectedly becomes a side quest",
    visualCues: "road ahead, packed bag, surprised momentum",
    creativeBrief: "Make ordinary escalation feel surprising and original, not earnestly adventurous.",
    prototype: {
      corePattern: "A simple plan grows into a needless multi-stage mission.",
      defaultStillFamily: "frodo-quest-burden",
      exemplar: { line1: "ME: QUICK ERRAND.", line2: "THREE HOURS: SIDE QUEST." },
      comedicMechanism: "The gap between the plan and the outcome is absurdly large.",
      avoid: ["travel inspiration", "heroic self-discovery", "a scenic summary"],
      mutationRules: ["Name the first small plan.", "Reveal the unexpected detour.", "Keep the speaker baffled, not enlightened."],
    },
  },
  {
    name: "Mordor Commute",
    coreEmotion: "epic daily dread",
    socialSituation: "work, school, traffic, or Monday feels like an unnecessary expedition",
    visualCues: "long road, dark horizon, stubborn forward motion",
    creativeBrief: "Use heightened stakes and dry resilience, never motivational endurance language.",
    prototype: {
      corePattern: "A routine obligation arrives as if it were an avoidable disaster.",
      defaultStillFamily: "frodo-quest-burden",
      exemplar: { line1: "THE FRIDAY SHIFT APPEARED.", line2: "MY SOUL LEFT THE FELLOWSHIP." },
      comedicMechanism: "Epic dread applied to a mundane calendar event.",
      avoid: ["workplace encouragement", "grit rhetoric", "a literal journey description"],
      mutationRules: ["Use the user's specific obligation.", "Make the reaction disproportionate and dry.", "Let exhaustion be funny, not noble."],
    },
  },
  {
    name: "The Beacons Are Lit",
    coreEmotion: "urgent rallying",
    socialSituation: "a group needs backup, the situation escalated, or help is required now",
    visualCues: "signals, firelight, distant response",
    creativeBrief: "Create a compact original escalation, not a heroic call to action.",
    prototype: {
      corePattern: "A small problem is announced like it requires immediate reinforcements.",
      defaultStillFamily: "council-wide-shot",
      exemplar: { line1: "ME: SMALL PROBLEM.", line2: "GROUP CHAT: SEND BACKUP." },
      comedicMechanism: "A minor issue triggers an absurdly official emergency response.",
      avoid: ["inspirational rallying", "actual emergency instructions", "a long battle speech"],
      mutationRules: ["Start with the user's modest problem.", "Escalate to collective backup.", "Keep the urgency socially exaggerated."],
    },
  },
  {
    name: "Fly, You Fools",
    coreEmotion: "immediate escape",
    socialSituation: "it is time to leave a bad decision, toxic thread, or doomed situation",
    visualCues: "rapid exit, threshold, motion away",
    creativeBrief: "Use a decisive exit impulse without quoting or recreating the original scene.",
    prototype: {
      corePattern: "One more tiny engagement is clearly the wrong choice; common sense calls for escape.",
      defaultStillFamily: "gandalf-bridge",
      exemplar: { line1: "ME: ONE MORE REPLY.", line2: "MY COMMON SENSE: LOG OFF." },
      comedicMechanism: "The urge to keep going meets an immediate, blunt evacuation order.",
      avoid: ["a self-help boundary", "a literal source quote", "a long warning"],
      mutationRules: ["Name the temptation to stay.", "Make the exit command short and final.", "Use urgency as the punchline."],
    },
  },
  {
    name: "I Am No Man",
    coreEmotion: "underdog reversal",
    socialSituation: "someone underestimated reveals competence, confidence, or a decisive win",
    visualCues: "reveal, reversal, triumphant light",
    creativeBrief: "Celebrate an original reversal without using the source line as on-card copy.",
    prototype: {
      corePattern: "A task asks who can do it; the underestimated person realizes it is, unfortunately, them.",
      defaultStillFamily: "eowyn-triumph",
      exemplar: { line1: "THE TASK: WHO CAN DO THIS?", line2: "ME, UNFORTUNATELY: ME." },
      comedicMechanism: "The triumph is undercut by reluctant self-recognition.",
      avoid: ["generic empowerment", "victory-poster language", "the source catchphrase"],
      mutationRules: ["Name the underestimated task or person.", "Reveal competence with a weary twist.", "Keep the win slightly inconvenient."],
    },
  },
];

export const MEME_FLAVOR_NAMES = new Set(MEME_FLAVORS.map(flavor => flavor.name));

// Flavor supplies the Middle-earth world; a Comic Mechanism supplies the
// reusable setup-to-punchline turn. These are original comedy patterns, not
// copied captions or source-meme templates.
export const COMIC_MECHANISMS = [
  {
    name: "Severity inversion",
    description: "Treat a small modern inconvenience with wildly disproportionate Middle-earth gravity.",
    selectionCues: ["mundane dread", "Friday work", "minor task", "commute"],
    avoid: ["generic hardship", "earnest endurance", "motivational suffering"],
    exemplarShape: "A tiny obligation appears / the reaction declares an impossible quest.",
  },
  {
    name: "Intent reversal",
    description: "The speaker's stated plan is immediately undone by what they actually want or do.",
    selectionCues: ["bad plan", "temptation", "willpower", "one more thing"],
    avoid: ["a balanced pros-and-cons list", "self-improvement advice"],
    exemplarShape: "ME: sensible intention / ALSO ME: the immediate exception.",
  },
  {
    name: "Escalating repetition",
    description: "One harmless step multiplies into a faster, more ridiculous loop.",
    selectionCues: ["tabs", "errands", "spiral", "again", "too many"],
    avoid: ["a productivity tip", "explaining every step of the spiral"],
    exemplarShape: "One quick action / suddenly, a multiplying side quest.",
  },
  {
    name: "Ceremonial setup / petty punchline",
    description: "A grand formal declaration lands on a tiny, specific modern problem.",
    selectionCues: ["meeting", "group chat", "announcement", "small decision"],
    avoid: ["heroic rallying", "actual emergency language"],
    exemplarShape: "A solemn proclamation / a petty practical consequence.",
  },
  {
    name: "Literal misread / wordplay",
    description: "A phrase or rule is taken too literally, revealing an inconveniently silly meaning.",
    selectionCues: ["ambiguous wording", "instructions", "signs", "rules"],
    avoid: ["forced puns", "explaining the wordplay"],
    exemplarShape: "A literal reading / the absurd real-world implication.",
  },
  {
    name: "Relationship-specific contradiction",
    description: "A familiar relationship makes one person's stated plan impossible or immediately challenged.",
    selectionCues: ["friends", "Sam and Frodo", "group dynamic", "support"],
    avoid: ["tender tribute", "generic friendship praise", "inspirational support"],
    exemplarShape: "One friend insists on a doomed plan / the other calmly refuses the premise.",
  },
  {
    name: "Delighted fandom-lawyer correction",
    description: "A lore-minded voice eagerly corrects the premise, then makes the correction funnier than the question.",
    selectionCues: ["Why did they not take the Eagles?", "lore question", "canon detail"],
    avoid: ["a lecture", "gatekeeping", "long factual explanation"],
    exemplarShape: "A confident fandom question / an overprepared correction with a petty payoff.",
  },
];

export const COMIC_MECHANISM_NAMES = new Set(COMIC_MECHANISMS.map(mechanism => mechanism.name));

// A small bank of concrete, hand-curated Middle-earth joke pairs per Comic
// Mechanism. `exemplarShape` above is an abstract pattern; these are actual
// worked jokes that teach what "the laugh landing" sounds like for this
// mechanism. They are calibration only — a request samples a rotating
// subset so the model never converges on the same handful of jokes, and it
// is explicitly told never to reuse them verbatim.
export const COMIC_MECHANISM_EXAMPLE_BANK = {
  "Severity inversion": [
    { line1: "REPLYING TO ONE TEXT", line2: "BECAME A FULL EXPEDITION." },
    { line1: "PICKING A DINNER SPOT", line2: "TOOK THE EFFORT OF A SIEGE." },
    { line1: "THE PRINTER NEEDS PAPER", line2: "THIS IS NOW MOUNT DOOM." },
  ],
  "Intent reversal": [
    { line1: "ME: NO MORE SNACKS.", line2: "ALSO ME: JUST ONE MORE." },
    { line1: "ME: EARLY BEDTIME TONIGHT.", line2: "ALSO ME: ONE MORE EPISODE." },
    { line1: "ME: STICKING TO THE LIST.", line2: "ALSO ME: THIS WASN'T ON IT." },
  ],
  "Escalating repetition": [
    { line1: "OPENED ONE BROWSER TAB.", line2: "NOW THERE ARE THIRTY-SEVEN." },
    { line1: "CHECKED ONE NOTIFICATION.", line2: "SUDDENLY, THE WHOLE FEED." },
    { line1: "STARTED ONE SMALL PROJECT.", line2: "NOW THE WHOLE HOUSE IS INVOLVED." },
  ],
  "Ceremonial setup / petty punchline": [
    { line1: "LET IT BE KNOWN:", line2: "THE MEETING RAN LONG. AGAIN." },
    { line1: "BY ORDER OF THE COUNCIL:", line2: "WE ARE OUT OF COFFEE." },
    { line1: "A GRAVE ANNOUNCEMENT:", line2: "THE WIFI IS DOWN AGAIN." },
  ],
  "Literal misread / wordplay": [
    { line1: "THE SIGN SAID WET FLOOR.", line2: "SO I THANKED IT." },
    { line1: "IT SAID ONE SIZE FITS ALL.", line2: "IT DID NOT." },
    { line1: "THE RECIPE SAID A PINCH.", line2: "I ADDED A FISTFUL." },
  ],
  "Relationship-specific contradiction": [
    { line1: "ME: I'LL HANDLE IT ALONE.", line2: "MY FRIEND: ABSOLUTELY NOT." },
    { line1: "ME: I'M FINE, REALLY.", line2: "MY FRIEND: GRABBING MY COAT." },
    { line1: "ME: DON'T MAKE A FUSS.", line2: "MY FRIEND: TOO LATE. I CALLED THEM." },
  ],
  "Delighted fandom-lawyer correction": [
    { line1: "WHY NOT USE THE EAGLES?", line2: "OH, LET ME EXPLAIN. HAPPILY." },
    { line1: "ISN'T THAT JUST A WIZARD?", line2: "SIT DOWN. THIS TAKES A WHILE." },
    { line1: "COULDN'T THEY WALK FASTER?", line2: "I HAVE A CHART. SEVERAL CHARTS." },
  ],
};

function sampleWithoutReplacement(list, count, random = Math.random) {
  const pool = [...list];
  const picked = [];
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

export function comicMechanismExampleBank(name) {
  return COMIC_MECHANISM_EXAMPLE_BANK[name] ?? [];
}

export function sampledComicMechanismExamples(name, count = 2, random) {
  const bank = comicMechanismExampleBank(name);
  return sampleWithoutReplacement(bank, Math.min(count, bank.length), random);
}

export const DEFAULT_COMIC_MECHANISMS_BY_FLAVOR = {
  "One Does Not Simply": ["Severity inversion", "Ceremonial setup / petty punchline"],
  "You Shall Not Pass": ["Ceremonial setup / petty punchline", "Severity inversion"],
  "Taking the Hobbits to Isengard": ["Escalating repetition"],
  "Second Breakfast": ["Intent reversal", "Escalating repetition"],
  "Precious / My Precious": ["Intent reversal", "Relationship-specific contradiction"],
  "Council of Elrond": ["Ceremonial setup / petty punchline", "Escalating repetition"],
  "Samwise Loyalty": ["Relationship-specific contradiction", "Severity inversion"],
  "Gollum’s Debate": ["Intent reversal", "Relationship-specific contradiction"],
  "Unexpected Journey": ["Severity inversion", "Escalating repetition"],
  "Mordor Commute": ["Severity inversion", "Ceremonial setup / petty punchline"],
  "The Beacons Are Lit": ["Ceremonial setup / petty punchline", "Escalating repetition"],
  "Fly, You Fools": ["Intent reversal", "Ceremonial setup / petty punchline"],
  "I Am No Man": ["Intent reversal", "Severity inversion"],
};

export const FORBIDDEN_SOURCE_TEMPLATES_BY_FLAVOR = {
  "One Does Not Simply": ["one does not simply"],
  "You Shall Not Pass": ["you shall not pass"],
  "Taking the Hobbits to Isengard": ["taking the hobbits to isengard"],
  "Second Breakfast": ["what about second breakfast"],
  "Precious / My Precious": ["my precious"],
  "Council of Elrond": ["you have my sword"],
  "Samwise Loyalty": ["i can't carry it for you, but i can carry you"],
  "Gollum’s Debate": ["we wants it"],
  "Unexpected Journey": ["i'm going on an adventure"],
  "Mordor Commute": ["one does not simply walk into mordor"],
  "The Beacons Are Lit": ["the beacons are lit"],
  "Fly, You Fools": ["fly, you fools"],
  "I Am No Man": ["i am no man"],
};

export const AESTHETIC_NAMES = new Set([
  "Epic parchment",
  "Medieval marginalia",
  "VHS fantasy still",
  "Cozy Hobbiton",
  "Dark Mordor productivity",
  "Illuminated manuscript",
  "Chaotic group chat",
  "Study-card mode",
]);

export const ARTIFACT_TYPE_NAMES = new Set([
  "Meme card",
  "Vocabulary card",
  "Hero card",
  "Shareable one-pager",
  "Carousel slide",
  "Reaction image",
]);

function prototypePromptDetails(flavor) {
  return [
    `Prototype social pattern: ${flavor.prototype.corePattern}`,
    `Default reaction-still family: ${flavor.prototype.defaultStillFamily}`,
    `Gold-standard example shape (do not copy its wording): ${flavor.prototype.exemplar.line1} / ${flavor.prototype.exemplar.line2}`,
    `Comedy mechanism: ${flavor.prototype.comedicMechanism}`,
    `Avoid: ${flavor.prototype.avoid.join("; ")}.`,
    `Mutation rules: ${flavor.prototype.mutationRules.join(" ")}`,
  ];
}

export function memeFlavorPromptDetails(name) {
  const flavor = MEME_FLAVORS.find(candidate => candidate.name === name);
  if (!flavor) return null;
  return [
    `Meme Flavor: ${flavor.name}`,
    `Core emotion: ${flavor.coreEmotion}`,
    `Social situation: ${flavor.socialSituation}`,
    `Visual cues: ${flavor.visualCues}`,
    `Creative guardrail: ${flavor.creativeBrief}`,
    `Default comic mechanisms: ${(DEFAULT_COMIC_MECHANISMS_BY_FLAVOR[flavor.name] ?? []).join(" | ")}.`,
    ...prototypePromptDetails(flavor),
    "Use the prototype as the comedy spine, then write a fresh mutant for this user's moment. This is an original creative archetype, not permission to reproduce a meme template, movie still, lyric, or quotation.",
  ].join("\n");
}

export function memeFlavorCatalogPromptDetails() {
  return MEME_FLAVORS.map((flavor) => [
    `Family: ${flavor.name}`,
     `Default comic mechanisms: ${(DEFAULT_COMIC_MECHANISMS_BY_FLAVOR[flavor.name] ?? []).join(" | ")}.`,
    ...prototypePromptDetails(flavor),
  ].join("\n")).join("\n\n");
}

function comicMechanismPromptDetails(mechanism, options = {}) {
  const examples = sampledComicMechanismExamples(mechanism.name, 2, options.random);
  return [
    `Comic Mechanism: ${mechanism.name}`,
    `How the laugh works: ${mechanism.description}`,
    `Selection cues: ${mechanism.selectionCues.join("; ")}.`,
    `Original exemplar shape (do not copy wording): ${mechanism.exemplarShape}`,
    ...(examples.length
      ? [`Concrete calibration jokes for craft only — study the turn, then invent a fresh original mutant; never reuse these lines verbatim: ${examples.map(e => `${e.line1} / ${e.line2}`).join(" || ")}`]
      : []),
    `Avoid: ${mechanism.avoid.join("; ")}.`,
  ].join("\n");
}

export function resolvedComicMechanismPromptDetails(name, options) {
  const mechanism = COMIC_MECHANISMS.find(candidate => candidate.name === name);
  return mechanism ? comicMechanismPromptDetails(mechanism, options) : null;
}

export function comicMechanismCatalogPromptDetails(options) {
  return COMIC_MECHANISMS.map((mechanism) => comicMechanismPromptDetails(mechanism, options)).join("\n\n");
}

export function defaultComicMechanismsForFlavor(name) {
  return DEFAULT_COMIC_MECHANISMS_BY_FLAVOR[name] ?? [];
}

export function memeFlavorAvoidPatterns(name) {
  return MEME_FLAVORS.find(candidate => candidate.name === name)?.prototype.avoid ?? [];
}