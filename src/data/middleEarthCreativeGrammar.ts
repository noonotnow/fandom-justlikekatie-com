export const memeFlavors = [
  {
    name: 'One Does Not Simply',
    coreEmotion: 'Solemn overwhelm',
    socialSituation: 'An apparently small task reveals impossible levels of lore, bureaucracy, or effort.',
    description: 'Impossible-task energy, delivered with grave sincerity.',
    creativeBrief: 'Use epic stakes for a mundane hard task. Do not recreate the original meme template or quote it verbatim.',
  },
  {
    name: 'You Shall Not Pass',
    coreEmotion: 'Firm refusal',
    socialSituation: 'A distraction, bad habit, or unreasonable request reaches a hard boundary.',
    description: 'A dramatic hard stop for distractions and bad ideas.',
    creativeBrief: 'Frame a clear boundary as an original moment of resolve. Do not recreate the original movie still or quote.',
  },
  {
    name: 'Taking the Hobbits to Isengard',
    coreEmotion: 'Chaotic momentum',
    socialSituation: 'Errands, tabs, reminders, or hyperfocus turn into an escalating loop.',
    description: 'Frantic repetition for spirals, errands, and too many tabs.',
    creativeBrief: 'Build rhythmic, escalating momentum without reproducing the source song, video, or template.',
  },
  {
    name: 'Second Breakfast',
    coreEmotion: 'Cozy indulgence',
    socialSituation: 'A small treat, pause, or reward is entirely justified.',
    description: 'Warm little-treat logic for snacks, rest, and tiny joys.',
    creativeBrief: 'Make the indulgence feel warm, playful, and earned.',
  },
  {
    name: 'Precious / My Precious',
    coreEmotion: 'Delightful obsession',
    socialSituation: 'A favorite object, ritual, fandom detail, or special interest becomes all-consuming.',
    description: 'Niche fixation and lovingly unreasonable attachment.',
    creativeBrief: 'Express affectionate obsession without imitating a character voice or direct quotation.',
  },
  {
    name: 'Council of Elrond',
    coreEmotion: 'Collective overthinking',
    socialSituation: 'A group chat, meeting, or decision has far too many opinions.',
    description: 'Committee energy for group chats and decision paralysis.',
    creativeBrief: 'Turn many competing opinions into a gently epic original scenario.',
  },
  {
    name: 'Samwise Loyalty',
    coreEmotion: 'Steady devotion',
    socialSituation: 'Someone quietly shows up, encourages a friend, or carries more than their share.',
    description: 'Earnest support for friendship, encouragement, and study buddies.',
    creativeBrief: 'Center quiet support, emotional steadiness, and grounded warmth.',
  },
  {
    name: 'Gollum’s Debate',
    coreEmotion: 'Internal conflict',
    socialSituation: 'Two impulses negotiate over discipline, cravings, procrastination, or a bad idea.',
    description: 'Me-versus-me energy for self-negotiation and cravings.',
    creativeBrief: 'Write an original internal debate without imitating dialogue from the films or books.',
  },
  {
    name: 'Unexpected Journey',
    coreEmotion: 'Reluctant adventure',
    socialSituation: 'An errand, trip, or new project unexpectedly becomes a side quest.',
    description: 'How-did-I-get-here energy for travel and accidental side quests.',
    creativeBrief: 'Make ordinary escalation feel adventurous, surprising, and original.',
  },
  {
    name: 'Mordor Commute',
    coreEmotion: 'Epic daily dread',
    socialSituation: 'Work, school, traffic, or Monday feels like an unnecessary expedition.',
    description: 'Daily dread reframed as an epic quest.',
    creativeBrief: 'Treat routine difficulty with heightened stakes and dry resilience.',
  },
  {
    name: 'The Beacons Are Lit',
    coreEmotion: 'Urgent rallying',
    socialSituation: 'A group needs backup, the situation escalated, or help is required now.',
    description: 'A rally-the-group alert for urgent tasks and group chats.',
    creativeBrief: 'Create a compact, original call-for-help energy without reproducing scene dialogue.',
  },
  {
    name: 'Fly, You Fools',
    coreEmotion: 'Immediate escape',
    socialSituation: 'It is time to leave a bad decision, toxic thread, or doomed situation.',
    description: 'Log-off-now urgency for bad decisions and escape plans.',
    creativeBrief: 'Use a decisive escape impulse without quoting or recreating the original scene.',
  },
  {
    name: 'I Am No Man',
    coreEmotion: 'Underdog triumph',
    socialSituation: 'Someone underestimated reveals competence, confidence, or a decisive win.',
    description: 'Reveal-and-reversal energy for confidence and underdog wins.',
    creativeBrief: 'Celebrate an original reversal or victory without using the source line as on-card copy.',
  },
] as const;

export type MemeFlavorName = (typeof memeFlavors)[number]['name'];

export const aesthetics = [
  { name: 'Epic parchment', description: 'Weathered, cinematic, and quest-ready.' },
  { name: 'Medieval marginalia', description: 'Bookish notes, tiny details, illuminated edges.' },
  { name: 'VHS fantasy still', description: 'Soft grain, nostalgic drama, late-night lore.' },
  { name: 'Cozy Hobbiton', description: 'Warm lamplight, food, rest, and gentle humor.' },
  { name: 'Dark Mordor productivity', description: 'High contrast, deadlines, and heroic endurance.' },
  { name: 'Illuminated manuscript', description: 'Decorative, ceremonial, and richly composed.' },
  { name: 'Chaotic group chat', description: 'Fast, messy, socially overcommitted energy.' },
  { name: 'Study-card mode', description: 'Clear, clever, useful, and easy to save.' },
] as const;

export type AestheticName = (typeof aesthetics)[number]['name'];

export const artifactTypes = [
  'Meme card',
  'Vocabulary card',
  'Hero card',
  'Shareable one-pager',
  'Carousel slide',
  'Reaction image',
] as const;

export type ArtifactType = (typeof artifactTypes)[number];