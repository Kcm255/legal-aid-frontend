/**
 * processing.js — Real-time job status polling from the Flask backend.
 * Maps backend statuses to the 5-step processing checklist UI.
 */

// ── Inlined API helpers (no ES module import needed) ───────────────────────
var API_BASE = "";

var store = {
  set: function(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch(e) {} },
  get: function(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch(e) { return null; } }
};

var LANG_LABELS = {
  en: "EN · Audio + Text",
  hi: "हिंदी (Hindi) · Audio + Text",
  mr: "मराठी (Marathi) · Audio + Text"
};

function getJobStatus(jobId) {
  return fetch(API_BASE + "/api/status/" + jobId)
    .then(function(res) { return res.json().then(function(d) { if (!res.ok) throw new Error(d.error || "Status error"); return d; }); });
}

function pollJobStatus(jobId, onUpdate, intervalMs) {
  intervalMs = intervalMs || 2000;
  return new Promise(function(resolve, reject) {
    var TERMINAL = ["done", "error"];
    function poll() {
      getJobStatus(jobId).then(function(data) {
        onUpdate(data);
        if (TERMINAL.indexOf(data.status) !== -1) { resolve(data); }
        else { setTimeout(poll, intervalMs); }
      }).catch(reject);
    }
    poll();
  });
}


function initProcessingPage() {
  const progressBar     = document.getElementById("progress-bar-fill");
  const progressPercent = document.getElementById("progress-percent");
  const fastForwardBtn  = document.getElementById("fast-forward-btn");
  const audioPreviewBtn = document.getElementById("audio-preview-btn");
  const statusLabel     = document.getElementById("status-label");
  const etaLabel        = document.getElementById("eta-label");

  // Dynamic badges
  const filenameBadge = document.getElementById("badge-filename");
  const langBadge     = document.getElementById("badge-lang");

  // Checklist nodes & content
  const checkNodes    = document.querySelectorAll(".check-node");
  const stepBadge     = document.getElementById("step-badge-count");

  // ── Restore session data ────────────────────────────────────────────────────
  const jobId    = store.get("nm_job_id");
  const language = store.get("nm_language") || "hi";
  const filename = store.get("nm_filename") || "document.pdf";

  // Populate dynamic badges
  if (filenameBadge) filenameBadge.textContent = filename;
  if (langBadge) langBadge.textContent = LANG_LABELS[language] || LANG_LABELS["hi"];

  // If no job_id, redirect home
  if (!jobId) {
    window.location.href = "/index.html";
    return;
  }

  // ── Status → step mapping ───────────────────────────────────────────────────
  const STATUS_STEP = {
    pending:            1,
    extracting:         1,
    ocr:                1,
    retrieving_context: 2,
    generating_summary: 3,
    generating_audio:   4,
    done:               5,
    error:              5,
  };

  const STATUS_PROGRESS = {
    pending:            8,
    extracting:         20,
    ocr:                25,
    retrieving_context: 40,
    generating_summary: 65,
    generating_audio:   85,
    done:               100,
    error:              100,
  };

  const STEP_LABELS = {
    pending:            "Waiting to start…",
    extracting:         "Extracting text & stamps…",
    ocr:                "Running OCR on document…",
    retrieving_context: "Retrieving legal context…",
    generating_summary: "Generating AI summary…",
    generating_audio:   "Creating audio narration…",
    done:               "Analysis complete!",
    error:              "Processing failed.",
  };

  const ETA_LABELS = {
    pending:            "Starting soon…",
    extracting:         "Estimated: ~20 sec remaining",
    ocr:                "Estimated: ~18 sec remaining",
    retrieving_context: "Estimated: ~15 sec remaining",
    generating_summary: "Estimated: ~10 sec remaining",
    generating_audio:   "Estimated: ~5 sec remaining",
    done:               "Complete!",
    error:              "",
  };

  // ── Update progress UI ──────────────────────────────────────────────────────
  function updateProgress(status) {
    const pct = STATUS_PROGRESS[status] || 10;
    progressBar.style.width = pct + "%";
    progressPercent.textContent = pct + "%";
    if (statusLabel) statusLabel.textContent = STEP_LABELS[status] || status;
    if (etaLabel) etaLabel.textContent = ETA_LABELS[status] || "";
  }

  // ── Update checklist ────────────────────────────────────────────────────────
  function updateChecklist(status) {
    const activeStep = STATUS_STEP[status] || 1;
    if (stepBadge) stepBadge.textContent = `Step ${Math.min(activeStep, 5)}`;

    checkNodes.forEach((node, i) => {
      const step = i + 1; // steps are 1-indexed
      const item = node.closest(".check-item");
      // Remove all state classes
      node.classList.remove("node-done", "node-active", "node-pending");
      const spinner = node.querySelector(".node-spinner");
      if (item) item.style.opacity = "1";

      if (step < activeStep) {
        node.classList.add("node-done");
        node.innerHTML = `<span class="material-symbols-outlined">check</span>`;
      } else if (step === activeStep && status !== "done" && status !== "error") {
        node.classList.add("node-active");
        node.innerHTML = `<span class="material-symbols-outlined animate-spin">autorenew</span>`;
      } else if (step > activeStep) {
        node.classList.add("node-pending");
        if (item) item.style.opacity = "0.6";
      } else if (status === "done") {
        node.classList.add("node-done");
        node.innerHTML = `<span class="material-symbols-outlined">check</span>`;
      }
    });

    // Step 3 active ticker text
    const ticker = document.getElementById("active-ticker");
    if (ticker) {
      const tickerMessages = {
        extracting:         "Reading text from document…",
        ocr:                "Running OCR on scanned image…",
        retrieving_context: "Searching legal knowledge base…",
        generating_summary: "Translating terminology…",
        generating_audio:   "Synthesizing Hindi audio voice…",
      };
      ticker.textContent = tickerMessages[status] || "Processing…";
    }
  }

  // ── Main polling logic ──────────────────────────────────────────────────────
  let navigating = false;

  const onUpdate = (data) => {
    if (navigating) return;
    updateProgress(data.status);
    updateChecklist(data.status);

    if (data.status === "done") {
      navigating = true;
      setTimeout(() => {
        window.location.href = "/summary.html";
      }, 800);
    } else if (data.status === "error") {
      navigating = true;
      showError(data.error || "Processing failed. Please try uploading again.");
    }
  };

  // Start polling
  updateProgress("pending");
  updateChecklist("pending");

  pollJobStatus(jobId, onUpdate, 2000).catch(err => {
    console.error("Polling error:", err);
    showError("Lost connection to server. Please check your connection.");
  });

  // ── Fast-forward / Skip button ───────────────────────────────────────────────
  if (fastForwardBtn) {
    fastForwardBtn.addEventListener("click", () => {
      if (navigating) return;
      navigating = true;
      progressBar.style.width = "100%";
      progressPercent.textContent = "100%";
      setTimeout(() => {
        window.location.href = "/summary.html";
      }, 300);
    });
  }

  // ── Audio Preview button → speech synthesis ──────────────────────────────────
  if (audioPreviewBtn) {
    audioPreviewBtn.addEventListener("click", () => {
      if (!("speechSynthesis" in window)) {
        showToast("Audio preview not supported on this browser.");
        return;
      }
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(
        "Your document is being analyzed. Please wait while we generate a plain language summary."
      );
      utter.lang = language === "hi" ? "hi-IN" : language === "mr" ? "mr-IN" : "en-IN";
      utter.rate = 0.9;
      window.speechSynthesis.speak(utter);
      showToast("🔊 Audio preview playing…");
    });
  }

  // ── Helpline pill ──────────────────────────────────────────────────────────
  const helplinePill = document.querySelector(".helpline");
  if (helplinePill) {
    helplinePill.style.cursor = "pointer";
    helplinePill.addEventListener("click", () => { window.location.href = "tel:15100"; });
  }

  // ── Guide button ──────────────────────────────────────────────────────────
  const guideBtn = document.querySelector(".guide-btn");
  if (guideBtn) guideBtn.addEventListener("click", openGuideModal);

  // ── Dead nav items ────────────────────────────────────────────────────────
  document.querySelectorAll(".nav-item").forEach(link => {
    link.addEventListener("click", e => {
      if (link.getAttribute("href") === "#") {
        e.preventDefault();
        showToast("Coming soon! यह सुविधा जल्द उपलब्ध होगी।");
      }
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initProcessingPage, { once: true });
} else {
  initProcessingPage();
}

// ── Error UI ─────────────────────────────────────────────────────────────────
function showError(message) {
  const centerpiece = document.querySelector(".centerpiece");
  if (!centerpiece) { alert(message); return; }

  const errBox = document.createElement("div");
  errBox.style.cssText = `
    background: rgba(186,26,26,0.08); border: 1px solid rgba(186,26,26,0.2);
    border-radius: 16px; padding: 24px; text-align: center;
    color: #ba1a1a; margin-top: 16px;
  `;
  errBox.innerHTML = `
    <span class="material-symbols-outlined" style="font-size: 32px;">error</span>
    <h3 style="margin: 8px 0 4px;">Processing Failed</h3>
    <p style="font-size: 14px; margin-bottom: 16px;">${message}</p>
    <button onclick="window.location.href='/index.html'"
      style="background: #ba1a1a; color: white; border: none; padding: 10px 24px;
             border-radius: 12px; font-weight: 700; cursor: pointer; font-family: var(--font-body);">
      ← Try Again
    </button>
  `;
  centerpiece.appendChild(errBox);
}

// ── Toast ────────────────────────────────────────────────────────────────────
function showToast(message) {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
    background: var(--primary); color: white;
    padding: 14px 24px; border-radius: 999px; font-size: 14px; font-weight: 600;
    z-index: 9999; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    font-family: var(--font-body); max-width: 90vw; text-align: center;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ── Guide Modal ──────────────────────────────────────────────────────────────
function openGuideModal() {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);
    backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:24px;
  `;
  overlay.innerHTML = `
    <div style="background:white;border-radius:24px;max-width:480px;width:100%;padding:32px;position:relative;">
      <button id="gclose" style="position:absolute;top:16px;right:16px;background:rgba(0,0,0,0.05);border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;">
        <span class="material-symbols-outlined">close</span>
      </button>
      <h2 style="margin:0 0 16px;">How to Use / उपयोग गाइड</h2>
      <ol style="padding-left:20px;font-size:14px;line-height:1.8;">
        <li>Upload your legal notice (PDF or photo)</li>
        <li>Choose your preferred language</li>
        <li>Click "Analyze Document" and wait ~20 seconds</li>
        <li>Listen to the audio summary and ask questions</li>
        <li>Call NALSA 15100 for free legal help</li>
      </ol>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector("#gclose").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
}
