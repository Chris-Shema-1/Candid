const API = "http://127.0.0.1:8000";

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

// ── DOM refs ───────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

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
    const res = await fetch(`${API}/stats`);
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
    const res = await fetch(`${API}/trades`);
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
    const res = await fetch(`${API}/employees?${params}`);
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
  } catch (e) {
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

  // Row click → open modal
  tbody.querySelectorAll("tr").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.classList.contains("edit-btn")) return;
      openModal(row.dataset.id, data);
    });
  });
  tbody.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openModal(btn.dataset.id, data));
  });

  // Pagination info
  $("pagination-info").textContent = `Showing ${offset + 1}–${Math.min(offset + data.length, total)} of ${total}`;
  $("page-indicator").textContent = `Page ${page} / ${pages}`;
  $("prev-page").disabled = page <= 1;
  $("next-page").disabled = page >= pages;
}

// ── Modal ──────────────────────────────────────────────────────────────────
function openModal(id, data) {
  const emp = data.find((e) => String(e.id) === String(id));
  if (!emp) return;
  state.editingId = emp.id;

  $("m-name").textContent = emp.name || "—";
  $("m-nid").textContent = emp.national_id;
  $("m-phone").textContent = emp.phone || "—";
  $("m-trade").textContent = emp.trade || "—";
  $("m-exp").textContent = emp.experience || "—";
  $("m-edu").textContent = emp.education || "—";
  $("m-date").textContent = emp.created_at ? new Date(emp.created_at).toLocaleDateString() : "—";
  $("m-status").value = emp.status || "Pending";
  $("m-remarks").value = emp.remarks || "";

  $("modal").classList.remove("hidden");
}

function closeModal() {
  $("modal").classList.add("hidden");
  state.editingId = null;
}

async function saveModal() {
  if (!state.editingId) return;
  const btn = $("modal-save");
  btn.disabled = true;
  btn.innerHTML = `<div class="loader w-4 h-4"></div> Saving...`;

  try {
    const res = await fetch(`${API}/employees/${state.editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: $("m-status").value,
        remarks: $("m-remarks").value,
      }),
    });
    if (!res.ok) throw new Error();
    toast("Candidate updated successfully");
    closeModal();
    loadEmployees();
    loadStats();
  } catch {
    toast("Failed to save changes", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Save Changes`;
  }
}

// ── File Upload ────────────────────────────────────────────────────────────
let uploadedFile = null;

function handleFile(file) {
  if (!file) return;
  const ext = file.name.split(".").pop().toLowerCase();
  if (!["csv", "xlsx", "xls"].includes(ext)) {
    showAlert("Invalid file format. Please upload a CSV or Excel file.", "error");
    return;
  }
  uploadedFile = file;
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
    const res = await fetch(`${API}/upload`, { method: "POST", body: form });
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
    showAlert("Could not connect to server. Is the backend running?", "error");
  }
}

function renderPreview(rows, columns, total) {
  const head = $("preview-head");
  const body = $("preview-body");

  head.innerHTML = `<tr>${columns.map((c) => `<th class="px-3 py-2 text-left">${c}</th>`).join("")}</tr>`;
  body.innerHTML = rows
    .map(
      (row) =>
        `<tr class="hover:bg-gray-50">${columns
          .map((c) => `<td class="px-3 py-2 text-gray-600">${row[c] ?? ""}</td>`)
          .join("")}</tr>`
    )
    .join("");

  $("preview-row-count").textContent = `${total} total rows`;
  $("preview-section").classList.remove("hidden");
}

async function processFile() {
  const btn = $("process-btn");
  btn.disabled = true;
  btn.innerHTML = `<div class="loader w-4 h-4"></div> Processing...`;

  try {
    const res = await fetch(`${API}/process`, { method: "POST" });
    const d = await res.json();

    if (!res.ok) {
      showAlert(d.detail || "Processing failed.", "error");
      return;
    }

    showAlert(
      `✓ Inserted: ${d.inserted} records. Duplicates skipped: ${d.duplicates}.`,
      "success"
    );
    $("preview-section").classList.add("hidden");
    $("file-name").textContent = "";
    uploadedFile = null;
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
    type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
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
$("modal-close").addEventListener("click", closeModal);
$("modal-cancel").addEventListener("click", closeModal);
$("modal-save").addEventListener("click", saveModal);
$("modal").addEventListener("click", (e) => { if (e.target === $("modal")) closeModal(); });

$("refresh-btn").addEventListener("click", () => { loadEmployees(); loadStats(); });

let searchTimer;
$("search-input").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = e.target.value.trim();
    state.page = 1;
    loadEmployees();
  }, 350);
});

$("filter-trade").addEventListener("change", (e) => {
  state.trade = e.target.value;
  state.page = 1;
  loadEmployees();
});

$("filter-status").addEventListener("change", (e) => {
  state.status = e.target.value;
  state.page = 1;
  loadEmployees();
});

$("prev-page").addEventListener("click", () => {
  if (state.page > 1) { state.page--; loadEmployees(); }
});
$("next-page").addEventListener("click", () => {
  if (state.page < state.totalPages) { state.page++; loadEmployees(); }
});

// ── Init ───────────────────────────────────────────────────────────────────
loadStats();
loadEmployees();
loadTrades();
