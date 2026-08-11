// Hakka word generation core — used by server.js locally and by the
// GitHub Actions workflow (.github/workflows/daily-word.yml) in the cloud.
//
// Run directly:  node generate.js          → generate today's word if missing
//                node generate.js --force  → always generate one more word
//
// Auth: the Claude Code CLI uses your local login on the PC, or the
// CLAUDE_CODE_OAUTH_TOKEN env var (from `claude setup-token`) in CI.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const WORDS_FILE = path.join(DATA_DIR, "words.json");

// Sonnet keeps generation snappy; override with HAKKA_CLAUDE_MODEL.
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

function resolveClaude() {
  if (process.env.HAKKA_CLAUDE_PATH) return process.env.HAKKA_CLAUDE_PATH;
  const winDefault = path.join(os.homedir(), ".local", "bin", "claude.exe");
  if (process.platform === "win32" && fs.existsSync(winDefault)) {
    return winDefault;
  }
  return "claude"; // rely on PATH (GitHub Actions runner, etc.)
}

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
    const exe = resolveClaude();
    const env = { ...process.env };
    // The CLI refuses to start if it thinks it's nested inside another
    // Claude Code session (e.g. when this was launched from one).
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    const child = spawn(exe, ["-p", "--output-format", "json", "--model", CLAUDE_MODEL, "--strict-mcp-config"], {
      env,
      cwd: ROOT,
      windowsHide: true,
      shell: process.platform === "win32" && !exe.endsWith(".exe"),
    });

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
      reject(new Error(`Could not start Claude CLI (${exe}): ${err.message}`));
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

async function generateWord() {
  const words = loadWords();
  const word = await runClaude(buildPrompt(words));
  const entry = {
    date: todayStr(),
    generatedAt: new Date().toISOString(),
    ...word,
  };
  // Guard against a duplicate slipping through anyway.
  const fresh = loadWords();
  if (fresh.some((w) => w.hanzi === entry.hanzi)) {
    return { entry, added: false };
  }
  fresh.push(entry);
  saveWords(fresh);
  return { entry, added: true };
}

module.exports = { loadWords, saveWords, todayStr, generateWord };

if (require.main === module) {
  const force = process.argv.includes("--force");
  (async () => {
    if (!force && loadWords().some((w) => w.date === todayStr())) {
      console.log("Today's word already exists — nothing to do.");
      return;
    }
    const { entry, added } = await generateWord();
    if (added) {
      console.log(`Generated: ${entry.hanzi} (${entry.romanization}) — ${entry.meaning}`);
    } else {
      console.log(`Model returned an already-known word (${entry.hanzi}); nothing saved.`);
      process.exitCode = 1;
    }
  })().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
