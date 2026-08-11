// Hakka Word of the Day — local server (optional home companion).
// Zero dependencies. Word generation lives in generate.js, which the
// GitHub Actions workflow also runs daily in the cloud — so this server
// is only needed for browsing at home / generating extra words on demand.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const { loadWords, todayStr, generateWord } = require("./generate");

const PORT = 3456;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");

// ---------------------------------------------------------------------------
// GitHub sync — pull before generating (the cloud workflow commits words
// too), push after. Silently does nothing without an "origin" remote.

function git(args) {
  return new Promise((resolve) => {
    const c = spawn("git", args, { cwd: ROOT, windowsHide: true });
    let err = "";
    c.stderr.on("data", (d) => (err += d));
    c.on("error", () => resolve({ code: -1, err: "git not found" }));
    c.on("close", (code) => resolve({ code, err }));
  });
}

async function hasRemote() {
  return (await git(["remote", "get-url", "origin"])).code === 0;
}

async function pullFromGitHub() {
  if (!(await hasRemote())) return;
  const pull = await git(["pull", "--rebase", "origin", "main"]);
  if (pull.code !== 0) {
    console.error(`git pull failed: ${pull.err.slice(0, 300)}`);
  }
}

async function pushToGitHub() {
  if (!(await hasRemote())) return;
  await git(["add", "data/words.json", "data/latest.json"]);
  const commit = await git(["commit", "-m", "Add new word"]);
  if (commit.code !== 0) return; // nothing new to commit
  await git(["pull", "--rebase", "origin", "main"]);
  const push = await git(["push"]);
  if (push.code !== 0) {
    console.error(`git push failed: ${push.err.slice(0, 300)}`);
  } else {
    console.log("pushed new word to GitHub");
  }
}

// ---------------------------------------------------------------------------
// generation wrapper: one at a time, with a daily cap as a backstop so a
// misbehaving device on the LAN can't burn through Claude subscription usage.

const DAILY_GENERATION_CAP = 30;
let inFlight = null;

async function generate() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    await pullFromGitHub();
    const generatedToday = loadWords().filter((w) => w.date === todayStr()).length;
    if (generatedToday >= DAILY_GENERATION_CAP) {
      throw new Error(
        `Daily limit of ${DAILY_GENERATION_CAP} generated words reached — try again tomorrow.`
      );
    }
    const { entry } = await generateWord();
    pushToGitHub().catch((err) =>
      console.error(`GitHub sync failed: ${err.message}`)
    );
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
      const today = loadWords().filter((w) => w.date === todayStr());
      if (today.length > 0) {
        sendJson(res, 200, { word: today[today.length - 1], fresh: false });
      } else {
        const word = await generate();
        sendJson(res, 200, { word, fresh: true });
      }
      return;
    }

    if (url.pathname === "/api/new" && req.method === "POST") {
      const word = await generate();
      sendJson(res, 200, { word, fresh: true });
      return;
    }

    // Fast path for the iPhone widget when it can't reach GitHub: answers
    // immediately with the most recent word, never waits on generation.
    if (url.pathname === "/api/latest" && req.method === "GET") {
      const words = loadWords();
      const latest = words[words.length - 1] || null;
      if (!latest) {
        sendJson(res, 404, { error: "No words yet — open the app once first." });
      } else {
        sendJson(res, 200, { word: latest, today: latest.date === todayStr() });
      }
      return;
    }

    if (url.pathname === "/api/history" && req.method === "GET") {
      sendJson(res, 200, { words: [...loadWords()].reverse() });
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

server.listen(PORT, () => {
  console.log(`Hakka Word of the Day → http://localhost:${PORT}`);
  // Catch up on any words the cloud workflow generated while this PC was off.
  pullFromGitHub();
});
