// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: language;

// ── Hakka Word of the Day · home-screen widget ─────────────────────────
// Shows the latest word, fetched from GitHub (works anywhere) with the
// home PC server as fallback, and an on-device cache so it never goes
// blank. Tapping the widget opens the web app.
//
// Setup: install "Scriptable" from the App Store, create a new script,
// paste this file in, then add a Scriptable widget to your home screen
// and point it at this script.

const SERVER = "http://192.168.50.46:3456"; // your PC on your home Wi-Fi

// GitHub source — works from anywhere, even with the PC asleep.
const GITHUB = {
  user: "nathan13vaughan",
  repo: "hakka-word-app",
  branch: "main",
};

// Tapping the widget opens the GitHub Pages app.
const PAGES_URL = `https://${GITHUB.user}.github.io/${GITHUB.repo}/`;

// Palette (light, dark) — matches the web app.
const BG = Color.dynamic(new Color("#f6f1e7"), new Color("#171412"));
const CARD = Color.dynamic(new Color("#fffdf8"), new Color("#221d18"));
const LINE = Color.dynamic(new Color("#e5dcc9"), new Color("#383028"));
const INK = Color.dynamic(new Color("#2b2620"), new Color("#ece5d8"));
const ACCENT = Color.dynamic(new Color("#b3382c"), new Color("#e05a48"));
const ACCENT_SOFT = Color.dynamic(new Color("#f3ded9"), new Color("#3a2622"));
const MUTED = Color.dynamic(new Color("#7a6f5f"), new Color("#a2968a"));
const GOLD = Color.dynamic(new Color("#a9812e"), new Color("#d1a94f"));
const SEAL_TEXT = new Color("#fff8f0");

const fm = FileManager.local();
const CACHE = fm.joinPath(fm.documentsDirectory(), "hakka-word-cache.json");

async function fromGitHub() {
  const req = new Request(
    `https://raw.githubusercontent.com/${GITHUB.user}/${GITHUB.repo}/${GITHUB.branch}/data/latest.json`
  );
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

function prettyDate(iso) {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${d} ${M[m - 1]}`;
  } catch {
    return iso || "";
  }
}

// Adds one horizontally-centered element to a vertical container.
function addCentered(parent, build) {
  const row = parent.addStack();
  row.addSpacer();
  build(row);
  row.addSpacer();
}

const { word, offline } = await getWord();
const widget = new ListWidget();
widget.backgroundColor = BG;
widget.url = PAGES_URL;
// Ask iOS to refresh roughly hourly (it decides the exact timing).
widget.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000);

const family = config.widgetFamily || "large";
const isBig = family === "large" || family === "extraLarge";
widget.setPadding(isBig ? 16 : 14, 16, isBig ? 14 : 14, 16);

if (!word) {
  widget.addSpacer();
  addCentered(widget, (r) => {
    const t = r.addText("客");
    t.font = serif(34, true);
    t.textColor = ACCENT;
  });
  addCentered(widget, (r) => {
    const m = r.addText("No word yet — open the app once, then this widget will fill in.");
    m.font = Font.systemFont(11);
    m.textColor = MUTED;
    m.centerAlignText();
  });
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
} else if (!isBig) {
  // medium
  const header = widget.addText(
    "客家話 · word of the day" + (offline ? "  (cached)" : "")
  );
  header.font = Font.systemFont(9);
  header.textColor = GOLD;
  widget.addSpacer(6);

  const row = widget.addStack();
  row.centerAlignContent();
  const hanzi = row.addText(word.hanzi);
  hanzi.font = serif(38, true);
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
  pron.lineLimit = 1;
  pron.minimumScaleFactor = 0.8;
  widget.addSpacer();
} else {
  // ── large / extraLarge: the full daily-word card ──────────────────

  // Header: seal · brand · date
  const header = widget.addStack();
  header.centerAlignContent();
  const seal = header.addStack();
  seal.backgroundColor = ACCENT;
  seal.cornerRadius = 6;
  seal.setPadding(2, 6, 3, 6);
  const sealTxt = seal.addText("客");
  sealTxt.font = serif(13, true);
  sealTxt.textColor = SEAL_TEXT;
  header.addSpacer(7);
  const brand = header.addText("HAKKA · WORD OF THE DAY");
  brand.font = Font.mediumSystemFont(10);
  brand.textColor = GOLD;
  header.addSpacer();
  const dateTxt = header.addText(
    prettyDate(word.date) + (offline ? " · cached" : "")
  );
  dateTxt.font = Font.systemFont(10);
  dateTxt.textColor = MUTED;

  widget.addSpacer();

  // Hero: the word itself
  addCentered(widget, (r) => {
    const hanzi = r.addText(word.hanzi);
    hanzi.font = serif(52, true);
    hanzi.textColor = INK;
    hanzi.lineLimit = 1;
    hanzi.minimumScaleFactor = 0.45;
  });
  widget.addSpacer(2);
  addCentered(widget, (r) => {
    const rom = r.addText(word.romanization);
    rom.font = Font.italicSystemFont(20);
    rom.textColor = ACCENT;
    rom.lineLimit = 1;
    rom.minimumScaleFactor = 0.6;
  });
  if (word.pronunciation) {
    widget.addSpacer(3);
    addCentered(widget, (r) => {
      const pron = r.addText("“" + word.pronunciation + "”");
      pron.font = Font.systemFont(11);
      pron.textColor = MUTED;
      pron.lineLimit = 2;
      pron.minimumScaleFactor = 0.8;
      pron.centerAlignText();
    });
  }

  widget.addSpacer(7);

  // Part-of-speech chip + meaning
  addCentered(widget, (r) => {
    r.centerAlignContent();
    if (word.pos) {
      const chip = r.addStack();
      chip.backgroundColor = ACCENT_SOFT;
      chip.cornerRadius = 8;
      chip.setPadding(2, 7, 2, 7);
      const chipTxt = chip.addText(word.pos.toUpperCase());
      chipTxt.font = Font.mediumSystemFont(8.5);
      chipTxt.textColor = ACCENT;
      chipTxt.lineLimit = 1;
      chipTxt.minimumScaleFactor = 0.7;
      r.addSpacer(7);
    }
    const mean = r.addText(word.meaning || "");
    mean.font = Font.mediumSystemFont(15);
    mean.textColor = INK;
    mean.lineLimit = 1;
    mean.minimumScaleFactor = 0.6;
  });

  widget.addSpacer();

  // Example sentence card
  if (word.example && word.example.hakka) {
    const card = widget.addStack();
    card.layoutVertically();
    card.backgroundColor = CARD;
    card.cornerRadius = 12;
    card.borderColor = LINE;
    card.borderWidth = 1;
    card.setPadding(9, 12, 10, 12);

    const label = card.addText("例句 · EXAMPLE");
    label.font = Font.mediumSystemFont(8.5);
    label.textColor = GOLD;
    card.addSpacer(4);

    const exH = card.addText(word.example.hakka);
    exH.font = serif(17, false);
    exH.textColor = INK;
    exH.lineLimit = 2;
    exH.minimumScaleFactor = 0.7;

    const exR = card.addText(word.example.romanization || "");
    exR.font = Font.italicSystemFont(12);
    exR.textColor = ACCENT;
    exR.lineLimit = 2;
    exR.minimumScaleFactor = 0.8;

    card.addSpacer(3);
    const exE = card.addText(word.example.english || "");
    exE.font = Font.systemFont(11);
    exE.textColor = MUTED;
    exE.lineLimit = 2;

    widget.addSpacer(7);
  }

  // Cultural note
  if (word.note) {
    const note = widget.addText(word.note);
    note.font = Font.italicSystemFont(10.5);
    note.textColor = MUTED;
    note.lineLimit = family === "extraLarge" ? 4 : 2;
    note.minimumScaleFactor = 0.9;
    widget.addSpacer(7);
  }

  // Footer: Mandarin equivalent
  if (word.mandarin) {
    const footer = widget.addStack();
    footer.centerAlignContent();
    const fLabel = footer.addText("普通話");
    fLabel.font = Font.mediumSystemFont(9);
    fLabel.textColor = GOLD;
    footer.addSpacer(6);
    const fVal = footer.addText(word.mandarin);
    fVal.font = Font.systemFont(11);
    fVal.textColor = MUTED;
    fVal.lineLimit = 1;
    fVal.minimumScaleFactor = 0.7;
    footer.addSpacer();
  }
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else if (isBig) {
  await widget.presentLarge();
} else if (family === "small") {
  await widget.presentSmall();
} else {
  await widget.presentMedium();
}
Script.complete();
