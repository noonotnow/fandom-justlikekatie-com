// Private operational metadata. Do not add this to ACTOR_PACKS or public APIs.
// These are search-disambiguation heuristics, not identity verification.
export const IDENTITY_PROFILE_VERSION = 2;
export const AESTHETIC_CLUSTER_VERSION = 6;
export const VIBE_PROMISE_CONTRACT_VERSION = 7;

const LIU_YUNING_CLUSTERS = [
  {
    id: "li-shiliu-masked-moonlight",
    work: "书卷一梦",
    character: "离十六",
    aliases: ["Li Shiliu", "Li Shiliu", "蒙面", "面具"],
    mood: ["mysterious", "watchful", "moonlit"],
    palette: ["black", "ink", "silver", "cool blue"],
    wardrobeAnchors: ["mask", "hat", "black costume", "night costume"],
    propAnchors: ["mask", "hat"],
    settingAnchors: ["roof", "moonlight", "night", "屋顶", "月光"],
    antiAnchors: ["modern event", "bts", "production equipment", "fire truck"],
    vibeCompatibility: { "月光兼职氛围农夫": "strong_anchor" },
  },
];

const LIU_XUEYI_CLUSTERS = [
  {
    id: "yuan-zhong-pale-ceremonial",
    work: "念无双",
    character: "源仲",
    aliases: ["Yuan Zhong", "pale ceremonial immortal"],
    look: [
      "pale-robed celestial", "long clean silhouette", "sculptural collar",
      "celestial styling", "historical styling",
    ],
    emotionalStates: [
      "controlled", "aloof", "divine distance", "emotionally unavailable",
      "visual distance", "restraint", "stillness", "authority",
    ],
    mood: ["controlled", "aloof", "divine", "restrained", "severe gaze", "emotionally reserved"],
    palette: ["white", "silver", "gray", "pale blue", "ice blue", "cool neutral"],
    wardrobeAnchors: [
      "white robes", "pale robes", "silver detailing", "fur trim",
      "ice-blue robes", "long sleeves", "clean silhouette",
    ],
    propAnchors: ["crown", "hair ornament", "divine regalia"],
    settingAnchors: [
      "temple", "snow", "moonlight", "mist", "water", "stone", "greenery",
      "pale outdoor light", "cool muted environment", "ceremonial",
    ],
    sceneAnchors: ["celestial character study", "controlled close-up", "wide costume study"],
    antiAnchors: [
      "modern event", "bts", "production equipment", "red commander", "fire truck",
      "saturated red", "warm gold", "smiling", "playful", "generic dark costume",
      "collage", "poster", "text-heavy edit", "emotional collapse",
    ],
    vibeCompatibility: { "仙门冷玉": "strong_anchor" },
  },
  {
    id: "murong-jinghe-dark-commander",
    work: "春花焰",
    character: "慕容璟和",
    aliases: ["Murong Jinghe", "dark commander"],
    look: ["dark commander", "official styling", "institutional authority"],
    emotionalStates: ["calculating", "strategic control", "commanding", "political threat"],
    mood: ["severe", "dangerous", "calculating", "commanding"],
    palette: ["black", "deep green", "teal", "restrained gold", "deep burgundy"],
    wardrobeAnchors: ["commander robes", "official robes", "ornate collar", "ranked costume"],
    propAnchors: ["seal", "document", "fan", "sword"],
    settingAnchors: ["court", "palace", "official interior", "hearing", "throne", "朝堂", "宫廷"],
    sceneAnchors: ["political negotiation", "commanding another character", "institutional threat"],
    antiAnchors: ["pale ceremonial", "white immortal", "modern event", "bts", "fire truck"],
    vibeCompatibility: { "权臣压迫感": "strong_anchor", "仙门冷玉": "conflict" },
  },
  {
    id: "court-menace-political-authority",
    work: "cross-character political authority",
    character: "political authority",
    aliases: [
      "court menace", "institutional threat", "political threat",
      "official authority", "court authority", "jurisdiction",
    ],
    look: ["official styling", "ornate collar", "ranked costume", "strategic elegance"],
    emotionalStates: ["calculating", "assessing", "strategic control", "commanding", "political threat"],
    mood: ["controlled", "calculating", "commanding", "dangerous"],
    palette: ["deep green", "teal", "black", "restrained gold"],
    wardrobeAnchors: ["official robes", "princely robes", "ornate collar", "formal robes"],
    propAnchors: ["documents", "book", "seal", "fan", "throne"],
    settingAnchors: ["court", "palace", "official interior", "hearing", "throne", "朝堂", "宫廷"],
    sceneAnchors: ["political negotiation", "power exercised", "controlled proximity", "institutional consequence"],
    antiAnchors: ["modern imagery", "collage", "graphic treatment", "generic fantasy combat"],
    vibeCompatibility: { "权臣压迫感": "strong_anchor" },
  },
  {
    id: "shen-zaiye-political-strategist",
    work: "桃花映江山",
    character: "沈在野",
    aliases: ["Shen Zaiye", "political strategist", "court strategist"],
    look: ["ministerial elegance", "official styling", "ranked costume"],
    emotionalStates: ["calculating", "assessing", "strategic control", "commanding"],
    mood: ["controlled", "calculating", "watchful", "dangerous"],
    palette: ["deep green", "teal", "black", "restrained gold"],
    wardrobeAnchors: ["official robes", "ministerial robes", "ornate collar"],
    propAnchors: ["documents", "book", "seal", "fan", "weapon"],
    settingAnchors: ["court", "palace", "official interior", "朝堂", "宫廷"],
    relationshipAnchors: ["political intimidation", "another character under pressure"],
    sceneAnchors: ["political negotiation", "strategic command", "institutional consequence"],
    antiAnchors: ["modern imagery", "collage", "graphic treatment", "generic fantasy combat"],
    vibeCompatibility: { "权臣压迫感": "strong_anchor" },
  },
  {
    id: "murong-jinghe-romantic-ruin",
    work: "春花焰",
    character: "慕容璟和",
    aliases: ["Murong Jinghe", "Mei Lin", "眉林", "wedding carry"],
    look: ["wounded prince", "red and black commander"],
    emotionalStates: ["feral grief", "revenge curdled into grief", "romantic devastation"],
    mood: [
      "wounded", "bloodied", "injured", "tearful", "grief", "rage", "devastated",
      "受伤", "流血", "含泪", "悲痛", "崩溃", "哭戏",
    ],
    palette: ["red", "black", "deep burgundy", "blood red"],
    wardrobeAnchors: ["wedding robes", "torn robes", "dark commander robes"],
    propAnchors: ["blood", "wound", "carrying Mei Lin"],
    settingAnchors: ["wedding", "battle aftermath", "collapse", "kneeling"],
    relationshipAnchors: ["Mei Lin", "眉林", "carrying", "holding", "refusing to let go"],
    sceneAnchors: ["wedding carry", "wounded prince arc", "grief aftermath"],
    antiAnchors: ["neutral portrait", "clean costume", "unrelated character", "collage"],
    vibeCompatibility: { "破碎感美人": "strong_anchor" },
  },
  {
    id: "shen-zaiye-composure-breaking",
    work: "桃花映江山",
    character: "沈在野",
    aliases: ["Shen Zaiye", "Jiang Taohua", "姜桃花", "The Princess's Gambit"],
    look: ["dirty elegance", "political composure breaking"],
    emotionalStates: ["controlled heartbreak", "desperate protection", "romantic devastation"],
    mood: [
      "bloodied", "injured", "distressed", "exhausted", "crying", "desperate",
      "吐血", "狼狈", "受伤", "哭戏", "崩溃",
    ],
    palette: ["dark red", "black", "dust", "desaturated gold"],
    wardrobeAnchors: ["dirty robes", "torn robes", "disheveled hair"],
    propAnchors: ["blood", "wound", "carrying Jiang Taohua"],
    settingAnchors: ["battle aftermath", "collapse", "sacrifice"],
    relationshipAnchors: ["Jiang Taohua", "姜桃花", "protecting", "carrying"],
    sceneAnchors: ["political restraint breaking", "bloodied protection", "exhausted aftermath"],
    antiAnchors: ["immaculate court portrait", "neutral portrait", "unrelated character", "collage"],
    vibeCompatibility: { "破碎感美人": "strong_anchor" },
  },
  {
    id: "jinxiu-devastated-devotion",
    work: "落花时节又逢君",
    character: "锦绣",
    aliases: ["Jinxiu", "Hongning", "红凝", "Love Never Fails"],
    look: ["flower deity", "divine composure cracking"],
    emotionalStates: ["across-lifetimes devotion", "love as punishment", "romantic devastation"],
    mood: [
      "devastated", "grief", "desperate", "tearful", "sacrifice", "崩溃", "悲痛", "哭戏",
    ],
    palette: ["white", "pale gold", "cool gray", "desaturated blue"],
    wardrobeAnchors: ["pale robes", "flower deity robes", "disheveled divine robes"],
    propAnchors: ["carrying Hongning", "holding Hongning"],
    settingAnchors: ["underworld", "across realms", "rebirth", "aftermath"],
    relationshipAnchors: ["Hongning", "红凝", "carrying", "protecting", "following"],
    sceneAnchors: ["carrying her through every realm", "across-lifetimes devotion"],
    antiAnchors: ["aloof neutral portrait", "unrelated character", "collage"],
    vibeCompatibility: { "破碎感美人": "strong_anchor", "仙门冷玉": "supporting_anchor" },
  },
  {
    id: "jinxiu-aloof-flower-deity",
    work: "落花时节又逢君",
    character: "锦绣",
    aliases: ["Jinxiu", "flower deity", "Love Never Fails"],
    look: ["aloof flower deity", "celestial authority"],
    emotionalStates: ["controlled", "divine distance"],
    mood: ["aloof", "controlled", "restrained", "divine"],
    palette: ["white", "pale gold", "cool gray", "pale blue"],
    wardrobeAnchors: ["pale robes", "flower deity robes", "celestial robes"],
    propAnchors: ["crown", "hair ornament", "flower"],
    settingAnchors: ["celestial realm", "temple", "mist"],
    relationshipAnchors: [],
    sceneAnchors: ["aloof divine authority"],
    antiAnchors: ["bloodied", "collapsing", "modern event", "bts", "collage"],
    vibeCompatibility: { "仙门冷玉": "strong_anchor", "破碎感美人": "conflict" },
  },
  {
    id: "professionally-devastated-cross-character",
    work: "cross-character romantic devastation",
    character: "Professionally Devastated",
    aliases: ["Love ruined him beautifully", "Born to suffer beautifully"],
    look: ["visible romantic ruin"],
    emotionalStates: ["romantic devastation", "grief", "sacrifice", "desperate protection"],
    mood: [
      "wounded", "bloodied", "bleeding", "injured", "tearful", "exhausted",
      "disheveled", "grief", "rage", "devastated", "haunted",
      "伤", "血", "受伤", "流血", "含泪", "疲惫", "凌乱", "悲痛", "崩溃",
    ],
    palette: ["red", "black", "white", "desaturated blue", "bruised purple"],
    wardrobeAnchors: ["disheveled hair", "torn clothing", "disturbed robes", "messy robes"],
    propAnchors: ["blood", "wound", "carrying", "holding"],
    settingAnchors: ["rain", "snow", "night", "smoke", "collapse", "kneeling"],
    relationshipAnchors: ["romantic loss", "carrying", "protecting", "sacrifice"],
    sceneAnchors: ["wedding aftermath", "battle aftermath", "across lifetimes"],
    antiAnchors: [
      "modern business", "business suit", "businessman", "office", "corporate",
      "women-centered", "unrelated actor", "collage", "neutral portrait",
    ],
    vibeCompatibility: { "破碎感美人": "strong_anchor" },
  },
];

const COLD_JADE_CONTRACT = {
  id: "cold-jade-immortal",
  requiredCombinations: [
    { id: "cold-immortal-character", any: ["源仲", "yuan zhong", "锦绣", "jinxiu"] },
    {
      id: "pale-celestial-look",
      any: [
        "白衣", "白袍", "银白", "冰蓝", "pale robe", "white robe", "silver robe",
        "ice-blue robe", "cool-toned costume", "pale-robed celestial",
      ],
    },
    {
      id: "cold-immortal-state",
      any: [
        "清冷", "克制", "疏离", "威严", "controlled", "aloof", "restrained",
        "divine distance", "visual distance", "stillness", "authority",
        "emotionally unavailable", "severe gaze", "celestial character study",
      ],
    },
  ],
  supportingAnchors: [
    "silver", "white", "gray", "pale blue", "ice blue", "cool neutral", "fur",
    "temple", "snow", "mist", "moonlight", "water", "stone", "greenery",
    "pale outdoor light", "long sleeves", "hair ornament", "divine regalia",
    "clean silhouette", "controlled close-up", "wide costume study", "ceremonial",
  ],
  hardAntiAnchors: [
    "modern event", "award ceremony", "bts", "behind the scenes", "production equipment",
    "fire truck", "collage", "contact sheet", "poster", "text-heavy edit",
    "拼图", "九宫格", "组图", "海报", "saturated red", "dominant red", "red costume",
  ],
  softContradictions: [
    "warm gold", "cream and gold", "smiling", "playful", "black armor",
    "generic dark costume", "dark commander", "purple robe", "慕容璟和",
    "murong jinghe", "bloodied", "crying", "devastated", "emotional collapse",
  ],
  hero: {
    any: [
      "清冷", "克制", "疏离", "威严", "controlled", "aloof", "restrained",
      "divine distance", "stillness", "authority", "severe gaze",
      "sculptural collar", "emotionally unavailable",
    ],
    requireExplicit: true,
  },
  clusterIds: ["yuan-zhong-pale-ceremonial", "jinxiu-aloof-flower-deity"],
};

const LI_SHILIU_CONTRACT = {
  id: "li-shiliu-moonlit-look",
  requiredCombinations: [
    { id: "li-shiliu-character", any: ["离十六", "li shiliu"] },
    { id: "masked-look", any: ["面具", "蒙面", "mask", "hat", "moonlight", "月光"] },
  ],
  supportingAnchors: ["night", "roof", "black", "ink", "silver", "watchful", "moonlit", "屋顶", "月光"],
  hardAntiAnchors: ["modern event", "bts", "behind the scenes", "production equipment", "fire truck", "collage", "contact sheet", "拼图", "九宫格"],
  softContradictions: ["daylight", "bright studio", "casual streetwear", "award ceremony"],
  hero: { any: ["离十六", "li shiliu", "面具", "蒙面", "mask"] },
  clusterIds: ["li-shiliu-masked-moonlight"],
};

const COURT_MENACE_CONTRACT = {
  id: "liu-xueyi-court-menace",
  requiredCombinations: [
    { id: "liu-xueyi-identity", any: ["刘学义", "liu xueyi"] },
    {
      id: "court-or-official-context",
      any: [
        "court", "palace", "official", "minister", "prince", "aristocratic",
        "institutional", "hearing", "throne", "朝堂", "宫廷", "权臣", "皇子", "官服",
      ],
    },
    {
      id: "strategic-control",
      any: [
        "calculating", "assessing", "strategic", "commanding", "political",
        "authority", "jurisdiction", "power exercised", "political threat",
        "掌控", "审视", "谋略", "权力", "威压", "权谋",
      ],
    },
    {
      id: "ranked-costume-language",
      any: [
        "official styling", "official robes", "princely robes", "formal robes",
        "ornate collar", "ranked costume", "deep green", "teal", "restrained gold",
        "官服", "华服",
      ],
    },
  ],
  supportingAnchors: [
    "documents", "document", "book", "seal", "fan", "throne", "palace",
    "official interior", "another character", "controlled proximity",
    "calm", "scrutiny", "deep green", "teal", "black", "restrained gold",
    "ornate collar", "institutional power", "consequence", "sword", "weapon",
    "blade", "romantic proximity", "intimidating proximity", "romantic tension",
    "divine styling", "celestial styling", "divine regalia",
  ],
  hardAntiAnchors: [
    "modern suit", "modern suits", "modern event", "award ceremony",
    "bts", "behind the scenes", "production equipment", "fire truck",
    "collage", "contact sheet", "multi-panel", "subtitles", "platform overlay",
    "拼图", "九宫格", "组图", "字幕", "generic fantasy combat", "fantasy combat",
  ],
  softContradictions: [
    "random villain", "neutral portrait", "authority unclear", "no political context",
  ],
  hero: {
    requireExplicit: true,
    any: [
      "calculating", "assessing", "commanding", "political threat", "authority",
      "jurisdiction", "power exercised", "掌控", "审视", "威压", "权臣",
    ],
  },
  clusterIds: [
    "murong-jinghe-dark-commander",
    "court-menace-political-authority",
    "shen-zaiye-political-strategist",
  ],
};

const PROFESSIONALLY_DEVASTATED_CONTRACT = {
  id: "liu-xueyi-professionally-devastated",
  requiredCombinations: [
    { id: "liu-xueyi-identity", any: ["刘学义", "liu xueyi"] },
    {
      id: "named-heartbroken-character",
      any: [
        "慕容璟和", "murong jinghe", "沈在野", "shen zaiye", "锦绣", "jinxiu",
      ],
    },
    {
      id: "visible-romantic-devastation",
      any: [
        "wounded", "bloodied", "bleeding", "injured", "injury", "tearful", "tears",
        "exhausted", "disheveled", "distressed", "devastated", "grief", "rage",
        "collapse", "collapsing", "kneeling", "haunted", "blood", "wound",
        "crying", "carrying", "holding", "protecting", "sacrifice", "separation",
        "wedding", "aftermath", "romantic devastation",
        "伤", "血", "受伤", "流血", "落泪", "含泪", "疲惫", "凌乱", "崩溃",
        "悲痛", "暴怒", "跪", "狼狈", "憔悴", "哭戏", "吐血", "婚服", "抱",
      ],
    },
  ],
  supportingAnchors: [
    "red", "black", "white", "desaturated blue", "bruised purple",
    "rain", "snow", "night", "smoke", "firelight", "close-up", "closeup",
    "carrying", "holding", "protecting", "sacrifice", "wedding", "aftermath",
    "torn clothing", "romantic devastation", "红", "黑", "白", "雨", "雪", "夜",
    "婚服", "抱", "哭戏", "吐血",
  ],
  hardAntiAnchors: [
    "modern business", "business suit", "business suits", "modern businessman",
    "businessman", "corporate", "office styling", "office", "quarterly earnings",
    "earnings call", "suit", "suits", "glasses office", "商务", "职场", "公司",
    "办公室", "西装", "眼镜",
    "woman", "women", "female", "girl", "women-centered", "women centered",
    "woman-centered", "woman centered", "unrelated actor", "unrelated character",
    "random character", "different actor", "other actor", "namesake",
    "女主", "女性", "女人", "女孩", "女演员", "成毅",
    "collage", "contact sheet", "mood board", "multi-panel", "拼图", "九宫格", "组图", "多图", "合集",
    "clean neutral", "neutral portrait", "neutral costume", "clean costume",
    "emotionally neutral", "neutral expression", "no damage signal", "无伤",
    "无表情", "情绪平淡", "平静写真",
  ],
  softContradictions: [
    "clean portrait", "clean costume portrait", "formal portrait", "neutral",
    "modern", "casual streetwear", "award ceremony",
  ],
  hero: {
    requireExplicit: true,
    any: [
      "bloodied", "bleeding", "tearful", "crying", "collapsing", "carrying",
      "holding", "desperate", "devastated", "rage", "blood", "wound",
      "流血", "落泪", "含泪", "崩溃", "悲痛", "暴怒", "吐血", "婚服", "抱", "哭戏",
    ],
  },
  clusterIds: [
    "murong-jinghe-romantic-ruin",
    "shen-zaiye-composure-breaking",
    "jinxiu-devastated-devotion",
  ],
};

export const ACTOR_IDENTITY_PROFILES = {
  "liu-yuning": { canonicalNames: ["刘宇宁"], romanizedNames: ["Liu Yuning"], aliases: ["摩登兄弟刘宇宁", "宇宁"], commonCollisions: ["刘宇", "李大齐"], representativeWorks: ["书卷一梦", "一念关山"], knownContamination: ["李大齐", "成毅"], productStockMeanings: ["music products", "stock portraits"], trustedSourcePatterns: ["official", "studio", "drama", "magazine"], problematicSourcePatterns: ["finance", "stock", "product", "baike"], aestheticClusters: LIU_YUNING_CLUSTERS, vibeContracts: { "3": LI_SHILIU_CONTRACT } },
  "liu-xueyi": { canonicalNames: ["刘学义"], romanizedNames: ["Liu Xueyi"], aliases: ["学义"], commonCollisions: ["刘宇", "刘天成", "刘宝"], representativeWorks: ["千古玦尘", "天乩之白蛇传说", "念无双", "春花焰", "桃花映江山", "落花时节又逢君"], knownContamination: ["成毅", "same-surname namesakes"], productStockMeanings: ["glasses catalog", "stock portraits"], trustedSourcePatterns: ["official", "studio", "drama", "magazine"], problematicSourcePatterns: ["finance", "stock", "product", "reference"], aestheticClusters: LIU_XUEYI_CLUSTERS, vibeContracts: { "0": COLD_JADE_CONTRACT, "1": COURT_MENACE_CONTRACT, "3": PROFESSIONALLY_DEVASTATED_CONTRACT } },
  "song-weilong": { canonicalNames: ["宋威龙"], romanizedNames: ["Song Weilong"], aliases: ["威龙"], commonCollisions: ["威龙", "宋威"], representativeWorks: ["以家人之名", "下一站是幸福", "去有风的地方"], knownContamination: ["generic campus and basketball stock images"], productStockMeanings: ["Weilong food/snack brand", "stock photography"], trustedSourcePatterns: ["official", "studio", "drama", "magazine"], problematicSourcePatterns: ["commerce", "stock", "product"], aestheticClusters: [], vibeContracts: {} },
  "zhang-linghe": { canonicalNames: ["张凌赫"], romanizedNames: ["Zhang Linghe"], aliases: ["凌赫"], commonCollisions: ["张凌", "何苏叶"], representativeWorks: ["苍兰诀", "宁安如梦", "爱你"], knownContamination: ["谢彬彬", "doctor-role posters"], productStockMeanings: ["medical stock photos", "white-coat products"], trustedSourcePatterns: ["official", "studio", "drama", "magazine"], problematicSourcePatterns: ["commerce", "stock", "product", "reference"], aestheticClusters: [], vibeContracts: {} },
  "ao-ruipeng": { canonicalNames: ["敖瑞鹏"], romanizedNames: ["Ao Ruipeng"], aliases: ["瑞鹏"], commonCollisions: ["敖瑞", "瑞鹏"], representativeWorks: ["白月梵星", "少年江湖物语"], knownContamination: ["generic xianxia character art"], productStockMeanings: ["generic costume stock"], trustedSourcePatterns: ["official", "studio", "drama", "magazine"], problematicSourcePatterns: ["commerce", "stock", "illustration"], aestheticClusters: [], vibeContracts: {} },
  "ding-yuxi": { canonicalNames: ["丁禹兮"], romanizedNames: ["Ding Yuxi"], aliases: ["禹兮", "丁舟杰"], commonCollisions: ["丁禹", "Yuxi place-name results"], representativeWorks: ["传闻中的陈芊芊", "永夜星河"], knownContamination: ["reaction-gif reposts", "generic costume imagery"], productStockMeanings: ["Yuxi geographic/product results"], trustedSourcePatterns: ["official", "studio", "drama", "magazine"], problematicSourcePatterns: ["commerce", "stock", "maps"], aestheticClusters: [], vibeContracts: {} },
  "dylan-wang": { canonicalNames: ["王鹤棣"], romanizedNames: ["Wang Hedi", "Dylan Wang"], aliases: ["棣棣", "Dylan"], commonCollisions: ["王鹤", "Dylan"], representativeWorks: ["苍兰诀", "流星花园", "大奉打更人"], knownContamination: ["Dylan name-only results", "F4 ensemble images"], productStockMeanings: ["fashion product tiles", "brand catalog"], trustedSourcePatterns: ["official", "studio", "drama", "magazine", "editorial"], problematicSourcePatterns: ["commerce", "stock", "product"], aestheticClusters: [], vibeContracts: {} },
  "riley-wang": { canonicalNames: ["王以纶"], romanizedNames: ["Riley Wang", "Wang Yilun"], aliases: ["以纶", "赖力"], commonCollisions: ["王一伦", "Wang Yilun"], representativeWorks: ["书卷一梦", "半是蜜糖半是伤"], knownContamination: ["王一博", "王以太", "romanized namesakes"], productStockMeanings: ["glasses catalog", "stock portraits"], trustedSourcePatterns: ["official", "studio", "drama", "magazine"], problematicSourcePatterns: ["commerce", "stock", "product", "reference"], aestheticClusters: [], vibeContracts: {} },
};

export function assertIdentityProfileCoverage(actorPacks) {
  return (actorPacks || []).every(actor => ACTOR_IDENTITY_PROFILES[actor.id]);
}

export function vibePromiseFor(actor, vibeIdx) {
  const profile = ACTOR_IDENTITY_PROFILES[actor?.id];
  const vibe = actor?.vibes?.[vibeIdx] || {};
  const actorTerms = [...new Set([
    ...(profile?.canonicalNames || []),
    ...(profile?.romanizedNames || []),
    actor?.name,
    actor?.shortName_en,
  ].filter(Boolean))];
  const identityParts = new Set(actorTerms.flatMap(term =>
    String(term).toLocaleLowerCase().split(/\s+/).filter(Boolean)));
  const genericQueryTerms = new Set(["写真", "造型", "剧照", "帅气", "角色", "单人", "个人"]);
  const vibeTerms = [...new Set((vibe.queries || []).flatMap(query =>
    String(query).split(/\s+/).map(term => term.trim()).filter(term =>
      term.length >= 2
      && !identityParts.has(term.toLocaleLowerCase())
      && !genericQueryTerms.has(term))))];
  const contract = profile?.vibeContracts?.[String(vibeIdx)] || {
    id: `${actor?.id || "actor"}-vibe-${vibeIdx}`,
    requiredCombinations: [
      { id: "actor-identity", any: actorTerms },
      { id: "vibe-evidence", any: vibeTerms.length ? vibeTerms : [vibe.label, vibe.label_en].filter(Boolean) },
    ],
    supportingAnchors: vibeTerms,
    hardAntiAnchors: ["collage", "contact sheet", "拼图", "九宫格", "组图", "bts", "behind the scenes", "production equipment"],
    softContradictions: [],
    hero: { any: actorTerms },
    clusterIds: [],
  };
  return {
    ...contract,
    actorTerms,
    aestheticClusters: profile?.aestheticClusters || [],
  };
}