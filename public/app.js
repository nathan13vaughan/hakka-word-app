const $ = (id) => document.getElementById(id);

const LOADING_MESSAGES = [
  "Choosing today's word…",
  "Consulting the Hakka dictionary…",
  "Checking the tone marks…",
  "Writing an example sentence…",
  "Almost there…",
];

let loadingTimer = null;

function show(state) {
  $("loading").classList.toggle("hidden", state !== "loading");
  $("error").classList.toggle("hidden", state !== "error");
  $("wordCard").classList.toggle("hidden", state !== "word");

  clearInterval(loadingTimer);
  if (state === "loading") {
    let i = 0;
    $("loadingMsg").textContent = LOADING_MESSAGES[0];
    loadingTimer = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      $("loadingMsg").textContent = LOADING_MESSAGES[i];
    }, 9000);
  }
}

function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function renderWord(w) {
  $("wordDate").textContent = w.date;
  $("wordPos").textContent = w.pos || "word";
  $("wordHanzi").textContent = w.hanzi || "";
  $("wordRoman").textContent = w.romanization || "";
  $("wordPron").textContent = w.pronunciation || "";
  $("wordMeaning").textContent = w.meaning || "";
  $("exHakka").textContent = w.example?.hakka || "";
  $("exRoman").textContent = w.example?.romanization || "";
  $("exEnglish").textContent = w.example?.english || "";
  $("wordMandarin").textContent = w.mandarin || "—";
  $("wordNote").textContent = w.note || "—";
  show("word");
}

async function loadHistory() {
  try {
    const res = await fetch("/api/history");
    const { words } = await res.json();
    $("historyCount").textContent = words.length ? `· ${words.length}` : "";
    const list = $("historyList");
    list.innerHTML = "";
    for (const w of words) {
      const li = document.createElement("li");
      li.className = "history-item";
      const mk = (cls, text) => {
        const s = document.createElement("span");
        s.className = cls;
        s.textContent = text;
        return s;
      };
      li.append(
        mk("hi-hanzi", w.hanzi),
        mk("hi-roman", w.romanization),
        mk("hi-meaning", w.meaning),
        mk("hi-date", w.date)
      );
      li.addEventListener("click", () => {
        renderWord(w);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      li.style.cursor = "pointer";
      list.append(li);
    }
  } catch {
    /* history is non-critical */
  }
}

async function fetchWord(url, options) {
  show("loading");
  try {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    renderWord(data.word);
    loadHistory();
  } catch (err) {
    $("errorMsg").textContent = err.message;
    show("error");
  }
}

$("newWordBtn").addEventListener("click", () => {
  fetchWord("/api/new", { method: "POST" });
});

$("retryBtn").addEventListener("click", () => {
  fetchWord("/api/today");
});

const now = new Date();
$("todayDate").textContent = now.toLocaleDateString(undefined, {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

fetchWord("/api/today");
loadHistory();
