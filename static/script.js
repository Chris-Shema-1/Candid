// ── Auth guard ─────────────────────────────────────────────────────────────
// Hide body immediately — shown only after token is confirmed present
document.body.style.visibility = "hidden";

const token = localStorage.getItem("cms_token");
if (!token) {
  window.location.replace("/login");
} else {
  document.body.style.visibility = "visible";
}

// ── Authed fetch helper ────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (res.status === 401) {
    localStorage.removeItem("cms_token");
    window.location.replace("/login");
  }
  return res;
}

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  page: 1,
  limit: 50,
  search: "",
  trade: "",
  status: "",
  totalPages: 1,
  editingId: null,
};

const $ = (id) => document.getElementById(id);

// ── Show logged-in username ────────────────────────────────────────────────
try {
  const payload = JSON.parse(atob(token.split(".")[1]));
  $("user-label").textContent = `👤 ${payload.sub}`;
} catch {}

// ── Logout ─────────────────────────────────────────────────────────────────
$('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('cms_token');
  window.location.replace('/login');
});

// ── Toast ──────────────────────────────────────────────────────────────────
function toast(msg, type = "success") {
  const el = $("toast");
  el.className = `fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium flex items-center gap-2 ${
    type === "success" ? "bg-green-600" : type === "error" ? "bg-red-500" : "bg-indigo-600"
  }`;
  el.innerHTML = `<span>${type === "success" ? "✓" : type === "error" ? "✕" : "ℹ"}</span><span>${msg}</span>`;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3500);
}

// ── Stats ──────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await apiFetch("/stats");
    const d = await res.json();
    $("stat-total").textContent = d.total ?? 0;
    $("stat-pending").textContent = d.pending ?? 0;
    $("stat-employed").textContent = d.employed ?? 0;
    $("stat-dupes").textContent = d.last_duplicates ?? 0;
    $("api-status").textContent = "● Connected";
    $("api-status").className = "text-xs bg-green-500 px-3 py-1 rounded-full";
  } catch {
    $("api-status").textContent = "● Offline";
    $("api-status").className = "text-xs bg-red-500 px-3 py-1 rounded-full";
  }
}

// ── Trades dropdown ────────────────────────────────────────────────────────
async function loadTrades() {
  try {
    const res = await apiFetch("/trades");
    const trades = await res.json();
    const sel = $("filter-trade");
    sel.innerHTML = `<option value="">All Trades</option>`;
    trades.forEach((t) => {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      sel.appendChild(o);
    });
  } catch {}
}

// ── Status badge ───────────────────────────────────────────────────────────
function statusBadge(s) {
  const map = {
    Pending: "badge-pending",
    Employed: "badge-employed",
    Rejected: "badge-rejected",
    Shortlisted: "badge-shortlisted",
  };
  const cls = map[s] || "bg-gray-100 text-gray-600";
  return `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${cls}">${s || "—"}</span>`;
}

// ── Employees table ────────────────────────────────────────────────────────
async function loadEmployees() {
  $("table-loading").classList.remove("hidden");
  $("table-wrapper").classList.add("hidden");
  $("empty-state").classList.add("hidden");
  $("pagination").classList.add("hidden");

  const params = new URLSearchParams({
    page: state.page,
    limit: state.limit,
    ...(state.search && { search: state.search }),
    ...(state.trade && { trade: state.trade }),
    ...(state.status && { status: state.status }),
  });

  try {
    const res = await apiFetch(`/employees?${params}`);
    const d = await res.json();
    $("table-loading").classList.add("hidden");

    if (!d.data || d.data.length === 0) {
      $("empty-state").classList.remove("hidden");
      return;
    }

    state.totalPages = d.pages || 1;
    renderTable(d.data, d.total, d.page, d.pages);
    $("table-wrapper").classList.remove("hidden");
    $("pagination").classList.remove("hidden");
  } catch {
    $("table-loading").classList.add("hidden");
    toast("Failed to load employees", "error");
  }
}

function renderTable(data, total, page, pages) {
  const tbody = $("employees-body");
  const offset = (page - 1) * state.limit;
  tbody.innerHTML = data
    .map(
      (e, i) => `
    <tr data-id="${e.id}" class="hover:bg-indigo-50 cursor-pointer">
      <td class="px-4 py-3 text-gray-400 text-xs">${offset + i + 1}</td>
      <td class="px-4 py-3 font-medium">${e.name || "—"}</td>
      <td class="px-4 py-3 text-gray-500 font-mono text-xs">${e.national_id}</td>
      <td class="px-4 py-3 text-gray-500">${e.phone || "—"}</td>
      <td class="px-4 py-3">${e.trade || "—"}</td>
      <td class="px-4 py-3">${statusBadge(e.status)}</td>
      <td class="px-4 py-3">
        <button class="edit-btn text-indigo-500 hover:text-indigo-700 text-xs underline" data-id="${e.id}">Edit</button>
      </td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll("tr").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.classList.contains("edit-btn")) return;
      openModal(row.dataset.id);
    });
  });
  tbody.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openModal(btn.dataset.id));
  });

  $("pagination-info").textContent = `Showing ${offset + 1}–${Math.min(offset + data.length, total)} of ${total}`;
  $("page-indicator").textContent = `Page ${page} / ${pages}`;
  $("prev-page").disabled = page <= 1;
  $("next-page").disabled = page >= pages;
}

// ── Education tag input ───────────────────────────────────────────────────
function renderEduTags(values) {
  const container = $("edu-tags-container");
  container.innerHTML = "";
  values.forEach((v) => {
    if (!v.trim()) return;
    const tag = document.createElement("span");
    tag.className = "inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full";
    tag.innerHTML = `${v.trim()} <button type="button" class="hover:text-red-500 font-bold leading-none" data-val="${v.trim()}">&times;</button>`;
    tag.querySelector("button").addEventListener("click", () => {
      removeEduTag(v.trim());
    });
    container.appendChild(tag);
  });
}

function getEduTags() {
  return Array.from($("edu-tags-container").querySelectorAll("span"))
    .map((s) => s.querySelector("button").dataset.val)
    .filter(Boolean);
}

function addEduTag(raw) {
  const vals = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const existing = getEduTags();
  const merged = [...new Set([...existing, ...vals])];
  renderEduTags(merged);
  $("m-edu-edit").value = "";
}

function removeEduTag(val) {
  const updated = getEduTags().filter((v) => v !== val);
  renderEduTags(updated);
}

// Commit tag on comma or Enter
$("m-edu-edit").addEventListener("keydown", (e) => {
  if (e.key === "," || e.key === "Enter") {
    e.preventDefault();
    const val = $("m-edu-edit").value.replace(/,/g, "").trim();
    if (val) addEduTag(val);
  }
});
// Also commit on blur so typing then clicking Save works
$("m-edu-edit").addEventListener("blur", () => {
  const val = $("m-edu-edit").value.replace(/,/g, "").trim();
  if (val) addEduTag(val);
});
// Click container focuses the input
$("edu-tags-container").addEventListener("click", () => $("m-edu-edit").focus());

// ── Modal state ───────────────────────────────────────────────────────────
let _currentEmp = null; // snapshot of data when modal opened, used for cancel

// All input/select/textarea IDs that toggle between view/edit
const MODAL_FIELDS = [
  "m-status", "m-age-edit", "m-exp-edit",
  "m-dl-no-edit", "m-dl-type-edit", "m-last-employer-edit", "m-remarks",
];

function setModalMode(mode) {
  const isView = mode === "view";
  const modalBody = document.querySelector("#modal .bg-white");

  // Toggle CSS class on the modal card for CSS-driven view styling
  modalBody.classList.toggle("modal-view", isView);

  // Toggle readonly on text inputs and textarea
  MODAL_FIELDS.forEach((id) => {
    const el = $(id);
    if (!el) return;
    if (el.tagName === "SELECT") {
      // selects don't support readonly — use aria + pointer-events via CSS
      el.setAttribute("aria-readonly", isView ? "true" : "false");
    } else {
      el.readOnly = isView;
    }
  });

  // Education input interactivity
  $("m-edu-edit").readOnly = isView;

  // Button visibility
  $("modal-edit").classList.toggle("hidden", !isView);
  $("modal-edit-actions").classList.toggle("hidden", isView);
  $("modal-close-btn").classList.toggle("hidden", !isView);
}

async function openModal(id) {
  state.editingId = Number(id);
  $("modal").classList.remove("hidden");

  const res = await apiFetch(`/employees/${id}`);
  if (!res.ok) { closeModal(); toast("Could not load candidate.", "error"); return; }
  const emp = await res.json();
  _currentEmp = emp; // store for cancel

  populateModal(emp);
  setModalMode("view");
}

function populateModal(emp) {
  $("m-name").textContent = emp.name || "—";
  $("m-nid").textContent = emp.national_id;
  $("m-phone").textContent = emp.phone || "—";
  $("m-trade").textContent = emp.trade || "—";
  $("m-date").textContent = emp.created_at ? new Date(emp.created_at).toLocaleDateString() : "—";
  $("m-doc").innerHTML = emp.supporting_doc_path
    ? `<div class="flex gap-2 mt-0.5">
        <button onclick="viewDoc('${emp.supporting_doc_path}')"
          class="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 underline">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
          </svg>View
        </button>
        <span class="text-gray-300">|</span>
        <button onclick="downloadDoc('${emp.supporting_doc_path}')"
          class="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 underline">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>Download
        </button>
      </div>`
    : "<span class='text-gray-400 text-xs'>No document uploaded</span>";

  $("m-status").value = emp.status || "Pending";
  $("m-remarks").value = emp.remarks || "";
  $("m-age-edit").value = emp.age || "";
  $("m-exp-edit").value = emp.experience || "";
  $("m-dl-no-edit").value = emp.driving_license_no || "";
  $("m-dl-type-edit").value = emp.driving_license_type || "";
  $("m-last-employer-edit").value = emp.last_employer || "";
  $("m-doc-upload").value = "";

  const eduValues = emp.education ? emp.education.split(",").map(s => s.trim()).filter(Boolean) : [];
  renderEduTags(eduValues);
  $("m-edu-edit").value = "";
}

function closeModal() {
  $("modal").classList.add("hidden");
  state.editingId = null;
  _currentEmp = null;
}

function cancelEdit() {
  if (_currentEmp) populateModal(_currentEmp); // restore original values
  setModalMode("view");
}

async function saveModal() {
  if (!state.editingId) return;
  const btn = $("modal-save");
  btn.disabled = true;
  btn.innerHTML = `<div class="loader w-4 h-4"></div> Saving...`;

  try {
    const payload = {
      status: $("m-status").value,
      remarks: $("m-remarks").value,
      experience: $("m-exp-edit").value || null,
      education: getEduTags().join(", ") || null,
      driving_license_no: $("m-dl-no-edit").value || null,
      driving_license_type: $("m-dl-type-edit").value || null,
      last_employer: $("m-last-employer-edit").value || null,
      age: $("m-age-edit").value ? parseInt($("m-age-edit").value) : null,
    };

    const res = await apiFetch(`/employees/${state.editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error();

    // Upload doc if selected
    const docFile = $("m-doc-upload").files[0];
    if (docFile) {
      const form = new FormData();
      form.append("file", docFile);
      const docRes = await apiFetch(`/employees/${state.editingId}/doc`, {
        method: "POST",
        body: form,
      });
      if (!docRes.ok) toast("Saved but document upload failed.", "error");
    }

    // Refresh snapshot and return to view mode
    const fresh = await apiFetch(`/employees/${state.editingId}`);
    _currentEmp = await fresh.json();
    populateModal(_currentEmp);
    setModalMode("view");

    toast("Candidate updated successfully");
    loadEmployees();
    loadStats();
  } catch {
    toast("Failed to save changes", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Save Changes`;
  }
}

// ── Export ─────────────────────────────────────────────────────────────────
// ── Document view / download ──────────────────────────────────────────────────
function _docFilename(path) {
  return path.split("/").pop();
}

async function viewDoc(path) {
  const filename = _docFilename(path);
  const res = await apiFetch(`/docs/${encodeURIComponent(filename)}`);
  if (!res.ok) { toast("Document not found.", "error"); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function downloadDoc(path) {
  const filename = _docFilename(path);
  const res = await apiFetch(`/docs/${encodeURIComponent(filename)}?download=true`);
  if (!res.ok) { toast("Document not found.", "error"); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportCSV() {
  const btn = $("export-btn");
  btn.disabled = true;
  btn.innerHTML = `<div class="loader w-4 h-4"></div> Exporting...`;

  const params = new URLSearchParams({
    ...(state.search && { search: state.search }),
    ...(state.trade && { trade: state.trade }),
    ...(state.status && { status: state.status }),
  });

  try {
    const res = await apiFetch(`/export?${params}`);
    if (!res.ok) {
      const d = await res.json();
      toast(d.detail || "Export failed.", "error");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `candidates_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Export downloaded successfully");
  } catch {
    toast("Export failed.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg> Export CSV`;
  }
}

// ── File Upload ────────────────────────────────────────────────────────────
function handleFile(file) {
  if (!file) return;
  const ext = file.name.split(".").pop().toLowerCase();
  if (!["csv", "xlsx", "xls"].includes(ext)) {
    showAlert("Invalid file format. Please upload a CSV or Excel file.", "error");
    return;
  }
  $("file-name").textContent = `📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  uploadFile(file);
}

async function uploadFile(file) {
  $("upload-progress").classList.remove("hidden");
  $("preview-section").classList.add("hidden");
  hideAlert();

  const form = new FormData();
  form.append("file", file);

  try {
    const res = await apiFetch("/upload", { method: "POST", body: form });
    const d = await res.json();
    $("upload-progress").classList.add("hidden");

    if (!res.ok) {
      showAlert(d.detail || "Upload failed.", "error");
      return;
    }

    showAlert(`✓ File uploaded: ${d.total_rows} rows detected.`, "success");
    renderPreview(d.preview, d.columns, d.total_rows);
  } catch {
    $("upload-progress").classList.add("hidden");
    showAlert("Could not connect to server.", "error");
  }
}

function renderPreview(rows, columns, total) {
  $("preview-head").innerHTML = `<tr>${columns.map((c) => `<th class="px-3 py-2 text-left">${c}</th>`).join("")}</tr>`;
  $("preview-body").innerHTML = rows
    .map((row) => `<tr class="hover:bg-gray-50">${columns.map((c) => `<td class="px-3 py-2 text-gray-600">${row[c] ?? ""}</td>`).join("")}</tr>`)
    .join("");
  $("preview-row-count").textContent = `${total} total rows`;
  $("preview-section").classList.remove("hidden");
}

async function processFile() {
  const btn = $("process-btn");
  btn.disabled = true;
  btn.innerHTML = `<div class="loader w-4 h-4"></div> Processing...`;

  try {
    const res = await apiFetch("/process", { method: "POST" });
    const d = await res.json();

    if (!res.ok) {
      showAlert(d.detail || "Processing failed.", "error");
      return;
    }

    showAlert(`✓ Inserted: ${d.inserted} records. Duplicates skipped: ${d.duplicates}.`, "success");
    $("preview-section").classList.add("hidden");
    $("file-name").textContent = "";
    loadEmployees();
    loadStats();
    loadTrades();
    toast(`${d.inserted} candidates saved!`);
  } catch {
    showAlert("Processing failed. Please try again.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Process & Save`;
  }
}

function showAlert(msg, type) {
  const el = $("upload-alert");
  el.className = `mt-4 px-4 py-3 rounded-lg text-sm font-medium ${
    type === "success"
      ? "bg-green-50 text-green-700 border border-green-200"
      : "bg-red-50 text-red-700 border border-red-200"
  }`;
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideAlert() {
  $("upload-alert").classList.add("hidden");
}

// ── Event Listeners ────────────────────────────────────────────────────────
$("file-input").addEventListener("change", (e) => handleFile(e.target.files[0]));

const dropZone = $("drop-zone");
dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  handleFile(e.dataTransfer.files[0]);
});

$("process-btn").addEventListener("click", processFile);
$("export-btn").addEventListener("click", exportCSV);
$("modal-close").addEventListener("click", closeModal);
$("modal-close-btn").addEventListener("click", closeModal);
$("modal-edit").addEventListener("click", () => setModalMode("edit"));
$("modal-cancel").addEventListener("click", cancelEdit);
$("modal-save").addEventListener("click", saveModal);
$("modal").addEventListener("click", (e) => { if (e.target === $("modal")) closeModal(); });
$("refresh-btn").addEventListener("click", () => { loadEmployees(); loadStats(); });

let searchTimer;
$("search-input").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = e.target.value.trim(); state.page = 1; loadEmployees(); }, 350);
});
$("filter-trade").addEventListener("change", (e) => { state.trade = e.target.value; state.page = 1; loadEmployees(); });
$("filter-status").addEventListener("change", (e) => { state.status = e.target.value; state.page = 1; loadEmployees(); });
$("prev-page").addEventListener("click", () => { if (state.page > 1) { state.page--; loadEmployees(); } });
$("next-page").addEventListener("click", () => { if (state.page < state.totalPages) { state.page++; loadEmployees(); } });

// ── Init ───────────────────────────────────────────────────────────────────
loadStats();
loadEmployees();
loadTrades();
