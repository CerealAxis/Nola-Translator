"""Language names exposed by Index-Translate's official reference website.

Source: https://index-translate.bilibili.com/?p=/site/langs.js
The official table contains 150 distinct language names; common app aliases are
used where the app already has a stable ISO code.
"""

LANGUAGE_NAMES = {
    "en": "英语", "zh": "中文", "de": "德语", "fr": "法语", "es": "西班牙语", "ja": "日语", "ko": "韩语", "pt": "葡萄牙语", "ru": "俄语", "ar": "阿拉伯语",
    "it": "意大利语", "nl": "荷兰语", "pl": "波兰语", "ro": "罗马尼亚语", "sv": "瑞典语", "tr": "土耳其语", "hi": "印地语", "vi": "越南语", "th": "泰语", "id": "印尼语",
    "ms": "马来语", "tl": "菲律宾语", "uk": "乌克兰语", "fa": "波斯语", "cs": "捷克语", "el": "希腊语", "da": "丹麦语", "hu": "匈牙利语", "fi": "芬兰语", "no": "书面挪威语",
    "sk": "斯洛伐克语", "bg": "保加利亚语", "bos-latn": "波斯尼亚语", "cat-latn": "加泰罗尼亚语", "ben-beng": "孟加拉语", "heb-hebr": "希伯来语",
    "lit-latn": "立陶宛语", "slv-latn": "斯洛文尼亚语", "ekk-latn": "爱沙尼亚语", "als-latn": "阿尔巴尼亚语", "lvs-latn": "拉脱维亚语",
    "azj-latn": "阿塞拜疆语", "hrv-latn": "克罗地亚语", "tam-taml": "泰米尔语", "npi-deva": "尼泊尔语", "urd-arab": "乌尔都语",
    "mkd-cyrl": "马其顿语", "srp-cyrl": "塞尔维亚语（西里尔）", "mar-deva": "马拉地语", "kat-geor": "格鲁吉亚语", "mal-mlym": "马拉雅拉姆语",
    "kaz-cyrl": "哈萨克语", "isl-latn": "冰岛语", "glg-latn": "加利西亚语", "kan-knda": "卡纳达语", "ary-arab": "摩洛哥阿拉伯语",
    "guj-gujr": "古吉拉特语", "bel-cyrl": "白俄罗斯语", "afr-latn": "南非荷兰语", "hye-armn": "亚美尼亚语", "khk-cyrl": "蒙古语",
    "khm-khmr": "高棉语", "eus-latn": "巴斯克语", "mya-mymr": "缅甸语", "lat-latn": "拉丁语", "uzn-cyrl": "乌兹别克语（西里尔）",
    "tel-telu": "泰卢固语", "ory-orya": "奥里亚语", "nno-latn": "新挪威语", "uzn-latn": "乌兹别克语", "swh-latn": "斯瓦希里语",
    "sin-sinh": "僧伽罗语", "kir-cyrl": "吉尔吉斯语", "som-latn": "索马里语", "pan-guru": "旁遮普语", "arz-arab": "埃及阿拉伯语",
    "cym-latn": "威尔士语", "nrm-latn": "诺曼语", "pbt-arab": "普什图语", "gle-latn": "爱尔兰语", "srp-latn": "塞尔维亚语（拉丁）",
    "hau-latn": "豪萨语", "ckb-arab": "中库尔德语", "mlt-latn": "马耳他语", "yue-hani": "粤语", "tgk-cyrl": "塔吉克语",
    "kmr-latn": "北库尔德语", "bew-latn": "贝塔维语", "amh-ethi": "阿姆哈拉语", "lao-laoo": "老挝语", "ltz-latn": "卢森堡语",
    "fry-latn": "弗里西语", "div-thaa": "迪维希语", "epo-latn": "世界语", "kin-latn": "卢旺达语", "ars-arab": "内志阿拉伯语",
    "fao-latn": "法罗语", "plt-latn": "马达加斯加语", "asm-beng": "阿萨姆语", "snd-arab": "信德语", "xho-latn": "科萨语",
    "tuk-latn": "土库曼语", "hat-latn": "海地克里奥尔语", "gla-latn": "苏格兰盖尔语", "ceb-latn": "宿务语", "ydd-hebr": "意第绪语",
    "jav-latn": "爪哇语", "bak-cyrl": "巴什基尔语", "pap-latn": "帕皮阿门托语", "mri-latn": "毛利语", "uig-arab": "维吾尔语",
    "tat-cyrl": "鞑靼语", "bod-tibt": "藏语", "mww-latn": "白苗语", "hyw-armn": "西亚美尼亚语", "yor-latn": "约鲁巴语",
    "zul-latn": "祖鲁语", "sdh-arab": "南库尔德语", "smo-latn": "萨摩亚语", "cos-latn": "科西嘉语", "hif-latn": "斐济印地语",
    "sun-latn": "巽他语", "nya-latn": "齐切瓦语", "ibo-latn": "伊博语", "haw-latn": "夏威夷语", "sot-latn": "塞索托语",
    "lus-latn": "米佐语", "sna-latn": "绍纳语", "chv-cyrl": "楚瓦什语", "azb-arab": "南阿塞拜疆语", "roh-latn": "罗曼什语",
    "run-latn": "基隆迪语", "hin-latn": "印地语（拉丁）", "sah-cyrl": "雅库特语", "tir-ethi": "提格利尼亚语", "ast-latn": "阿斯图里亚斯语",
    "oci-latn": "奥克语", "cnh-latn": "钦语（哈卡）", "sme-latn": "北萨米语", "nds-latn": "低地德语", "oss-cyrl": "奥塞梯语",
    "urd-latn": "乌尔都语（拉丁）", "gsw-latn": "瑞士德语", "anp-deva": "昂加语", "apc-arab": "黎凡特阿拉伯语", "gaz-latn": "奥罗莫语",
    "nap-latn": "那不勒斯语", "hsb-latn": "上索布语", "hil-latn": "希利盖农语", "kal-latn": "格陵兰语",
}
