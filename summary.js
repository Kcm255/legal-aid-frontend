/**
 * summary.js — Populates the summary page from the real backend result JSON.
 * Handles: dynamic content rendering, real audio playback, real AI chat,
 * mic input, download/print, and all checklist interactions.
 */

// ── Inlined API helpers (no ES module import needed) ───────────────────────
var API_BASE = "";

var store = {
  set: function(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch(e) {} },
  get: function(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch(e) { return null; } }
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

function sendChatMessage(question, jobId, sessionId, language) {
  return fetch(API_BASE + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: question, job_id: jobId, session_id: sessionId, language: language })
  }).then(function(res) { return res.json().then(function(d) { if (!res.ok) throw new Error(d.error || "Chat error"); return d; }); });
}

function getAudioUrl(filename) {
  return API_BASE + "/api/audio/" + filename;
}


function initSummaryPage() {
  // ── Restore session ────────────────────────────────────────────────────────
  const jobId     = store.get("nm_job_id");
  const sessionId = store.get("nm_session_id");
  const language  = store.get("nm_language") || "hi";
  const filename  = store.get("nm_filename") || "document.pdf";

  if (!jobId || !sessionId) {
    window.location.href = "/index.html";
    return;
  }

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const filenameSpan = document.getElementById("summary-filename");
  const docTypeBadge = document.getElementById("doc-type-label");
  const docTitle     = document.getElementById("doc-title");
  const urgencyBadge = document.getElementById("urgency-badge");

  const whatItIs     = document.getElementById("what-it-is");
  const whatItMeans  = document.getElementById("what-it-means");
  const checklistWrap = document.getElementById("action-checklist");
  const checkCounter  = document.getElementById("checklist-counter");
  const datesBox     = document.getElementById("dates-box");
  const amountsBox   = document.getElementById("amounts-box");
  const legalSections = document.getElementById("legal-sections");
  const partiesList  = document.getElementById("parties-list");

  // Audio
  const audioEl        = document.getElementById("summary-audio");
  const playBtn        = document.getElementById("play-btn");
  const playIcon       = document.getElementById("play-icon");
  const audioProgress  = document.getElementById("audio-progress");
  const timeCurrent    = document.getElementById("time-current");
  const timeDuration   = document.getElementById("time-duration");
  const waveContainer  = document.getElementById("wave-container");
  const noAudioMsg     = document.getElementById("no-audio-msg");

  // Chat
  const chatBox      = document.getElementById("chat-box");
  const chatInput    = document.getElementById("chat-input");
  const chatForm     = document.querySelector(".chat-input-area");
  const micBtn       = document.querySelector(".btn-mic");
  const micIcon      = document.getElementById("mic-icon");

  // Download
  const downloadBtn  = document.getElementById("download-btn");

  // Loading overlay
  const loadingOverlay = document.getElementById("loading-overlay");

  // ── Show filename ───────────────────────────────────────────────────────────
  if (filenameSpan) filenameSpan.textContent = filename;

  // ── Helpline pill ──────────────────────────────────────────────────────────
  document.querySelectorAll(".helpline").forEach(pill => {
    pill.style.cursor = "pointer";
    pill.addEventListener("click", () => { window.location.href = "tel:15100"; });
  });

  // ── Dead nav items ─────────────────────────────────────────────────────────
  document.querySelectorAll(".nav-item").forEach(link => {
    link.addEventListener("click", e => {
      if (link.getAttribute("href") === "#") {
        e.preventDefault();
        showToast("Coming soon! यह सुविधा जल्द उपलब्ध होगी।");
      }
    });
  });

  // ── Guide button ───────────────────────────────────────────────────────────
  document.querySelectorAll(".guide-btn").forEach(btn =>
    btn.addEventListener("click", openGuideModal)
  );

  // ── Poll until done ────────────────────────────────────────────────────────
  let resultData = null;

  const initFromResult = (result) => {
    resultData = result;
    if (loadingOverlay) loadingOverlay.style.display = "none";
    populateSummary(result);
    setupAudio(result.audio_filename, result.audio_script);
    setupInitialChat();
  };

  // Try fast-path: check if already done
  pollJobStatus(jobId, (data) => {
    // Update loading overlay status while waiting
    if (loadingOverlay && data.status !== "done") {
      const msg = loadingOverlay.querySelector("#overlay-status");
      if (msg) msg.textContent = data.status_message || "Processing…";
    }
  }, 2000)
    .then((finalData) => {
      if (finalData.status === "done" && finalData.result) {
        initFromResult(finalData.result);
      } else if (finalData.status === "error") {
        showFatalError(finalData.error || "Processing failed.");
      }
    })
    .catch(err => {
      showFatalError("Could not connect to server: " + err.message);
    });

  // ── Populate summary ───────────────────────────────────────────────────────
  function populateSummary(r) {
    // Document type + title
    if (docTypeBadge) docTypeBadge.textContent = r.document_type || "Legal Document";
    if (docTitle) docTitle.textContent = r.document_type || "Legal Document Summary";

    // Urgency badge
    if (urgencyBadge) {
      const urgency = r.urgency || "low";
      const colors = { high: "#ba1a1a", medium: "#8d4b00", low: "#006b2c" };
      const labels = { high: "⚠️ Urgent Action Required", medium: "⚡ Action Needed", low: "✅ No Immediate Action" };
      urgencyBadge.textContent = labels[urgency] || labels["low"];
      urgencyBadge.style.color = colors[urgency] || colors["low"];
      urgencyBadge.style.background = colors[urgency]?.replace(")", ", 0.1)").replace("rgb", "rgba") || "rgba(0,107,44,0.1)";
      // Use opacity approach
      urgencyBadge.style.background = `${colors[urgency]}1a`; // hex with 10% opacity
    }

    // What it is
    if (whatItIs) {
      const text = r.summary?.what_it_is || "No summary available.";
      whatItIs.innerHTML = `<p style="font-size:15px;line-height:1.6;margin:0;">${escHtml(text)}</p>`;
    }

    // What it means — parse numbered points or plain text
    if (whatItMeans) {
      let rawMeaning = r.summary?.what_it_means || "";
      let lines = [];
      if (Array.isArray(rawMeaning)) {
        lines = rawMeaning;
      } else if (typeof rawMeaning === "string") {
        lines = rawMeaning.split(/\n|\. (?=\d)/).filter(Boolean);
      } else {
        lines = [String(rawMeaning)];
      }

      if (lines.length > 1) {
        whatItMeans.innerHTML = lines.map(line =>
          `<li style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px;">
            <span class="material-symbols-outlined primary-text">chevron_right</span>
            <p style="font-size:14px;margin:0;">${escHtml(line.trim().replace(/^\d+\.\s*/, ""))}</p>
          </li>`
        ).join("");
      } else {
        whatItMeans.innerHTML = `<li style="list-style:none;font-size:14px;">${escHtml(lines[0])}</li>`;
      }
    }

    // Action checklist — parse what_to_do
    if (checklistWrap) {
      let raw = r.summary?.what_to_do || [];
      let steps = [];
      if (Array.isArray(raw)) {
        steps = raw;
      } else if (typeof raw === "string") {
        steps = raw.split(/\n/).filter(s => s.trim()).map(s => s.replace(/^\d+\.\s*/, "").trim());
      }
      checklistWrap.innerHTML = "";

      if (steps.length === 0) {
        checklistWrap.innerHTML = `<p style="font-size:14px;color:var(--text-muted);">No specific actions required at this time.</p>`;
      } else {
        steps.forEach((step, i) => {
          const label = document.createElement("label");
          label.className = "checklist-item";
          label.innerHTML = `
            <input type="checkbox" />
            <div>
              <h3 style="font-size:14px;margin-bottom:2px;">${escHtml(step)}</h3>
            </div>
          `;
          label.querySelector("input").addEventListener("change", updateChecklistCounter);
          checklistWrap.appendChild(label);
        });
      }
      updateChecklistCounter();
    }

    // Dates — supports both new {label, value} objects and old plain strings
    if (datesBox) {
      const dates = r.extracted_dates || [];
      if (dates.length > 0) {
        const rows = dates.map(d => {
          const label = typeof d === 'string' ? 'Date' : (d.label || 'Date');
          const value = typeof d === 'string' ? d : (d.value || '');
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.05);">
              <span style="font-size:12px;font-weight:700;color:var(--primary);display:flex;align-items:center;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:15px;">calendar_month</span>${escHtml(label)}
              </span>
              <span style="font-size:13px;font-weight:600;color:var(--text-main);">${escHtml(value)}</span>
            </div>`;
        }).join('');
        datesBox.innerHTML = `
          <div class="section-heading primary-text">
            <span class="material-symbols-outlined">calendar_clock</span>
            <span style="font-size:16px;font-weight:700;">Important Dates</span>
          </div>
          <div style="margin-top:8px;">${rows}</div>
        `;
      }
    }

    // Amounts — supports both new {label, value} objects and old plain strings
    if (amountsBox) {
      const amounts = r.extracted_amounts || [];
      if (amounts.length > 0) {
        const rows = amounts.map(a => {
          const label = typeof a === 'string' ? 'Document Amount' : (a.label || 'Document Amount');
          const value = typeof a === 'string' ? a : (a.value || '');
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.05);">
              <span style="font-size:12px;font-weight:700;color:var(--tertiary);display:flex;align-items:center;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:15px;">currency_rupee</span>${escHtml(label)}
              </span>
              <span style="font-size:13px;font-weight:600;color:var(--tertiary);">${escHtml(value)}</span>
            </div>`;
        }).join('');
        amountsBox.innerHTML = `
          <div class="section-heading" style="color:var(--tertiary);">
            <span class="material-symbols-outlined">currency_rupee</span>
            <span style="font-size:16px;font-weight:700;">Monetary Amounts</span>
          </div>
          <div style="margin-top:8px;">${rows}</div>
        `;
      } else {
        amountsBox.innerHTML = `
          <div class="section-heading" style="color:var(--tertiary);">
            <span class="material-symbols-outlined">currency_rupee</span>
            <span style="font-size:16px;font-weight:700;">Monetary Amounts</span>
          </div>
          <p style="font-size:14px;color:var(--text-muted);margin:8px 0 0;">No monetary amounts found in this document.</p>
        `;
      }
    }

    // Legal sections
    if (legalSections) {
      const sections = r.legal_sections_referenced || [];
      if (sections.length > 0) {
        legalSections.innerHTML = sections.map(s =>
          `<span class="glass-pill" style="font-size:12px;font-weight:600;padding:4px 10px;">${escHtml(s)}</span>`
        ).join("");
      }
    }

    // Parties
    if (partiesList) {
      const parties = r.key_parties || [];
      if (parties.length > 0) {
        partiesList.innerHTML = parties.map(p =>
          `<span class="glass-pill" style="font-size:13px;padding:6px 12px;">${escHtml(p)}</span>`
        ).join("");
      }
    }
  }

  // ── Checklist counter ──────────────────────────────────────────────────────
  function updateChecklistCounter() {
    const boxes = checklistWrap?.querySelectorAll("input[type=checkbox]");
    if (!boxes || !checkCounter) return;
    const done = Array.from(boxes).filter(b => b.checked).length;
    checkCounter.textContent = `${done}/${boxes.length} Completed`;
  }
  // Make it globally available for inline onchange (in original HTML)
  window.updateCounter = updateChecklistCounter;

  // ── Audio setup ────────────────────────────────────────────────────────────
  // Generate waveform bars
  if (waveContainer) {
    for (let i = 0; i < 20; i++) {
      const bar = document.createElement("div");
      bar.style.cssText = `width:3px;background:var(--primary);border-radius:999px;height:${Math.random()*10+4}px;transition:height 0.2s ease;`;
      bar.className = "wave-bar";
      waveContainer.appendChild(bar);
    }
  }

  let waveInterval = null;
  let browserSpeechText = "";
  let browserSpeechActive = false;

  function setupAudio(audioFilename, audioScript) {
    if (!audioFilename || !audioEl) {
      if (noAudioMsg) noAudioMsg.style.display = "block";
      if (playBtn) playBtn.disabled = true;
      return;
    }

    // Windows SAPI may use an English voice and skip Devanagari, speaking only
    // numbers. Use the browser's language voice for Hindi/Marathi narration.
    if (audioScript && language !== "en" && "speechSynthesis" in window) {
      browserSpeechText = audioScript;
      audioEl.removeAttribute("src");
      audioEl.load();
      if (timeCurrent) timeCurrent.textContent = "00:00";
      if (timeDuration) timeDuration.textContent = "--:--";
      return;
    }

    audioEl.src = getAudioUrl(audioFilename);
    audioEl.load();

    audioEl.addEventListener("timeupdate", () => {
      if (!audioEl.duration) return;
      const pct = (audioEl.currentTime / audioEl.duration) * 100;
      if (audioProgress) audioProgress.style.width = pct + "%";
      if (timeCurrent) timeCurrent.textContent = fmtTime(audioEl.currentTime);
    });

    audioEl.addEventListener("loadedmetadata", () => {
      if (timeDuration) timeDuration.textContent = fmtTime(audioEl.duration);
    });

    audioEl.addEventListener("ended", () => {
      if (playIcon) playIcon.textContent = "play_arrow";
      stopWave();
    });
  }

  function stopWave() {
    clearInterval(waveInterval);
    document.querySelectorAll(".wave-bar").forEach(b => b.style.height = "4px");
  }

  // toggle audio — called inline from HTML or via play btn
  window.toggleAudio = () => {
    if (browserSpeechText) {
      if (browserSpeechActive) {
        window.speechSynthesis.cancel();
        browserSpeechActive = false;
        if (playIcon) playIcon.textContent = "play_arrow";
        stopWave();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(browserSpeechText);
      utterance.lang = language === "hi" ? "hi-IN" : "mr-IN";
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.lang.toLowerCase().startsWith(utterance.lang.slice(0, 2)));
      if (voice) utterance.voice = voice;
      utterance.onstart = () => {
        browserSpeechActive = true;
        if (playIcon) playIcon.textContent = "pause";
        waveInterval = setInterval(() => {
          document.querySelectorAll(".wave-bar").forEach(b =>
            b.style.height = `${Math.random() * 14 + 4}px`
          );
        }, 250);
      };
      utterance.onend = utterance.onerror = () => {
        browserSpeechActive = false;
        if (playIcon) playIcon.textContent = "play_arrow";
        stopWave();
      };
      window.speechSynthesis.speak(utterance);
      return;
    }

    if (!audioEl || !audioEl.src) {
      showToast("Audio not available for this document.");
      return;
    }
    if (audioEl.paused) {
      audioEl.play();
      if (playIcon) playIcon.textContent = "pause";
      waveInterval = setInterval(() => {
        document.querySelectorAll(".wave-bar").forEach(b =>
          b.style.height = `${Math.random() * 14 + 4}px`
        );
      }, 250);
    } else {
      audioEl.pause();
      if (playIcon) playIcon.textContent = "play_arrow";
      stopWave();
    }
  };

  // ── Chat ───────────────────────────────────────────────────────────────────
  function setupInitialChat() {
    const welcome = document.createElement("div");
    welcome.className = "bubble bubble-bot";
    welcome.textContent = language === "hi"
      ? "नमस्ते। मैं इस दस्तावेज़ का सहायक हूँ। आप हिंदी या अंग्रेजी में कोई भी सवाल पूछ सकते हैं।"
      : "Hello! I am your document assistant. Ask me anything about this notice in English or Hindi.";
    if (chatBox) { chatBox.innerHTML = ""; chatBox.appendChild(welcome); }
  }

  async function submitChat(question) {
    if (!question.trim()) return;
    if (!chatBox) return;

    // User bubble
    const userMsg = document.createElement("div");
    userMsg.className = "bubble bubble-user";
    userMsg.textContent = question;
    chatBox.appendChild(userMsg);
    chatBox.scrollTop = chatBox.scrollHeight;
    if (chatInput) chatInput.value = "";

    // Typing indicator
    const typing = document.createElement("div");
    typing.className = "bubble bubble-bot";
    typing.innerHTML = `<span style="opacity:0.6;">Thinking… <span class="material-symbols-outlined animate-spin" style="font-size:14px;vertical-align:middle;">progress_activity</span></span>`;
    chatBox.appendChild(typing);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
      const resp = await sendChatMessage(question, jobId, sessionId, language);
      typing.innerHTML = `${renderChatMarkdown(resp.answer)}<div style="font-size:11px;margin-top:8px;color:var(--text-muted);">✓ Grounded in Document</div>`;
    } catch (err) {
      typing.innerHTML = `<span style="color:#ba1a1a;">⚠️ ${escHtml(err.message || "Server error. Please try again.")}</span>`;
    }
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // Chat form submit
  if (chatForm) {
    chatForm.addEventListener("submit", e => {
      e.preventDefault();
      submitChat(chatInput?.value || "");
    });
  }

  // Preset chips — globally accessible
  window.askPreset = (text) => {
    if (chatInput) chatInput.value = text;
    submitChat(text);
  };

  // Mic button — Web Speech API
  window.simulateMic = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      showToast("Microphone input not supported in this browser.");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.lang = language === "hi" ? "hi-IN" : language === "mr" ? "mr-IN" : "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    if (micIcon) micIcon.style.color = "#ba1a1a";
    showToast("🎤 Listening… speak now");

    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      if (chatInput) chatInput.value = transcript;
      if (micIcon) micIcon.style.color = "";
    };
    rec.onerror = () => {
      if (micIcon) micIcon.style.color = "";
      showToast("Microphone error. Please try again.");
    };
    rec.onend = () => {
      if (micIcon) micIcon.style.color = "";
    };
    rec.start();
  };

  // ── Download PDF ───────────────────────────────────────────────────────────
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      showToast("Opening print dialog to save as PDF…");
      setTimeout(() => window.print(), 500);
    });
  }

  // ── Handle chat submit (globally) ─────────────────────────────────────────
  window.handleChatSubmit = (e) => {
    e.preventDefault();
    submitChat(chatInput?.value || "");
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSummaryPage, { once: true });
} else {
  initSummaryPage();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(sec) {
  if (!isFinite(sec)) return "00:00";
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Render the limited markdown produced by the assistant without allowing HTML through.
function renderChatMarkdown(text) {
  const lines = escHtml(text || "").split(/\r?\n/);
  let html = "", list = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  const inline = value => value
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  lines.forEach(line => {
    const value = line.trim();
    if (!value) { closeList(); return; }
    const match = value.match(/^(\d+[.)]\s+|[-*]\s+)(.*)$/);
    if (match) {
      const type = /^\d/.test(match[1]) ? "ol" : "ul";
      if (list !== type) { closeList(); html += `<${type}>`; list = type; }
      html += `<li>${inline(match[2])}</li>`;
    } else { closeList(); html += `<p>${inline(value)}</p>`; }
  });
  closeList();
  return `<div class="chat-markdown">${html}</div>`;
}

function showToast(message, isError = false) {
  const t = document.createElement("div");
  t.style.cssText = `
    position:fixed;bottom:32px;left:50%;transform:translateX(-50%);
    background:${isError ? "#ba1a1a" : "var(--primary)"};color:white;
    padding:14px 24px;border-radius:999px;font-size:14px;font-weight:600;
    z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.2);
    font-family:var(--font-body);max-width:90vw;text-align:center;
  `;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function showFatalError(message) {
  const main = document.querySelector("main");
  if (!main) return;
  main.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;gap:16px;text-align:center;">
      <span class="material-symbols-outlined" style="font-size:48px;color:#ba1a1a;">error</span>
      <h2>Processing Failed</h2>
      <p style="color:var(--text-muted);max-width:400px;">${escHtml(message)}</p>
      <button onclick="window.location.href='/index.html'"
        style="background:var(--primary);color:white;border:none;padding:12px 28px;border-radius:14px;font-weight:700;cursor:pointer;font-family:var(--font-body);font-size:15px;">
        ← Upload Another Document
      </button>
    </div>
  `;
}

function openGuideModal() {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);
    backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:24px;
  `;
  overlay.innerHTML = `
    <div style="background:white;border-radius:24px;max-width:480px;width:100%;padding:32px;position:relative;">
      <button id="gclose" style="position:absolute;top:16px;right:16px;background:rgba(0,0,0,0.05);border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
        <span class="material-symbols-outlined">close</span>
      </button>
      <h2 style="margin:0 0 16px;">How to Use / उपयोग गाइड</h2>
      <ol style="padding-left:20px;font-size:14px;line-height:2;">
        <li>The document summary is shown on the left panel</li>
        <li>Press ▶ to listen to the audio summary</li>
        <li>Use the checkboxes to track required action steps</li>
        <li>Ask any question about the document in the chatbox</li>
        <li>Call NALSA 15100 for free legal representation</li>
      </ol>
      <button onclick="window.location.href='tel:15100'" style="margin-top:20px;width:100%;padding:14px;background:var(--primary);color:white;border:none;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;font-family:var(--font-body);display:flex;align-items:center;justify-content:center;gap:8px;">
        <span class="material-symbols-outlined">call</span>
        Call NALSA: 15100
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector("#gclose").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
}
