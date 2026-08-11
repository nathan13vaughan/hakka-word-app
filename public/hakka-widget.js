// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: language;

// ── Hakka Word of the Day · home-screen widget ─────────────────────────
// Shows the latest word from your PC's Hakka server. Caches the last
// word locally so the widget still works when your PC is off.
//
// Setup: install "Scriptable" from the App Store, create a new script,
// paste this file in, then add a Scriptable widget to your home screen
// and point it at this script.

const SERVER = "http://192.168.50.46:3456"; // your PC on your home Wi-Fi

// GitHub source — works from anywhere, even with the PC asleep.
// Create a fine-grained personal access token (github.com → Settings →
// Developer settings → Fine-grained tokens) limited to this one repo with
// ONLY "Contents: Read-only", and paste it below ON YOUR PHONE.
// ⚠ Never save the token into this file on the PC — it would get committed.
const GITHUB = {
  user: "nathan13vaughan",
  repo: "hakka-word-app",
  branch: "main",
  token: "", // ← paste your token here (in Scriptable on the phone only)
};

// Palette (light, dark) — matches the web app.
const BG = Color.dynamic(new Color("#f6f1e7"), new Color("#171412"));
const INK = Color.dynamic(new Color("#2b2620"), new Color("#ece5d8"));
const ACCENT = Color.dynamic(new Color("#b3382c"), new Color("#e05a48"));
const MUTED = Color.dynamic(new Color("#7a6f5f"), new Color("#a2968a"));
const GOLD = Color.dynamic(new Color("#a9812e"), new Color("#d1a94f"));

const fm = FileManager.local();
const CACHE = fm.joinPath(fm.documentsDirectory(), "hakka-word-cache.json");

async function fromGitHub() {
  if (!GITHUB.token) throw new Error("no token");
  const req = new Request(
    `https://api.github.com/repos/${GITHUB.user}/${GITHUB.repo}/contents/data/latest.json?ref=${GITHUB.branch}`
  );
  req.headers = {
    Accept: "application/vnd.github.raw+json",
    Authorization: "Bearer " + GITHUB.token,
  };
  req.timeoutInterval = 10;
  const word = await req.loadJSON();
  if (!word || !word.hanzi) throw new Error("bad GitHub response");
  return word;
}

async function fromLan() {
  const req = new Request(SERVER + "/api/latest");
  req.timeoutInterval = 5;
  const data = await req.loadJSON();
  if (!data.word) throw new Error(data.error || "no word");
  return data.word;
}

async function getWord() {
  // GitHub works from anywhere; the LAN server only at home — and asking it
  // also nudges the PC to generate today's word if it hasn't yet.
  for (const source of [fromGitHub, fromLan]) {
    try {
      const word = await source();
      fm.writeString(CACHE, JSON.stringify(word));
      return { word, offline: false };
    } catch (e) {
      // try the next source
    }
  }
  if (fm.fileExists(CACHE)) {
    return { word: JSON.parse(fm.readString(CACHE)), offline: true };
  }
  return { word: null, offline: true };
}

function serif(size, bold) {
  return bold ? new Font("Georgia-Bold", size) : new Font("Georgia", size);
}

const { word, offline } = await getWord();
const widget = new ListWidget();
widget.backgroundColor = BG;
widget.url = SERVER; // tapping the widget opens the web app
widget.setPadding(14, 16, 14, 16);
// Ask iOS to refresh roughly hourly (it decides the exact timing).
widget.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000);

const family = config.widgetFamily || "medium";

if (!word) {
  widget.addSpacer();
  const t = widget.addText("客");
  t.font = serif(34, true);
  t.textColor = ACCENT;
  t.centerAlignText();
  const m = widget.addText("Can't reach the Hakka server yet — open the app on your PC once, then this widget will fill in.");
  m.font = Font.systemFont(11);
  m.textColor = MUTED;
  m.centerAlignText();
  widget.addSpacer();
} else if (family === "small") {
  const header = widget.addText("客家話" + (offline ? " ·" : ""));
  header.font = Font.systemFont(9);
  header.textColor = GOLD;
  widget.addSpacer();
  const hanzi = widget.addText(word.hanzi);
  hanzi.font = serif(34, true);
  hanzi.textColor = INK;
  hanzi.minimumScaleFactor = 0.5;
  hanzi.lineLimit = 1;
  const rom = widget.addText(word.romanization);
  rom.font = Font.italicSystemFont(14);
  rom.textColor = ACCENT;
  rom.lineLimit = 1;
  rom.minimumScaleFactor = 0.6;
  widget.addSpacer(3);
  const mean = widget.addText(word.meaning);
  mean.font = Font.systemFont(11);
  mean.textColor = MUTED;
  mean.lineLimit = 2;
  mean.minimumScaleFactor = 0.8;
  widget.addSpacer();
} else {
  // medium and large
  const header = widget.addText(
    "客家話 · word of the day" + (offline ? "  (cached)" : "")
  );
  header.font = Font.systemFont(9);
  header.textColor = GOLD;
  widget.addSpacer(6);

  const row = widget.addStack();
  row.centerAlignContent();
  const hanzi = row.addText(word.hanzi);
  hanzi.font = serif(family === "large" ? 44 : 38, true);
  hanzi.textColor = INK;
  hanzi.minimumScaleFactor = 0.5;
  hanzi.lineLimit = 1;
  row.addSpacer(12);

  const col = row.addStack();
  col.layoutVertically();
  const rom = col.addText(word.romanization);
  rom.font = Font.italicSystemFont(16);
  rom.textColor = ACCENT;
  rom.lineLimit = 1;
  rom.minimumScaleFactor = 0.6;
  const mean = col.addText(word.meaning);
  mean.font = Font.systemFont(12);
  mean.textColor = INK;
  mean.lineLimit = 2;
  const pron = col.addText("“" + (word.pronunciation || "") + "”");
  pron.font = Font.systemFont(10);
  pron.textColor = MUTED;
  pron.lineLimit = family === "large" ? 3 : 1;
  pron.minimumScaleFactor = 0.8;

  if (family === "large" && word.example) {
    widget.addSpacer(10);
    const exH = widget.addText(word.example.hakka);
    exH.font = serif(16, false);
    exH.textColor = INK;
    exH.lineLimit = 2;
    const exR = widget.addText(word.example.romanization);
    exR.font = Font.italicSystemFont(12);
    exR.textColor = ACCENT;
    exR.lineLimit = 2;
    const exE = widget.addText(word.example.english);
    exE.font = Font.systemFont(11);
    exE.textColor = MUTED;
    exE.lineLimit = 2;
  }
  widget.addSpacer();
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else if (family === "large") {
  await widget.presentLarge();
} else {
  await widget.presentMedium();
}
Script.complete();
