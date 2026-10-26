/**
 * main.js — Nyaya Mitra index page.
 * Self-contained (no ES module imports) so it works with or without Vite.
 * All API calls are inlined here for reliability.
 */

// ── API base — empty string uses Vite proxy; set to http://localhost:5000 for direct ──
var API_BASE = "";

// ── Session storage helpers ─────────────────────────────────────────────────
var store = {
  set: function(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch(e) {}
  },
  get: function(key) {
    try { return JSON.parse(sessionStorage.getItem(key)); } catch(e) { return null; }
  },
  clear: function() {
    ["nm_session_id","nm_job_id","nm_language","nm_filename"].forEach(function(k) {
      sessionStorage.removeItem(k);
    });
  }
};

// ── API helpers ─────────────────────────────────────────────────────────────
async function apiCreateSession(language, existingId) {
  var body = { language: language };
  if (existingId) body.session_id = existingId;
  var res = await fetch(API_BASE + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  var data = await res.json();
  if (!res.ok) throw new Error(data.error || "Session error: " + res.status);
  return data;
}

async function apiUpload(file, sessionId, language) {
  var form = new FormData();
  form.append("file", file);
  form.append("session_id", sessionId);
  form.append("language", language);
  var res = await fetch(API_BASE + "/api/upload", { method: "POST", body: form });
  var data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload error: " + res.status);
  return data;
}

// ── Toast & Error helpers (defined early so they work everywhere) ────────────
function showToast(message, isError) {
  var toast = document.createElement("div");
  toast.style.cssText = "position:fixed;bottom:32px;left:50%;transform:translateX(-50%);" +
    "background:" + (isError ? "#ba1a1a" : "var(--primary,#8d4b00)") + ";" +
    "color:white;padding:14px 24px;border-radius:999px;font-size:14px;font-weight:600;" +
    "z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.2);font-family:var(--font-body,sans-serif);" +
    "max-width:90vw;text-align:center;";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function() { if (toast.parentNode) toast.remove(); }, 4000);
}

function showError(message) {
  showToast("⚠️ " + message, true);
}

// ── Main page init ───────────────────────────────────────────────────────────
function initMainPage() {
  console.log("[NyayaMitra] initMainPage() called");

  // DOM refs
  var langNavBtns   = document.querySelectorAll(".lang-nav-btn");
  var dropZone      = document.getElementById("drop-zone");
  var emptyState    = document.getElementById("empty-state");
  var selectedState = document.getElementById("selected-state");
  var loadSampleBtn = document.getElementById("load-sample-btn");
  var resetBtn      = document.getElementById("reset-btn");
  var analyzeBtn    = document.getElementById("analyze-btn");
  var filenameTxt   = document.getElementById("selected-filename");
  var fileMetaTxt   = document.getElementById("selected-meta");
  var fileInput     = document.getElementById("file-input");
  var guideBtn      = document.querySelector(".guide-btn");
  var helplinePill  = document.querySelector(".helpline");

  console.log("[NyayaMitra] DOM elements:", {
    dropZone: !!dropZone, emptyState: !!emptyState,
    fileInput: !!fileInput, analyzeBtn: !!analyzeBtn
  });

  // State
  var selectedFile = null;
  var activeLanguage = "hi";

  // ── Language buttons ────────────────────────────────────────────────────────
  langNavBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      langNavBtns.forEach(function(b) { b.classList.remove("active"); });
      btn.classList.add("active");
      activeLanguage = btn.getAttribute("data-lang") || "hi";
      console.log("[NyayaMitra] Language set to:", activeLanguage);
    });
  });

  // ── Guide button ────────────────────────────────────────────────────────────
  if (guideBtn) {
    guideBtn.addEventListener("click", function() { openGuideModal(); });
  }

  // ── Helpline pill ───────────────────────────────────────────────────────────
  if (helplinePill) {
    helplinePill.style.cursor = "pointer";
    helplinePill.addEventListener("click", function() {
      window.location.href = "tel:15100";
    });
  }

  // ── Nav links → toast ───────────────────────────────────────────────────────
  document.querySelectorAll(".nav-item").forEach(function(link) {
    link.addEventListener("click", function(e) {
      if (link.getAttribute("href") === "#") {
        e.preventDefault();
        showToast("Coming soon! यह सुविधा जल्द उपलब्ध होगी।");
      }
    });
  });

  // ── setFileState: shows selected file UI ────────────────────────────────────
  function setFileState(file) {
    console.log("[NyayaMitra] setFileState called:", file.name);
    selectedFile = file;

    if (emptyState)    emptyState.classList.add("hidden");
    if (selectedState) selectedState.classList.remove("hidden");
    if (resetBtn)      resetBtn.classList.remove("hidden");

    if (filenameTxt) filenameTxt.textContent = file.name;
    if (fileMetaTxt) {
      var mb = (file.size / (1024 * 1024)).toFixed(1);
      fileMetaTxt.textContent = mb + " MB · Ready for analysis";
    }

    if (analyzeBtn) {
      analyzeBtn.removeAttribute("disabled");
      analyzeBtn.classList.remove("glass-btn-disabled");
      analyzeBtn.classList.add("glass-btn-active");
      var icon = analyzeBtn.querySelector(".material-symbols-outlined");
      if (icon) icon.textContent = "document_scanner";
    }
  }

  // ── clearFileState: resets to empty UI ─────────────────────────────────────
  function clearFileState() {
    selectedFile = null;
    if (emptyState)    emptyState.classList.remove("hidden");
    if (selectedState) selectedState.classList.add("hidden");
    if (resetBtn)      resetBtn.classList.add("hidden");

    if (analyzeBtn) {
      analyzeBtn.setAttribute("disabled", "true");
      analyzeBtn.classList.add("glass-btn-disabled");
      analyzeBtn.classList.remove("glass-btn-active");
      var icon = analyzeBtn.querySelector(".material-symbols-outlined");
      if (icon) icon.textContent = "auto_read_pause";
    }
  }

  // ── File input change ───────────────────────────────────────────────────────
  if (fileInput) {
    fileInput.addEventListener("change", function(e) {
      var file = e.target.files && e.target.files[0];
      console.log("[NyayaMitra] File input change:", file ? file.name : "none");
      if (file) {
        setFileState(file);
      }
      // Allow re-selecting same file
      fileInput.value = "";
    });
  } else {
    console.error("[NyayaMitra] #file-input element not found in DOM!");
  }

  // ── Drop zone click → open file picker ──────────────────────────────────────
  if (dropZone && fileInput) {
    dropZone.addEventListener("click", function(e) {
      var tag = (e.target.tagName || "").toUpperCase();
      var id  = e.target.id || "";

      // Let the label handle itself natively (it already links to #file-input)
      if (tag === "LABEL" || id === "browse-label-btn") return;
      // Let sample button handle itself
      if (id === "load-sample-btn" || (e.target.closest && e.target.closest("#load-sample-btn"))) return;
      // Let span inside browse label pass through
      if (e.target.closest && e.target.closest("#browse-label-btn")) return;

      if (!emptyState || !emptyState.classList.contains("hidden")) {
        e.preventDefault();
        fileInput.click();
      }
    });

    dropZone.addEventListener("dragover", function(e) {
      e.preventDefault();
      dropZone.style.borderColor = "var(--primary,#8d4b00)";
      dropZone.style.background  = "rgba(255,220,195,0.2)";
    });
    dropZone.addEventListener("dragleave", function() {
      dropZone.style.borderColor = "";
      dropZone.style.background  = "";
    });
    dropZone.addEventListener("drop", function(e) {
      e.preventDefault();
      dropZone.style.borderColor = "";
      dropZone.style.background  = "";
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) setFileState(file);
    });
  }

  // ── Sample notice button ────────────────────────────────────────────────────
  if (loadSampleBtn) {
    loadSampleBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      loadSampleBtn.disabled = true;
      loadSampleBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> Loading...';

      var sampleText = "BANK LOAN DEFAULT NOTICE\nDate: 1st September 2024\n\nTo,\nShri Ramesh Kumar\nVillage: Nandgaon, Tehsil: Raipur\nDistrict: Chhattisgarh - 492001\n\nSubject: Notice of Default on Loan Account No. LN-2021-00452\n\nDear Shri Ramesh Kumar,\n\nThis is to inform you that your loan account bearing number LN-2021-00452 is in default.\nThe outstanding amount is Rs. 1,45,000/- (One Lakh Forty-Five Thousand Rupees).\n\nYou are required to pay the outstanding amount within 30 days of receipt of this notice,\nfailing which the bank will be constrained to initiate legal proceedings under Section 138\nof the Negotiable Instruments Act and the SARFAESI Act, 2002.\n\nPlease contact our branch at the earliest to discuss repayment options.\n\nFor Bank of Rural India,\nBranch Manager\nRaipur Branch";

      var blob = new Blob([sampleText], { type: "text/plain" });
      var sampleFile = new File([blob], "bank_loan_default_notice_sample.txt", { type: "text/plain" });
      setFileState(sampleFile);

      loadSampleBtn.disabled = false;
      loadSampleBtn.innerHTML = '<span class="material-symbols-outlined">file_open</span> Test with Sample Notice';
    });
  }

  // ── Reset button ────────────────────────────────────────────────────────────
  if (resetBtn) {
    resetBtn.addEventListener("click", clearFileState);
  }

  // ── Analyze button → upload flow ────────────────────────────────────────────
  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", async function() {
      if (analyzeBtn.hasAttribute("disabled") || !selectedFile) {
        console.log("[NyayaMitra] Analyze clicked but disabled or no file");
        return;
      }

      console.log("[NyayaMitra] Analyze clicked, uploading:", selectedFile.name);

      // Show loading
      analyzeBtn.setAttribute("disabled", "true");
      analyzeBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">progress_activity</span><span>Uploading & Analyzing...</span>';

      try {
        // 1. Create / resume session
        var existingId = store.get("nm_session_id");
        console.log("[NyayaMitra] Creating session, lang:", activeLanguage);
        var session = await apiCreateSession(activeLanguage, existingId);
        console.log("[NyayaMitra] Session created:", session.session_id);
        store.set("nm_session_id", session.session_id);
        store.set("nm_language", activeLanguage);

        // 2. Upload document
        console.log("[NyayaMitra] Uploading document...");
        var upload = await apiUpload(selectedFile, session.session_id, activeLanguage);
        console.log("[NyayaMitra] Upload done, job_id:", upload.job_id);
        store.set("nm_job_id", upload.job_id);
        store.set("nm_filename", selectedFile.name);

        // 3. Navigate to processing page
        window.location.href = "/processing.html";

      } catch(err) {
        console.error("[NyayaMitra] Upload error:", err);
        showError(err.message || "Upload failed. Please try again.");
        // Restore button
        analyzeBtn.removeAttribute("disabled");
        analyzeBtn.classList.remove("glass-btn-disabled");
        analyzeBtn.classList.add("glass-btn-active");
        analyzeBtn.innerHTML =
          '<span class="material-symbols-outlined">document_scanner</span>' +
          '<span>Analyze Document</span>' +
          '<span class="material-symbols-outlined arrow">arrow_forward</span>';
      }
    });
  }

  // ── Info cards → toast ──────────────────────────────────────────────────────
  document.querySelectorAll(".info-card.interactive-card").forEach(function(card, i) {
    card.style.cursor = "pointer";
    card.addEventListener("click", function() {
      var msgs = [
        "Take a clear photo in daylight. Make sure seals are visible!",
        "Upload your document above and click 'Analyze Document' to hear the summary.",
        "Call NALSA on 15100 to connect to a free paralegal."
      ];
      showToast(msgs[i] || "");
    });
  });

  console.log("[NyayaMitra] initMainPage() complete — all listeners attached");
}

// ── Boot ─────────────────────────────────────────────────────────────────────
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMainPage);
} else {
  initMainPage();
}

// ── Guide Modal ──────────────────────────────────────────────────────────────
function openGuideModal() {
  var overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);" +
    "backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:24px;";

  overlay.innerHTML = '<div style="background:white;border-radius:24px;max-width:520px;width:100%;padding:32px;position:relative;box-shadow:0 24px 60px rgba(0,0,0,0.2);">' +
    '<button id="guide-close" style="position:absolute;top:16px;right:16px;background:rgba(0,0,0,0.05);border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;">' +
    '<span class="material-symbols-outlined">close</span></button>' +
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">' +
    '<span class="material-symbols-outlined" style="font-size:36px;color:var(--primary);">record_voice_over</span>' +
    '<div><h2 style="font-size:20px;margin:0;">How to Use Nyaya Mitra</h2>' +
    '<p style="font-size:13px;color:var(--text-muted);margin:4px 0 0;">न्याय मित्र उपयोग गाइड</p></div></div>' +
    '<ol style="padding-left:20px;display:flex;flex-direction:column;gap:16px;">' +
    '<li><strong>Upload your legal notice</strong> — Take a photo or scan it as PDF/JPG/PNG<br>' +
    '<span style="font-size:13px;color:var(--text-muted);">अपना कानूनी नोटिस अपलोड करें — फोटो, PDF या PNG</span></li>' +
    '<li><strong>Choose your language</strong> — EN for English, हिं for Hindi, म for Marathi<br>' +
    '<span style="font-size:13px;color:var(--text-muted);">अपनी भाषा चुनें — EN, हिं, या म</span></li>' +
    '<li><strong>Click "Analyze Document"</strong> — AI will extract and explain the notice<br>' +
    '<span style="font-size:13px;color:var(--text-muted);">"Analyze Document" दबाएं — AI दस्तावेज़ समझाएगा</span></li>' +
    '<li><strong>Listen &amp; Ask questions</strong> — Audio summary plays automatically<br>' +
    '<span style="font-size:13px;color:var(--text-muted);">सुनें और सवाल पूछें — चैट में कोई भी प्रश्न करें</span></li>' +
    '<li><strong>Need a lawyer? Call NALSA 15100</strong> — Free legal aid helpline<br>' +
    '<span style="font-size:13px;color:var(--text-muted);">वकील चाहिए? NALSA 15100 पर कॉल करें</span></li>' +
    '</ol>' +
    '<button onclick="window.location.href=\'tel:15100\'" style="margin-top:24px;width:100%;padding:14px;background:var(--primary);color:white;border:none;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:var(--font-body);">' +
    '<span class="material-symbols-outlined">call</span>Call NALSA Helpline: 15100</button>' +
    '</div>';

  document.body.appendChild(overlay);
  overlay.querySelector("#guide-close").addEventListener("click", function() { overlay.remove(); });
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
}
