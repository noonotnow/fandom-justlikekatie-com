export const MEME_FLAVORS = [
  {
    name: "One Does Not Simply",
    coreEmotion: "solemn overwhelm",
    socialSituation: "an apparently small task reveals impossible levels of lore, bureaucracy, or effort",
    visualCues: "grave expression, council-room weight, epic lighting",
    creativeBrief: "Use epic stakes for a mundane hard task. Do not recreate the original meme template or quote it verbatim.",
  },
  {
    name: "You Shall Not Pass",
    coreEmotion: "firm refusal",
    socialSituation: "a distraction, bad habit, or unreasonable request reaches a hard boundary",
    visualCues: "decisive silhouette, high contrast, clear threshold",
    creativeBrief: "Frame a clear boundary as an original moment of resolve. Do not recreate the original movie still or quote.",
  },
  {
    name: "Taking the Hobbits to Isengard",
    coreEmotion: "chaotic momentum",
    socialSituation: "errands, tabs, reminders, or hyperfocus turn into an escalating loop",
    visualCues: "movement, repetition, mounting energy",
    creativeBrief: "Build rhythmic, escalating momentum without reproducing the source song, video, or template.",
  },
  {
    name: "Second Breakfast",
    coreEmotion: "cozy indulgence",
    socialSituation: "a small treat, pause, or reward is entirely justified",
    visualCues: "warm light, food, soft comfort",
    creativeBrief: "Make the indulgence feel warm, playful, and earned.",
  },
  {
    name: "Precious / My Precious",
    coreEmotion: "delightful obsession",
    socialSituation: "a favorite object, ritual, fandom detail, or special interest becomes all-consuming",
    visualCues: "close focus, secret treasure, magnetic attention",
    creativeBrief: "Express affectionate obsession without imitating a character voice or direct quotation.",
  },
  {
    name: "Council of Elrond",
    coreEmotion: "collective overthinking",
    socialSituation: "a group chat, meeting, or decision has far too many opinions",
    visualCues: "circle of deliberation, notes, competing gestures",
    creativeBrief: "Turn many competing opinions into a gently epic original scenario.",
  },
  {
    name: "Samwise Loyalty",
    coreEmotion: "steady devotion",
    socialSituation: "someone quietly shows up, encourages a friend, or carries more than their share",
    visualCues: "road companionship, warm resolve, quiet support",
    creativeBrief: "Center quiet support, emotional steadiness, and grounded warmth.",
  },
  {
    name: "Gollum’s Debate",
    coreEmotion: "internal conflict",
    socialSituation: "two impulses negotiate over discipline, cravings, procrastination, or a bad idea",
    visualCues: "split focus, competing shadows, comic tension",
    creativeBrief: "Write an original internal debate without imitating dialogue from the films or books.",
  },
  {
    name: "Unexpected Journey",
    coreEmotion: "reluctant adventure",
    socialSituation: "an errand, trip, or new project unexpectedly becomes a side quest",
    visualCues: "road ahead, packed bag, surprised momentum",
    creativeBrief: "Make ordinary escalation feel adventurous, surprising, and original.",
  },
  {
    name: "Mordor Commute",
    coreEmotion: "epic daily dread",
    socialSituation: "work, school, traffic, or Monday feels like an unnecessary expedition",
    visualCues: "long road, dark horizon, stubborn forward motion",
    creativeBrief: "Treat routine difficulty with heightened stakes and dry resilience.",
  },
  {
    name: "The Beacons Are Lit",
    coreEmotion: "urgent rallying",
    socialSituation: "a group needs backup, the situation escalated, or help is required now",
    visualCues: "signals, firelight, distant response",
    creativeBrief: "Create a compact, original call-for-help energy without reproducing scene dialogue.",
  },
  {
    name: "Fly, You Fools",
    coreEmotion: "immediate escape",
    socialSituation: "it is time to leave a bad decision, toxic thread, or doomed situation",
    visualCues: "rapid exit, threshold, motion away",
    creativeBrief: "Use a decisive escape impulse without quoting or recreating the original scene.",
  },
  {
    name: "I Am No Man",
    coreEmotion: "underdog triumph",
    socialSituation: "someone underestimated reveals competence, confidence, or a decisive win",
    visualCues: "reveal, reversal, triumphant light",
    creativeBrief: "Celebrate an original reversal or victory without using the source line as on-card copy.",
  },
];

export const MEME_FLAVOR_NAMES = new Set(MEME_FLAVORS.map(flavor => flavor.name));

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

export function memeFlavorPromptDetails(name) {
  const flavor = MEME_FLAVORS.find(candidate => candidate.name === name);
  if (!flavor) return null;
  return [
    `Meme Flavor: ${flavor.name}`,
    `Core emotion: ${flavor.coreEmotion}`,
    `Social situation: ${flavor.socialSituation}`,
    `Visual cues: ${flavor.visualCues}`,
    `Creative guardrail: ${flavor.creativeBrief}`,
    "This is an original creative archetype, not permission to reproduce a meme template, movie still, lyric, or quotation.",
  ].join("\n");
}