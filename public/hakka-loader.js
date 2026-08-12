// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: language;

// ── Hakka Word · self-updating loader ──────────────────────────────────
// Paste THIS into Scriptable (one time). On every widget refresh it
// downloads the latest widget code from your GitHub repo and runs it —
// so both the daily word and the widget design stay current on their
// own. Offline, it runs the last downloaded copy instead.

const SRC =
  "https://raw.githubusercontent.com/nathan13vaughan/hakka-word-app/main/public/hakka-widget.js";

const fm = FileManager.local();
const CODE_CACHE = fm.joinPath(fm.documentsDirectory(), "hakka-widget-code.js");

let code = null;
try {
  const req = new Request(SRC);
  req.timeoutInterval = 8;
  const fresh = await req.loadString();
  if (!fresh || !fresh.includes("ListWidget")) throw new Error("bad download");
  code = fresh;
  fm.writeString(CODE_CACHE, fresh);
} catch (e) {
  if (fm.fileExists(CODE_CACHE)) code = fm.readString(CODE_CACHE);
}

if (!code) {
  // First run with no internet and no cached copy yet.
  const w = new ListWidget();
  w.backgroundColor = new Color("#f6f1e7");
  const t = w.addText("客");
  t.font = new Font("Georgia-Bold", 30);
  t.textColor = new Color("#b3382c");
  t.centerAlignText();
  const m = w.addText("Couldn't download the widget — run once with internet.");
  m.font = Font.systemFont(11);
  m.textColor = new Color("#7a6f5f");
  m.centerAlignText();
  if (config.runsInWidget) Script.setWidget(w);
  else await w.presentMedium();
  Script.complete();
} else {
  // Run the downloaded widget code (async wrapper allows its top-level await).
  await eval("(async () => {\n" + code + "\n})()");
}
