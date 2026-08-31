// Private operational metadata. Do not add this to ACTOR_PACKS or public APIs.
// These are search-disambiguation heuristics, not identity verification.
export const IDENTITY_PROFILE_VERSION = 2;
export const AESTHETIC_CLUSTER_VERSION = 1;
export const VIBE_PROMISE_CONTRACT_VERSION = 2;

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
    mood: ["controlled", "aloof", "divine", "restrained"],
    palette: ["white", "silver", "pale blue", "cool gray"],
    wardrobeAnchors: ["white robes", "pale robes", "silver detailing", "fur trim"],
    propAnchors: ["crown", "hair ornament", "fan"],
    settingAnchors: ["temple", "snow", "moonlight", "mist", "ceremonial"],
    antiAnchors: ["modern event", "bts", "production equipment", "red commander", "fire truck"],
    vibeCompatibility: { "仙门冷玉": "strong_anchor" },
  },
  {
    id: "murong-jinghe-dark-commander",
    work: "春花焰",
    character: "慕容璟和",
    aliases: ["Murong Jinghe", "dark commander"],
    mood: ["severe", "dangerous", "wounded"],
    palette: ["black", "red", "deep burgundy", "warm gold"],
    wardrobeAnchors: ["commander robes", "armor", "dark costume"],
    propAnchors: ["sword", "weapon"],
    settingAnchors: ["court", "battlefield", "war"],
    antiAnchors: ["pale ceremonial", "white immortal", "modern event", "bts", "fire truck"],
    vibeCompatibility: { "权臣压迫感": "strong_anchor", "仙门冷玉": "conflict" },
  },
];

const COLD_JADE_CONTRACT = {
  id: "cold-jade-immortal",
  requiredCombinations: [
    { id: "yuan-zhong-cluster", any: ["源仲", "yuan zhong"] },
    { id: "pale-costume", any: ["白衣", "白袍", "pale robe", "white robe", "silver robe", "cool-toned costume"] },
  ],
  supportingAnchors: ["silver", "white", "gray", "pale blue", "fur", "restrained", "temple", "snow", "mist", "moonlight", "ceremonial"],
  hardAntiAnchors: ["modern event", "award ceremony", "bts", "behind the scenes", "production equipment", "fire truck", "collage", "contact sheet", "拼图", "九宫格", "组图"],
  softContradictions: ["red", "saturated red", "warm gold", "black armor", "dark commander", "purple robe", "慕容璟和", "murong jinghe"],
  hero: { any: ["源仲", "yuan zhong", "白衣", "白袍", "white robe", "pale ceremonial"] },
  clusterIds: ["yuan-zhong-pale-ceremonial"],
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

export const ACTOR_IDENTITY_PROFILES = {
  "liu-yuning": { canonicalNames: ["刘宇宁"], romanizedNames: ["Liu Yuning"], aliases: ["摩登兄弟刘宇宁", "宇宁"], commonCollisions: ["刘宇", "李大齐"], representativeWorks: ["书卷一梦", "一念关山"], knownContamination: ["李大齐", "成毅"], productStockMeanings: ["music products", "stock portraits"], trustedSourcePatterns: ["official", "studio", "drama", "magazine"], problematicSourcePatterns: ["finance", "stock", "product", "baike"], aestheticClusters: LIU_YUNING_CLUSTERS, vibeContracts: { "3": LI_SHILIU_CONTRACT } },
  "liu-xueyi": { canonicalNames: ["刘学义"], romanizedNames: ["Liu Xueyi"], aliases: ["学义"], commonCollisions: ["刘宇", "刘天成", "刘宝"], representativeWorks: ["千古玦尘", "天乩之白蛇传说", "念无双"], knownContamination: ["成毅", "same-surname namesakes"], productStockMeanings: ["glasses catalog", "stock portraits"], trustedSourcePatterns: ["official", "studio", "drama", "magazine"], problematicSourcePatterns: ["finance", "stock", "product", "reference"], aestheticClusters: LIU_XUEYI_CLUSTERS, vibeContracts: { "0": COLD_JADE_CONTRACT } },
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
    aestheticClusters: profile?.aestheticClusters || [],
  };
}