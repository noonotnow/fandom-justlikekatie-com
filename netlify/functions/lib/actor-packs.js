// Single source of truth for actor/vibe pack data — used by:
//   - netlify/functions/actor-packs.js (serves it to the browser as JSON)
//   - netlify/functions/star-of-day.js (in-process, no HTTP hop, to pick + build
//     today's ranked grid)
//
// This used to be a literal array inline in index.html. It moved here so the
// server (star-of-day.js) and the browser read the exact same data instead of
// two hand-maintained copies drifting apart over time.
export const ACTOR_PACKS = [
  {
    "id": "liu-yuning",
    "name": "刘宇宁",
    "shortName": "宇宁",
    "shortName_en": "Liu Yuning",
    "title": "宇宁氛围图鉴",
    "title_en": "Yuning Vibe Atlas",
    "icon": "🖤",
    "accentColor": "#c9a96e",
    "cardBg": "linear-gradient(135deg,#1a1408 0%,#2a1f0a 100%)",
    "vibes": [
      {
        "emoji": "🌃",
        "label": "建筑能量",
        "label_en": "Skyscraper Energy",
        "subtitle": "摩天楼下，静默的权力感",
        "subtitle_en": "Quiet power beneath the city lights",
        "queries": [
          "刘宇宁 夜景 帅气",
          "刘宇宁 城市 大片",
          "刘宇宁 建筑 帅气"
        ],
        "shareFragment": "建筑能量满分，摩天楼下的宇宁太飒了",
        "mjPrompt": "Liu Yuning 刘宇宁, tall commanding Chinese male singer, distinct beauty mark under left eye, standing at base of glass skyscraper at blue hour dusk, sharp black overcoat, calm intensity, city lights bokeh, golden rim light, cinematic wide angle, photorealistic editorial --ar 3:4 --style raw --v 6.1"
      },
      {
        "emoji": "🔍",
        "label": "痣点特写",
        "label_en": "Beauty Mark Close-Up",
        "subtitle": "那颗痣放大一百倍，还是他",
        "subtitle_en": "That mole zoomed in a hundred times — still unmistakably him",
        "queries": [
          "刘宇宁 近景",
          "刘宇宁 特写 帅气",
          "刘宇宁 近照"
        ],
        "shareFragment": "那颗痣特写给我整破防了",
        "mjPrompt": "Liu Yuning 刘宇宁, extreme close-up portrait, distinct beauty mark beneath left eye, face slightly turned, soft diffused window light, parted lips, deep dark eyes with catch light, minimalist white background, editorial beauty campaign, photorealistic --ar 3:4 --style raw --v 6.1"
      },
      {
        "emoji": "☀️",
        "label": "男友光线",
        "label_en": "Boyfriend Lighting",
        "subtitle": "黄昏里温柔到不像话的他",
        "subtitle_en": "So tender in the golden hour it's almost unfair",
        "queries": [
          "刘宇宁 温柔",
          "刘宇宁 生活照",
          "刘宇宁 日常 随拍"
        ],
        "shareFragment": "男友光线宇宁，黄昏限定心动",
        "mjPrompt": "Liu Yuning 刘宇宁, candid portrait in warm golden hour sunlight through window, relaxed soft half-smile, casual cream linen shirt, bokeh interior, warm amber film grain, intimate tender mood, photorealistic --ar 3:4 --style raw --v 6.1"
      },
      {
        "emoji": "🌙",
        "label": "月光兼职氛围农夫",
        "label_en": "Moonlighting as an aura farmer",
        "subtitle": "他站在屋顶上，像剧情欠他钱",
        "subtitle_en": "He stood on the roof like the plot owed him money",
        "queries": [
          "刘宇宁 书卷一梦",
          "刘宇宁 书卷一梦 剧照",
          "刘宇宁 十六 书卷一梦",
          "刘宇宁 离十六 书卷一梦",
          "刘宇宁 十六 剧照",
          "刘宇宁 离十六 剧照",
          "刘宇宁 古装 剧照"
        ],
        "shareFragment": "月光兼职氛围农夫宇宁，站在屋顶上像剧情欠他钱",
        "mjPrompt": ""
      }
    ]
  },
  {
    "id": "liu-xueyi",
    "name": "刘学义",
    "shortName": "学义",
    "shortName_en": "Liu Xueyi",
    "title": "学义氛围图鉴",
    "title_en": "Xueyi Vibe Atlas",
    "icon": "🗡️",
    "accentColor": "#a8bde0",
    "cardBg": "linear-gradient(135deg,#0a0f1a 0%,#0f1828 100%)",
    "vibes": [
      {
        "emoji": "🗡️",
        "label": "仙门冷玉",
        "label_en": "Cold Jade Immortal",
        "subtitle": "一身白衣，像规矩本身动了情",
        "subtitle_en": "All in white, like discipline itself caught feelings",
        "queries": [
          "刘学义 琉璃 柏麟 白衣",
          "刘学义 千古玦尘 景昭",
          "刘学义 古装 白衣 仙侠 剧照"
        ],
        "shareFragment": "仙门冷玉学义，白衣一出天下寒",
        "mjPrompt": ""
      },
      {
        "emoji": "👑",
        "label": "权臣压迫感",
        "label_en": "Court Menace",
        "subtitle": "他一抬眼，朝堂都安静了",
        "subtitle_en": "One look from him and the whole court goes silent",
        "queries": [
          "刘学义 古装 权谋 帅气",
          "刘学义 权臣 大片",
          "刘学义 古装 霸气"
        ],
        "shareFragment": "权臣压迫感学义，他一抬眼朝堂就安静了",
        "mjPrompt": ""
      },
      {
        "emoji": "🤓",
        "label": "斯文败类",
        "label_en": "Polished Danger",
        "subtitle": "眼镜一戴，危险变得很有礼貌",
        "subtitle_en": "Put the glasses on. The danger got extremely polite.",
        "queries": [
          "刘学义 眼镜 斯文 帅气",
          "刘学义 眼镜 现代",
          "刘学义 西装 眼镜"
        ],
        "shareFragment": "眼镜版学义，斯文败类警告",
        "mjPrompt": ""
      },
      {
        "emoji": "🌙",
        "label": "破碎感美人",
        "label_en": "Shattered Beauty",
        "subtitle": "明明没说话，像已经疼了三生三世",
        "subtitle_en": "Said nothing — but clearly hurting for three lifetimes",
        "queries": [
          "刘学义 破碎感 古装",
          "刘学义 落寞 古装",
          "刘学义 悲剧感 古装"
        ],
        "shareFragment": "破碎感美人学义，三生三世都是他",
        "mjPrompt": ""
      }
    ]
  },
  {
    "id": "song-weilong",
    "name": "宋威龙",
    "shortName": "威龙",
    "shortName_en": "Song Weilong",
    "title": "威龙氛围图鉴",
    "title_en": "Weilong Vibe Atlas",
    "icon": "🌊",
    "accentColor": "#7ecfb3",
    "cardBg": "linear-gradient(135deg,#06130f 0%,#0d1f1a 100%)",
    "vibes": [
      {
        "emoji": "🌊",
        "label": "初恋滤镜",
        "label_en": "First Love Filter",
        "subtitle": "夏天、白衬衫、和不敢对视的心动",
        "subtitle_en": "Summer, white shirt, hearts too scared to make eye contact",
        "queries": [
          "宋威龙 初恋感 白衬衫",
          "宋威龙 夏天 帅气",
          "宋威龙 白衬衫 阳光"
        ],
        "shareFragment": "初恋滤镜宋威龙，白衬衫夏日限定",
        "mjPrompt": ""
      },
      {
        "emoji": "🏀",
        "label": "校园男神",
        "label_en": "Campus Heartthrob",
        "subtitle": "他一回头，操场自动慢动作",
        "subtitle_en": "He turns around and the whole field goes slow-motion",
        "queries": [
          "宋威龙 校园 帅气",
          "宋威龙 篮球 帅气",
          "宋威龙 校服 帅气"
        ],
        "shareFragment": "校园男神宋威龙，操场慢动作限定",
        "mjPrompt": ""
      },
      {
        "emoji": "🧊",
        "label": "冷脸小狗",
        "label_en": "Cold-Face Puppy",
        "subtitle": "看起来不理人，其实很好哄",
        "subtitle_en": "Looks unapproachable. Actually very easy to win over.",
        "queries": [
          "宋威龙 冷脸 帅气",
          "宋威龙 酷酷的",
          "宋威龙 冷淡 帅"
        ],
        "shareFragment": "冷脸小狗宋威龙，表情再冷其实很好哄",
        "mjPrompt": ""
      },
      {
        "emoji": "🛋️",
        "label": "居家男友",
        "label_en": "Domestic Boyfriend",
        "subtitle": "随便一坐，像你手机里的私藏照片",
        "subtitle_en": "Casually sits there — feels like your secret phone folder",
        "queries": [
          "宋威龙 生活照 温柔",
          "宋威龙 日常 居家",
          "宋威龙 随拍 温柔"
        ],
        "shareFragment": "居家男友宋威龙，私藏照片既视感",
        "mjPrompt": ""
      }
    ]
  },
  {
    "id": "zhang-linghe",
    "name": "张凌赫",
    "shortName": "凌赫",
    "shortName_en": "Zhang Linghe",
    "title": "凌赫氛围图鉴",
    "title_en": "Zhang Linghe Vibe Atlas",
    "icon": "🕊️",
    "accentColor": "#a8c4b0",
    "cardBg": "linear-gradient(135deg,#080d09 0%,#0d1610 100%)",
    "vibes": [
      {
        "emoji": "🩺",
        "label": "医生陷阱",
        "label_en": "If you're a doctor, I'm dying",
        "subtitle": "诊断结果是美貌，预后很差",
        "subtitle_en": "The diagnosis was beauty, and the prognosis was poor",
        "queries": [
          "张凌赫 何苏叶 医生 单人",
          "张凌赫 白大褂 帅气",
          "张凌赫 医生 写真",
          "张凌赫 医生 特写",
          "张凌赫 白大褂 剧照",
          "张凌赫 医生装",
          "张凌赫 爱你 何苏叶 单人",
          "张凌赫 爱你 医生 个人",
          "Zhang Linghe doctor handsome",
          "张凌赫 doctor white coat"
        ],
        "shareFragment": "凌赫当医生，诊断结果：美貌加重，预后不良",
        "mjPrompt": ""
      },
      {
        "emoji": "🕊️",
        "label": "四海重明",
        "label_en": "No misunderstanding, just mortality",
        "subtitle": "世界已够难了，不需要爱情再变蠢",
        "subtitle_en": "The world was hard enough without making love stupid",
        "queries": [
          "张凌赫 四海重明 南颜 嵇炀 仙侠",
          "张凌赫 嵇炀 大片",
          "张凌赫 仙侠 古装 帅"
        ],
        "shareFragment": "四海重明凌赫，这段感情不需要误会，只需要命运",
        "mjPrompt": ""
      },
      {
        "emoji": "🔎",
        "label": "探案失控",
        "label_en": "Investigation compromised",
        "subtitle": "案子没破，因为所有人都走神了",
        "subtitle_en": "The case was unsolved because everyone got distracted",
        "queries": [
          "张凌赫 少女大人 古装 探案",
          "张凌赫 少女大人 名场面",
          "张凌赫 古装 探案 帅气"
        ],
        "shareFragment": "探案中的凌赫，案子悬而未决，因为所有人都分心了",
        "mjPrompt": ""
      },
      {
        "emoji": "🪷",
        "label": "玉色祸水",
        "label_en": "If jade could ruin your life",
        "subtitle": "不幸的是，他让这件事看起来像遗传",
        "subtitle_en": "Unfortunately, he made it look hereditary",
        "queries": [
          "张凌赫 古装 玉 宁安如梦 度华年",
          "张凌赫 度华年 古装 帅",
          "张凌赫 宁安如梦 大片"
        ],
        "shareFragment": "古装玉色凌赫，毁人不倦还要让你觉得是遗传",
        "mjPrompt": ""
      },
      {
        "emoji": "🌙",
        "label": "第二男主",
        "label_en": "Second lead, first wound",
        "subtitle": "他太高贵了，这是麻烦的第一个信号",
        "subtitle_en": "He was noble, which was the first sign of trouble",
        "queries": [
          "张凌赫 长珩 苍兰诀",
          "张凌赫 苍兰诀 长珩 大片",
          "张凌赫 苍兰诀 帅"
        ],
        "shareFragment": "苍兰诀长珩凌赫，太高贵是他，受伤最深也是他",
        "mjPrompt": ""
      }
    ]
  },
  {
    "id": "ao-ruipeng",
    "name": "敖瑞鹏",
    "shortName": "瑞鹏",
    "shortName_en": "Ao Ruipeng",
    "title": "瑞鹏氛围图鉴",
    "title_en": "Ao Ruipeng Vibe Atlas",
    "icon": "☀️",
    "accentColor": "#e8c87a",
    "cardBg": "linear-gradient(135deg,#14100a 0%,#1e1608 100%)",
    "vibes": [
      {
        "emoji": "👑",
        "label": "无人看管的王子",
        "label_en": "Prince Charming left unattended",
        "subtitle": "有人给了他一把剑，监督完全不够",
        "subtitle_en": "Someone gave him a sword and not enough supervision",
        "queries": [
          "敖瑞鹏 古装 帅气 仙侠",
          "敖瑞鹏 古装 大片",
          "敖瑞鹏 仙侠 帅"
        ],
        "shareFragment": "无人看管的白马王子瑞鹏，给了他把剑就没人管得了他",
        "mjPrompt": ""
      },
      {
        "emoji": "🌸",
        "label": "温柔脸探险心",
        "label_en": "Soft face, quest behavior",
        "subtitle": "他看起来温柔，麻烦就是这样进来的",
        "subtitle_en": "He looked gentle, which is how the trouble got in",
        "queries": [
          "敖瑞鹏 温柔 古装 甜",
          "敖瑞鹏 古装 甜 帅气",
          "敖瑞鹏 温柔 大片"
        ],
        "shareFragment": "瑞鹏看起来温柔，但麻烦就是这么进来的",
        "mjPrompt": ""
      },
      {
        "emoji": "🐉",
        "label": "仙侠小孩危险",
        "label_en": "Baby xianxia menace",
        "subtitle": "天庭HR部门对此深表担忧",
        "subtitle_en": "The celestial HR department has concerns",
        "queries": [
          "敖瑞鹏 仙侠 古装 少年感",
          "敖瑞鹏 少年 古装 大片",
          "敖瑞鹏 仙侠 帅气"
        ],
        "shareFragment": "仙侠小少年瑞鹏，天庭HR部门已提交正式关注报告",
        "mjPrompt": ""
      },
      {
        "emoji": "☀️",
        "label": "阳光王子坏主意",
        "label_en": "Sunshine prince, bad decisions",
        "subtitle": "笑容比后果先到",
        "subtitle_en": "The smile arrived before the consequences",
        "queries": [
          "敖瑞鹏 笑容 现代 综艺",
          "敖瑞鹏 笑容 帅气",
          "敖瑞鹏 现代 生活照"
        ],
        "shareFragment": "阳光王子瑞鹏的坏主意，笑容每次都比后果先到",
        "mjPrompt": ""
      }
    ]
  },
  {
    "id": "ding-yuxi",
    "name": "丁禹兮",
    "shortName": "禹兮",
    "shortName_en": "Ding Yuxi",
    "title": "禹兮氛围图鉴",
    "title_en": "Ding Yuxi Vibe Atlas",
    "icon": "🎭",
    "accentColor": "#c4a0d0",
    "cardBg": "linear-gradient(135deg,#0e0a14 0%,#180f22 100%)",
    "vibes": [
      {
        "emoji": "🎭",
        "label": "表情包有意识",
        "label_en": "The reaction gif is sentient",
        "subtitle": "他的脸比剧情早三秒入场",
        "subtitle_en": "His face entered the scene three seconds before the plot did",
        "queries": [
          "丁禹兮 表情包 名场面",
          "丁禹兮 表情 搞笑",
          "丁禹兮 名场面 反应"
        ],
        "shareFragment": "禹兮的表情包有自己的意识，每次都比剧情早三秒到场",
        "mjPrompt": ""
      },
      {
        "emoji": "💘",
        "label": "甜宠刺客",
        "label_en": "Rom-com assassin",
        "subtitle": "他礼貌地笑了一下，整个类型片就塌了",
        "subtitle_en": "He smiled politely and the genre collapsed",
        "queries": [
          "丁禹兮 甜宠 现代剧 可爱",
          "丁禹兮 甜宠 男友感",
          "丁禹兮 现代 可爱 帅"
        ],
        "shareFragment": "甜宠刺客禹兮，礼貌笑了一下，整个类型片当场塌了",
        "mjPrompt": ""
      },
      {
        "emoji": "🦊",
        "label": "软话里的刀",
        "label_en": "Softboy with a knife in the dialogue",
        "subtitle": "台词温柔，时机致命",
        "subtitle_en": "Gentle delivery, lethal timing",
        "queries": [
          "丁禹兮 台词 名场面 眼神",
          "丁禹兮 眼神 名场面",
          "丁禹兮 台词 破防"
        ],
        "shareFragment": "台词软软的，时机是刀，禹兮的软话里永远藏着刀",
        "mjPrompt": ""
      },
      {
        "emoji": "🌙",
        "label": "古装演技危险分子",
        "label_en": "Costume drama emotional support menace",
        "subtitle": "穿的是古装，走的是现代演技路线",
        "subtitle_en": "Ancient robes, modern levels of acting choices",
        "queries": [
          "丁禹兮 古装 传闻中的陈芊芊 永夜星河",
          "丁禹兮 古装 大片",
          "丁禹兮 传闻中的陈芊芊 帅"
        ],
        "shareFragment": "古装禹兮，穿的是千年前的衣服，演技走的是现代路线",
        "mjPrompt": ""
      }
    ]
  },
  {
    "id": "dylan-wang",
    "name": "王鹤棣",
    "shortName": "鹤棣",
    "shortName_en": "Dylan",
    "title": "鹤棣氛围图鉴",
    "title_en": "Dylan Wang Vibe Atlas",
    "icon": "🔥",
    "accentColor": "#c94f4f",
    "cardBg": "linear-gradient(135deg,#1a0808 0%,#0e0404 100%)",
    "vibes": [
      {
        "emoji": "🌙",
        "label": "魔君破坏算法",
        "label_en": "Demon lord broke the algorithm",
        "subtitle": "一袭黑袍，搜索结果开始尖叫",
        "subtitle_en": "One black robe and the search results started screaming",
        "queries": [
          "王鹤棣 东方青苍 苍兰诀",
          "王鹤棣 苍兰诀 古装",
          "王鹤棣 LBFAD 仙侠"
        ],
        "shareFragment": "🌙 王鹤棣苍兰诀氛围捕捉中",
        "mjPrompt": ""
      },
      {
        "emoji": "🔥",
        "label": "高产脸孔经济",
        "label_en": "High-volume face economy",
        "subtitle": "结果太多，却每一张都对",
        "subtitle_en": "There were too many results and somehow all of them were correct",
        "queries": [
          "王鹤棣 帅气 大片 时尚",
          "王鹤棣 杂志 写真 封面",
          "王鹤棣 商业大片 帅"
        ],
        "shareFragment": "🔥 王鹤棣高清大片氛围捕捉中",
        "mjPrompt": ""
      },
      {
        "emoji": "🏀",
        "label": "流星花园附带伤害",
        "label_en": "Meteor Garden collateral damage",
        "subtitle": "校服做了它该做的事",
        "subtitle_en": "The school uniform did what it came to do",
        "queries": [
          "王鹤棣 道明寺 流星花园",
          "王鹤棣 流星花园 校服",
          "王鹤棣 F4 道明寺"
        ],
        "shareFragment": "🏀 王鹤棣流星花园氛围捕捉中",
        "mjPrompt": ""
      },
      {
        "emoji": "😈",
        "label": "综艺混乱与颧骨",
        "label_en": "Variety chaos with cheekbones",
        "subtitle": "他进了房间，镜头放弃装作中立",
        "subtitle_en": "He entered the room and the camera gave up pretending to be neutral",
        "queries": [
          "王鹤棣 综艺 搞笑 帅气",
          "王鹤棣 综艺 表情包",
          "王鹤棣 综艺 名场面"
        ],
        "shareFragment": "😈 王鹤棣综艺氛围捕捉中",
        "mjPrompt": ""
      }
    ]
  },
  {
    "id": "riley-wang",
    "name": "王以纶",
    "shortName": "以纶",
    "shortName_en": "Riley",
    "title": "以纶氛围图鉴",
    "title_en": "Riley Wang Vibe Atlas",
    "icon": "💭",
    "accentColor": "#8fa8d0",
    "cardBg": "linear-gradient(135deg,#080e1a 0%,#04070f 100%)",
    "vibes": [
      {
        "emoji": "💭",
        "label": "梦的逻辑，真实困境",
        "label_en": "Dream logic, real problem",
        "subtitle": "剧情拐了个弯，他还是正确答案",
        "subtitle_en": "The plot bent sideways and he still looked like the correct answer",
        "queries": [
          "王以纶 书卷一梦",
          "王以纶 书卷一梦 古装",
          "王以纶 书卷一梦 剧照"
        ],
        "shareFragment": "💭 王以纶书卷一梦氛围捕捉中",
        "mjPrompt": ""
      },
      {
        "emoji": "🔎",
        "label": "搜索引擎欠他一个道歉",
        "label_en": "The search engine owes him an apology",
        "subtitle": "本不该这么难找到",
        "subtitle_en": "This should not be this hard to find",
        "queries": [
          "王以纶 帅气 写真",
          "王以纶 帅气 大片",
          "王以纶 写真 精修"
        ],
        "shareFragment": "🔎 王以纶写真氛围捕捉中",
        "mjPrompt": ""
      },
      {
        "emoji": "🧥",
        "label": "现代剧隐藏宝藏",
        "label_en": "Modern drama hidden gem",
        "subtitle": "低调帅气，严重被低估",
        "subtitle_en": "Quietly handsome, aggressively under-indexed",
        "queries": [
          "王以纶 现代剧 帅气",
          "王以纶 现代 穿搭",
          "王以纶 现代剧 剧照"
        ],
        "shareFragment": "🧥 王以纶现代剧氛围捕捉中",
        "mjPrompt": ""
      },
      {
        "emoji": "🤓",
        "label": "可爱但需要消歧义",
        "label_en": "Cute but make it disambiguation",
        "subtitle": "氛围很清晰；搜索结果需要监督",
        "subtitle_en": "The vibes are clear; the search results need supervision",
        "queries": [
          "王以纶 眼镜 可爱 帅气",
          "王以纶 眼镜 书生",
          "王以纶 眼镜 写真"
        ],
        "shareFragment": "🤓 王以纶眼镜氛围捕捉中",
        "mjPrompt": ""
      }
    ]
  }
];
