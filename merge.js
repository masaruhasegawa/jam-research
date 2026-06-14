// merge.js ── リサが書いた today.json を feeds.js に「安全に」合体する。
//
// 設計の肝（過去を絶対に消さない）：
//  - リサ（Opus）は「今日の1日分」だけを today.json に書く。過去の日々には一切触らない。
//  - このスクリプトが、既存の feeds.js を読み、過去日はプログラムでそのままコピーし、
//    今日のぶんだけを足す。だからリサが何を書こうと過去日は失われない。
//  - 同じ日付が既にあれば「差し替え」ではなく「非重複で追加」（朝のカードを残す）。
//  - 全日保存（トリミングなし）。
//  - today.json が壊れていれば、feeds.js を一切書き換えずに異常終了する＝サイトは無傷。
//    （以前の「直接 feeds.js を手書き→1文字壊れて全白」事故を構造的に根絶）
//
// 使い方： node merge.js   （カレントに feeds.js と today.json がある前提）

const fs = require("fs");

function loadFeeds() {
  try {
    const p = require.resolve("./feeds.js");
    delete require.cache[p];
    global.window = {};
    require("./feeds.js");
    return Array.isArray(global.window.LISA_FEEDS) ? global.window.LISA_FEEDS : [];
  } catch (e) {
    console.error("既存 feeds.js の読込に失敗（空配列から開始）:", e.message);
    return [];
  }
}

// --- today.json を読む（厳密JSON。壊れていればここで安全に中断） ---
let today;
try {
  today = JSON.parse(fs.readFileSync("today.json", "utf8"));
} catch (e) {
  console.error("✗ today.json が有効なJSONではない:", e.message);
  console.error("  → feeds.js は触っていない（サイトは無傷）。today.json を直して再実行。");
  process.exit(1);
}
if (!today || !today.date || !Array.isArray(today.cards) || !today.cards.length) {
  console.error("✗ today.json の形が不正（date と cards[] が必要）。feeds.js は触っていない。");
  process.exit(1);
}

const feeds = loadFeeds();
const before = feeds.map(d => d.date);
const key = c => (c.id || "") + "|" + (c.headline || "");
const idx = feeds.findIndex(d => d.date === today.date);

if (idx === -1) {
  // 新しい日 → 先頭に追加
  feeds.unshift({ date: today.date, greeting: today.greeting || "", cards: today.cards });
  console.log("新しい日を先頭に追加:", today.date, "(" + today.cards.length + "枚)");
} else {
  // 同じ日 → 既存カードを残して、非重複ぶんだけ追加
  const day = feeds[idx];
  const seen = new Set((day.cards || []).map(key));
  const fresh = today.cards.filter(c => !seen.has(key(c)));
  day.cards = (day.cards || []).concat(fresh);
  if (today.greeting) day.greeting = today.greeting;
  console.log("同日追加:", today.date, "新規", fresh.length, "枚 / 合計", day.cards.length, "枚");
}

// --- 書き出し（JSON.stringify が引用符を自動エスケープ＝壊れない有効JS） ---
const out = "window.LISA_FEEDS = " + JSON.stringify(feeds, null, 2) + ";\n";
fs.writeFileSync("feeds.js", out);

// --- 自己検証：書いた feeds.js が有効JSか・過去日が1つも消えてないか ---
const after = loadFeeds().map(d => d.date);
const lost = before.filter(d => !after.includes(d));
if (lost.length) {
  console.error("✗✗ 致命：過去日が消えた:", lost.join(","), "→ commit しないこと");
  process.exit(1);
}
console.log("✓ feeds.js 更新OK。総日数", after.length, "／ 全日付:", after.join(", "));
