/**
 * api.js — Shared API utilities for Nyaya Mitra frontend.
 * All calls go to the Flask backend at API_BASE.
 */

// Empty string = use Vite's proxy (/api/* → http://localhost:5000)
// Change to "http://localhost:5000" if not using the Vite dev server
export const API_BASE = "";

async function readResponse(res, fallbackMessage) {
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json()
    : null;
  if (!res.ok) {
    throw new Error(data?.error || `${fallbackMessage}: ${res.status}`);
  }
  return data;
}

// ─── Session ──────────────────────────────────────────────────────────────────

/**
 * Create a new session or resume an existing one.
 * @param {string} language - "en" | "hi" | "mr"
 * @param {string|null} existingSessionId - Pass to resume
 * @returns {Promise<{session_id: string, language: string, resumed: boolean}>}
 */
export async function createOrResumeSession(language = "hi", existingSessionId = null) {
  const body = { language };
  if (existingSessionId) body.session_id = existingSessionId;

  const res = await fetch(`${API_BASE}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readResponse(res, "Session error");
}

// ─── Upload ───────────────────────────────────────────────────────────────────

/**
 * Upload a document for processing.
 * @param {File} file - The document file
 * @param {string} sessionId
 * @param {string} language - "en" | "hi" | "mr"
 * @returns {Promise<{job_id: string, status: string, filename: string, message: string}>}
 */
export async function uploadDocument(file, sessionId, language = "hi") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("session_id", sessionId);
  formData.append("language", language);

  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: formData,
  });

  return readResponse(res, "Upload failed");
}

// ─── Status polling ───────────────────────────────────────────────────────────

/**
 * Get the current status of a processing job.
 * @param {string} jobId
 * @returns {Promise<{job_id, status, status_message, filename, language, result?, error?}>}
 */
export async function getJobStatus(jobId) {
  const res = await fetch(`${API_BASE}/api/status/${jobId}`);
  return readResponse(res, "Status check failed");
}

/**
 * Poll job status until it reaches "done" or "error".
 * @param {string} jobId
 * @param {function} onUpdate - Called on each poll with the status object
 * @param {number} intervalMs - Polling interval (default 2000ms)
 * @returns {Promise<object>} - Final status object when done/error
 */
export function pollJobStatus(jobId, onUpdate, intervalMs = 2000) {
  return new Promise((resolve, reject) => {
    const TERMINAL = ["done", "error"];
    const poll = async () => {
      try {
        const data = await getJobStatus(jobId);
        onUpdate(data);
        if (TERMINAL.includes(data.status)) {
          resolve(data);
        } else {
          setTimeout(poll, intervalMs);
        }
      } catch (err) {
        reject(err);
      }
    };
    poll();
  });
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

/**
 * Send a follow-up question grounded on the document.
 * @param {string} question
 * @param {string} jobId
 * @param {string} sessionId
 * @param {string} language
 * @returns {Promise<{answer: string, question: string}>}
 */
export async function sendChatMessage(question, jobId, sessionId, language = "hi") {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, job_id: jobId, session_id: sessionId, language }),
  });

  return readResponse(res, "Chat error");
}

// ─── Audio ────────────────────────────────────────────────────────────────────

/**
 * Build the URL for a generated audio file.
 * @param {string} filename
 * @returns {string} Full URL to the audio file
 */
export function getAudioUrl(filename) {
  return `${API_BASE}/api/audio/${filename}`;
}

// ─── Session storage helpers ──────────────────────────────────────────────────

export const store = {
  set(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
  get(key) {
    try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; }
  },
  clear() {
    ["nm_session_id", "nm_job_id", "nm_language", "nm_filename"].forEach(k =>
      sessionStorage.removeItem(k)
    );
  },
};

// ─── Language helpers ─────────────────────────────────────────────────────────

export const LANG_NAMES = {
  en: "English",
  hi: "Hindi",
  mr: "Marathi",
};

export const LANG_LABELS = {
  en: "EN · Audio + Text",
  hi: "हिंदी (Hindi) · Audio + Text",
  mr: "मराठी (Marathi) · Audio + Text",
};
