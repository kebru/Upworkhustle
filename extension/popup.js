const extractBtn = document.getElementById("extractBtn");
const feedBtn = document.getElementById("feedBtn");
const statusEl = document.getElementById("status");
const jobCountEl = document.getElementById("jobCount");
const serverUrlInput = document.getElementById("serverUrl");

const STORAGE_KEY = "upwork_eval_server_url";

chrome.storage?.local?.get(STORAGE_KEY, (data) => {
  if (data[STORAGE_KEY]) serverUrlInput.value = data[STORAGE_KEY];
});

serverUrlInput.addEventListener("change", () => {
  chrome.storage?.local?.set({ [STORAGE_KEY]: serverUrlInput.value });
});

function getServerUrl() {
  return serverUrlInput.value.replace(/\/+$/, "");
}

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = "status " + type;
}

function showJobCount(n) {
  jobCountEl.textContent = `${n} Job${n !== 1 ? "s" : ""} gefunden`;
  jobCountEl.className = "job-count visible";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function executeInTab(tabId, file) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    files: [file],
    world: "ISOLATED",
  });
  return results[0]?.result;
}

extractBtn.addEventListener("click", async () => {
  extractBtn.disabled = true;
  feedBtn.disabled = true;
  showStatus("Extrahiere...", "info");

  try {
    const tab = await getActiveTab();
    if (!tab?.url?.includes("upwork.com")) {
      showStatus("Bitte eine Upwork-Seite öffnen.", "err");
      return;
    }

    const data = await executeInTab(tab.id, "extract-job.js");
    if (!data?.jobText || data.charCount < 50) {
      showStatus("Kein Job-Text gefunden. Bist du auf einer Job-Detailseite?", "err");
      return;
    }

    showJobCount(1);
    showStatus("Öffne App...", "info");

    const param = encodeURIComponent(data.jobText);
    chrome.tabs.create({ url: `${getServerUrl()}?autoEval=${param}` });
    showStatus("Gesendet!", "ok");
  } catch (err) {
    showStatus(err.message || "Fehler beim Extrahieren.", "err");
  } finally {
    extractBtn.disabled = false;
    feedBtn.disabled = false;
  }
});

feedBtn.addEventListener("click", async () => {
  extractBtn.disabled = true;
  feedBtn.disabled = true;
  showStatus("Extrahiere Feed...", "info");

  try {
    const tab = await getActiveTab();
    if (!tab?.url?.includes("upwork.com")) {
      showStatus("Bitte eine Upwork-Seite öffnen.", "err");
      return;
    }

    const data = await executeInTab(tab.id, "extract-feed.js");
    if (!data?.jobs?.length) {
      showStatus("Keine Jobs im Feed gefunden. Bist du auf der Search/Feed-Seite?", "err");
      return;
    }

    showJobCount(data.count);
    showStatus("Öffne App...", "info");

    const jobText = data.jobs.map((j) => j.jobText).join("\n---JOBSPLIT---\n");
    const param = encodeURIComponent(jobText);

    // URL length limit ~2MB in Chrome, but use POST fallback for large payloads
    if (param.length > 50000) {
      // Store in extension storage, open app, app fetches via message
      await chrome.storage.local.set({ pendingJobs: jobText });
      chrome.tabs.create({ url: `${getServerUrl()}?autoEvalPending=1` });
    } else {
      chrome.tabs.create({ url: `${getServerUrl()}?autoEval=${param}` });
    }

    showStatus(`${data.count} Jobs gesendet!`, "ok");
  } catch (err) {
    showStatus(err.message || "Fehler beim Extrahieren.", "err");
  } finally {
    extractBtn.disabled = false;
    feedBtn.disabled = false;
  }
});
