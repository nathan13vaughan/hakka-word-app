// Hakka Word of the Day — local server
// Zero dependencies. Generates words by running the Claude Code CLI headlessly,
// using your existing Claude login (no API key required).

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const PORT = 3456;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const WORDS_FILE = path.join(DATA_DIR, "words.json");

const CLAUDE_EXE =
  process.env.HAKKA_CLAUDE_PATH ||
  path.join(os.homedir(), ".local", "bin", "claude.exe");

// Sonnet keeps generation snappy for on-demand words; override with
// HAKKA_CLAUDE_MODEL=opus (or any model alias) if you prefer.
const CLAUDE_MODEL = process.env.HAKKA_CLAUDE_MODEL || "sonnet";

const GENERATION_TIMEOUT_MS = 4 * 60 * 1000;

// Rotating themes keep the daily words varied instead of drifting toward
// the same handful of common words.
const TOPICS = [
  "greetings and everyday politeness",
  "family members and relatives",
  "food and cooking",
  "fruits and vegetables",
  "drinks and tea culture",
  "numbers, counting and money",
  "time, days and seasons",
  "weather and nature",
  "animals",
  "the body and health",
  "emotions and feelings",
  "the home and household objects",
  "clothing",
  "colors and shapes",
  "school and learning",
  "work and occupations",
  "travel and directions",
  "the market and shopping",
  "farming and the countryside",
  "festivals and traditions",
  "verbs of daily routine (eat, sleep, wash...)",
  "useful adjectives (big, small, fast...)",
  "question words and pronouns",
  "common expressions and interjections",
  "friendship and socializing",
  "music and leisure",
  "transportation",
  "the town and buildings",
  "kitchen utensils and tableware",
  "plants, trees and flowers",
];

// ---------------------------------------------------------------------------
// storage

function loadWords() {
  try {
    return JSON.parse(fs.readFileSync(WORDS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveWords(words) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(WORDS_FILE, JSON.stringify(words, null, 2), "utf8");
  // Small single-word file the iPhone widget fetches from GitHub.
  fs.writeFileSync(
    path.join(DATA_DIR, "latest.json"),
    JSON.stringify(words[words.length - 1] ?? null, null, 2),
    "utf8"
  );
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// word generation via the Claude Code CLI (headless)

function buildPrompt(previousWords) {
  const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  const avoid = previousWords.map((w) => w.hanzi).filter(Boolean);

  return `You are an expert teacher of Hakka Chinese (客家話), Sixian (四縣) dialect as spoken in Taiwan.

Generate ONE genuinely common, useful Hakka vocabulary word for a beginner-to-intermediate learner.

Today's theme: ${topic}. Choose a word related to that theme.
${avoid.length ? `\nThe learner already knows these words — do NOT pick any of them:\n${avoid.join("、")}\n` : ""}
Requirements:
- "hanzi": the word written in Chinese characters as used in Hakka.
- "romanization": Pha̍k-fa-sṳ (PFS) romanization with proper tone diacritics.
- "pronunciation": a rough plain-English pronunciation guide a learner can read aloud.
- "pos": part of speech (noun, verb, adjective...).
- "meaning": a concise English definition.
- "mandarin": the Mandarin equivalent, as "characters (pinyin)".
- "example": a short, natural example sentence using the word. The "hakka" field must be written in Chinese characters (not romanization), with PFS romanization in the "romanization" field and an English translation.
- "note": ONE short, interesting usage or cultural note (max 2 sentences).

Be accurate about Hakka specifically — do not give Mandarin readings as if they were Hakka.

Respond with ONLY this JSON object — no markdown fences, no extra text:
{
  "hanzi": "...",
  "romanization": "...",
  "pronunciation": "...",
  "pos": "...",
  "meaning": "...",
  "mandarin": "...",
  "example": { "hakka": "...", "romanization": "...", "english": "..." },
  "note": "..."
}`;
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model output");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(CLAUDE_EXE)) {
      reject(
        new Error(
          `Claude CLI not found at ${CLAUDE_EXE}. Set HAKKA_CLAUDE_PATH to your claude executable.`
        )
      );
      return;
    }

    const env = { ...process.env };
    // The CLI refuses to start if it thinks it's nested inside another
    // Claude Code session (e.g. when this server was launched from one).
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    const child = spawn(
      CLAUDE_EXE,
      [
        "-p",
        "--output-format", "json",
        "--model", CLAUDE_MODEL,
        // Text-only generation: skip connecting to any configured MCP
        // servers so the CLI starts faster.
        "--strict-mcp-config",
      ],
      {
        env,
        cwd: ROOT,
        windowsHide: true,
      }
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      child.kill();
      reject(new Error("Claude generation timed out"));
    }, GENERATION_TIMEOUT_MS);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        // --output-format json wraps the reply in a result envelope.
        // The CLI can exit nonzero while still writing the envelope, so
        // parse stdout before falling back to the exit code.
        const envelope = JSON.parse(stdout);
        if (envelope.is_error) {
          const msg = String(envelope.result || "Unknown Claude CLI error");
          if (/authenticat|oauth|401/i.test(msg)) {
            reject(
              new Error(
                "Claude login has expired. Open a terminal, run `claude`, and log in when prompted — then try again."
              )
            );
          } else {
            reject(new Error(msg.slice(0, 500)));
          }
          return;
        }
        const text = envelope.result ?? stdout;
        resolve(extractJson(text));
      } catch {
        // Fall back to scraping JSON straight out of stdout.
        try {
          resolve(extractJson(stdout));
        } catch {
          if (code !== 0) {
            reject(
              new Error(
                `claude exited with code ${code}: ${(stderr || stdout).slice(0, 500)}`
              )
            );
          } else {
            reject(new Error("Could not parse model output"));
          }
        }
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// GitHub sync — pushes the word data after each generation so the iPhone
// widget can fetch it from anywhere. Silently does nothing until this folder
// has an "origin" remote configured.

function git(args) {
  return new Promise((resolve) => {
    const c = spawn("git", args, { cwd: ROOT, windowsHide: true });
    let err = "";
    c.stderr.on("data", (d) => (err += d));
    c.on("error", () => resolve({ code: -1, err: "git not found" }));
    c.on("close", (code) => resolve({ code, err }));
  });
}

async function pushToGitHub() {
  const remote = await git(["remote", "get-url", "origin"]);
  if (remote.code !== 0) return; // no GitHub remote yet
  await git(["add", "data/words.json", "data/latest.json"]);
  const commit = await git(["commit", "-m", "Add new word"]);
  if (commit.code !== 0) return; // nothing new to commit
  const push = await git(["push"]);
  if (push.code !== 0) {
    console.error(`git push failed: ${push.err.slice(0, 300)}`);
  } else {
    console.log("pushed new word to GitHub");
  }
}

let inFlight = null; // only one generation at a time
let lastAutoAttempt = 0; // throttle widget-triggered background generation

// Backstop so a misbehaving device on the LAN (or a runaway loop) can't
// burn through Claude subscription usage — far above normal daily use.
const DAILY_GENERATION_CAP = 30;

async function generateWord() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const words = loadWords();
    const generatedToday = words.filter((w) => w.date === todayStr()).length;
    if (generatedToday >= DAILY_GENERATION_CAP) {
      throw new Error(
        `Daily limit of ${DAILY_GENERATION_CAP} generated words reached — try again tomorrow.`
      );
    }
    const word = await runClaude(buildPrompt(words));
    const entry = {
      date: todayStr(),
      generatedAt: new Date().toISOString(),
      ...word,
    };
    // Guard against a duplicate slipping through anyway.
    const fresh = loadWords();
    if (!fresh.some((w) => w.hanzi === entry.hanzi)) {
      fresh.push(entry);
      saveWords(fresh);
      pushToGitHub().catch((err) =>
        console.error(`GitHub sync failed: ${err.message}`)
      );
    }
    return entry;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

// ---------------------------------------------------------------------------
// http server

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function serveStatic(res, urlPath) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = path.resolve(PUBLIC_DIR, rel);
  // Trailing separator so a sibling like "public-x" can't slip past the check.
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (url.pathname === "/api/today" && req.method === "GET") {
      const words = loadWords();
      const today = words.filter((w) => w.date === todayStr());
      if (today.length > 0) {
        sendJson(res, 200, { word: today[today.length - 1], fresh: false });
      } else {
        const word = await generateWord();
        sendJson(res, 200, { word, fresh: true });
      }
      return;
    }

    // Fast path for the iPhone widget: always answers immediately with the
    // most recent word. If today's word doesn't exist yet, generation is
    // kicked off in the background (throttled) so a later widget refresh
    // picks it up — the widget itself never waits on Claude.
    if (url.pathname === "/api/latest" && req.method === "GET") {
      const words = loadWords();
      const latest = words[words.length - 1] || null;
      const isToday = latest?.date === todayStr();
      if (!isToday && !inFlight && Date.now() - lastAutoAttempt > 10 * 60 * 1000) {
        lastAutoAttempt = Date.now();
        generateWord().catch((err) =>
          console.error(`background generation failed: ${err.message}`)
        );
      }
      if (!latest) {
        sendJson(res, 404, { error: "No words yet — open the app once first." });
      } else {
        sendJson(res, 200, { word: latest, today: isToday });
      }
      return;
    }

    if (url.pathname === "/api/new" && req.method === "POST") {
      const word = await generateWord();
      sendJson(res, 200, { word, fresh: true });
      return;
    }

    if (url.pathname === "/api/history" && req.method === "GET") {
      const words = loadWords();
      sendJson(res, 200, { words: [...words].reverse() });
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(res, 404, { error: "Unknown endpoint" });
      return;
    }

    serveStatic(res, url.pathname);
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

// While the server is running, generate each day's word automatically in the
// morning (and push it to GitHub) so the widget updates without any visit.
const AUTO_GENERATE_HOUR = 7;
setInterval(() => {
  if (new Date().getHours() < AUTO_GENERATE_HOUR) return;
  if (inFlight) return;
  if (loadWords().some((w) => w.date === todayStr())) return;
  console.log("auto-generating today's word…");
  generateWord().catch((err) =>
    console.error(`daily auto-generation failed: ${err.message}`)
  );
}, 15 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`Hakka Word of the Day → http://localhost:${PORT}`);
  console.log(`Claude CLI: ${CLAUDE_EXE}`);
});
