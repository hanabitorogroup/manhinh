// =============================================================================
// admin.js — Logic trang quản trị (public/admin/index.html)
// -----------------------------------------------------------------------------
// Module ES thuần, không build step. Chỉ dùng API đã tài liệu hoá trong
// docs/ARCHITECTURE.md mục 4 (data-layer.js) và mục 4/8 (themes.js).
//
// Dùng `import * as DataLayer` (thay vì import { a, b, c } từng tên) để việc
// import không "vỡ" cứng nếu data-layer.js đang được viết song song và tạm
// thời thiếu một export nào đó — mọi hàm được gọi qua kiểm tra `typeof === 'function'`
// trước khi dùng, xem thêm ghi chú "HỢP ĐỒNG CHƯA RÕ" rải trong file này.
// =============================================================================

import * as DataLayer from "../assets/js/data-layer.js";
import { THEMES } from "../assets/js/themes.js";
import { computeAllScreensLayout } from "../assets/js/pagination.js";

const {
  initData,
  onSettings,
  onMenu,
  onThemes,
  onStatus,
  saveSettings,
  saveItem,
  deleteItem,
  saveTheme,
  uploadMedia,
  onMedia,
  resolveImage,
  getServerOffsetMs,
  DEMO,
  // GHI CHÚ — HỢP ĐỒNG CHƯA RÕ: mục 4 của ARCHITECTURE.md không liệt kê signIn/
  // onAuth/signOutAdmin trong bảng "API bắt buộc" của data-layer.js, dù mục 6 và
  // mục 7 đều mô tả rõ luồng đăng nhập Firebase Auth bắt buộc phải có. Ở đây giả
  // định data-layer.js xuất thêm 3 hàm này theo cùng quy ước với các hàm onX khác:
  //   signIn(email, password) -> Promise<void>
  //   onAuth(cb)               -> cb(user|null) -> unsubscribe()
  //   signOutAdmin()           -> Promise<void>
  // Nếu thiếu, initAuthGate() bên dưới sẽ rơi vào nhánh dự phòng an toàn.
  signIn,
  onAuth,
  signOutAdmin,
} = DataLayer;

// GHI CHÚ: onMedia/resolveImage không nằm trong bảng "API bắt buộc" ở mục 4
// ARCHITECTURE.md, nhưng data-layer.js thực tế có xuất thêm 2 hàm này để giải
// quyết đúng vấn đề "đọc lại ảnh từ mediaId" — admin dùng lại y hệt để khớp
// 100% với cách 4 màn hình thật sự hiển thị ảnh (bao gồm cả thứ tự ưu tiên
// imageUrl > mediaId, xem resolveImage()).

/* =============================================================================
   Trạng thái toàn cục
   ========================================================================== */
const state = {
  user: null,
  settings: {
    themeId: "hanabi",
    rotationSeconds: 10,
    itemsPerPage: 6,
    transition: "fade",
    distribution: "auto",
    currency: "zł",
    showHeader: true,
    headerText_pl: "MENU",
    effectsLevel: "full",
    reloadHour: 4,
    revision: 0,
  },
  items: [],
  themeOverrides: {}, // { [themeId]: theme override đã lưu trong themes/{id} }
  media: {}, // { [mediaId]: {dataUrl,...} } — từ onMedia(cb), dùng với resolveImage()
  status: {}, // { 1: {...}, 2: {...}, 3: {...}, 4: {...} }
  activeTab: "overview",
  search: "",
  categoryFilter: "",
  editingItemId: null,
  uploadedMediaId: "",
  uploadedMediaDataUrl: "", // dataURL cục bộ tức thời cho ảnh vừa chọn trong modal (trước khi onMedia kịp echo về)
  expandedPreview: null, // 1..4 hoặc null
  previewInitialized: false,
};

let dragSrcId = null;

/* =============================================================================
   Tiện ích chung
   ========================================================================== */
function $(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
const escapeAttr = escapeHtml;

function debounce(fn, wait = 400) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function toast(message, type = "ok") {
  const stack = $("toastStack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .25s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 250);
  }, 3200);
}

function errMsg(err) {
  return (err && err.message) ? err.message : String(err);
}

function toMillis(ts) {
  if (ts == null) return null;
  if (typeof ts === "number") return ts;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (typeof ts.seconds === "number") {
    return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
  }
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function relativeTimeVi(ms) {
  if (ms == null) return "chưa có dữ liệu";
  const diff = Date.now() - ms;
  if (diff < 10000) return "vừa xong";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} giây trước`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}

function formatPriceVi(price, suffix, currency) {
  const n = Number(price) || 0;
  const s = n.toFixed(2).replace(".", ",");
  return `${s} ${currency || "zł"}${suffix ? " " + suffix : ""}`;
}

function setIfNotFocused(el, val) {
  if (document.activeElement !== el) el.value = val;
}

/** True nếu tiêu điểm bàn phím/chuột đang ở trong lưới tuỳ chỉnh theme. */
function isEditingOverrideGrid() {
  const grid = $("overrideGrid");
  return !!(grid && document.activeElement && grid.contains(document.activeElement));
}

/** Hộp thoại xác nhận dùng chung (thay cho confirm() gốc của trình duyệt). */
function showConfirm(title, message, okLabel = "Đồng ý") {
  return new Promise((resolve) => {
    $("confirmModalTitle").textContent = title;
    $("confirmModalMessage").textContent = message;
    $("confirmModalOk").textContent = okLabel;
    const overlay = $("confirmModalOverlay");
    overlay.classList.remove("hidden");
    const okBtn = $("confirmModalOk");
    const cancelBtn = $("confirmModalCancel");
    const cleanup = (result) => {
      overlay.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlay);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onOverlay = (e) => { if (e.target === overlay) cleanup(false); };
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlay);
  });
}

/* =============================================================================
   Sắp xếp danh sách món cho tab "Món ăn" (bảng CRUD + kéo-thả) — theo
   (order asc, name_pl asc), giống thứ tự toàn cục dùng khi phân trang.
   ========================================================================== */
function sortItems(items) {
  return [...items].sort((a, b) => {
    const oa = a.order ?? 0, ob = b.order ?? 0;
    if (oa !== ob) return oa - ob;
    return (a.name_pl || "").localeCompare(b.name_pl || "", "pl");
  });
}

/**
 * Trả về { screens: {1:[{pageNo,items}],2:[...],3:[...],4:[...]}, totalPages,
 * itemsPerPage } cho tab Tổng quan + tab Bố cục.
 *
 * Đây CHỈ là một wrapper mỏng quanh computeAllScreensLayout() của
 * ../assets/js/pagination.js — module đó mới là NGUỒN DUY NHẤT của thuật
 * toán phân trang (mục 3 ARCHITECTURE.md), dùng chung với display.js (nơi
 * thực sự render 4 màn hình). Trước đây admin tự cài một bản round-robin
 * riêng cho nhóm món "trôi nổi" ở chế độ thủ công, lệch với display.js và
 * khiến sơ đồ Bố cục KHÔNG khớp với 4 màn hình thật — đã sửa bằng cách xoá
 * bản cài lại đó và gọi thẳng module dùng chung. KHÔNG được cài lại thuật
 * toán phân trang ở file này; mọi thay đổi thuật toán phải sửa ở
 * pagination.js để display.js và admin.js luôn đồng thuận.
 */
function computeLayout(items, settings) {
  return computeAllScreensLayout(items, settings);
}

/* =============================================================================
   Theme đang áp dụng (preset THEMES + override đã lưu trong themes/{id})
   ========================================================================== */
function getActiveThemeResolved() {
  const id = state.settings.themeId || "hanabi";
  const preset = THEMES[id] || THEMES.hanabi || {};
  const override = state.themeOverrides[id] || {};
  return { ...preset, ...override };
}

/* =============================================================================
   Lưu dữ liệu — mọi ghi đều lạc quan (optimistic), báo toast, và tăng revision
   để 4 màn hình tự làm mới (mục 6 ARCHITECTURE.md).
   ========================================================================== */
async function saveSettingsPatch(patch, toastMsg = "Đã lưu") {
  const next = (state.settings.revision || 0) + 1;
  try {
    await saveSettings({ ...patch, revision: next });
    state.settings.revision = next;
    if (toastMsg) toast(toastMsg);
  } catch (err) {
    toast("Lỗi: " + errMsg(err), "err");
    throw err;
  }
}

/** Tăng revision sau khi lưu món/theme — lỗi ở bước này chỉ log, không chặn UI. */
async function bumpRevisionAfterSave() {
  try {
    const next = (state.settings.revision || 0) + 1;
    await saveSettings({ revision: next });
    state.settings.revision = next;
  } catch (err) {
    console.error("Không tăng được settings.revision:", err);
  }
}

/* =============================================================================
   Cổng đăng nhập & khởi động ứng dụng
   ========================================================================== */
let unsubscribers = [];
function teardownSubscriptions() {
  unsubscribers.forEach((u) => { try { u && u(); } catch (_e) { /* bỏ qua */ } });
  unsubscribers = [];
}

function startDataSubscriptions() {
  teardownSubscriptions();
  if (typeof onSettings === "function") {
    unsubscribers.push(onSettings((s) => {
      const prevThemeId = state.settings.themeId;
      state.settings = { ...state.settings, ...(s || {}) };
      renderLayoutControlsFromSettings();
      renderLayoutDiagram();
      renderThemeGallery();
      // Chỉ dựng lại lưới tuỳ chỉnh theme khi đổi theme (đổi themeId), KHÔNG
      // dựng lại mỗi lần settings thay đổi vì bất kỳ lý do gì khác — nếu không
      // sẽ ngắt ngang thao tác kéo color-picker/slider đang debounce dở của
      // người dùng ở tab Giao diện. onThemes bên dưới mới là nguồn cập nhật
      // đúng cho giá trị override khi chúng thay đổi.
      if (state.settings.themeId !== prevThemeId) renderOverrideGrid();
      renderOverview();
      renderItemsTab();
      applyPreviewCardTheme();
    }));
  }
  if (typeof onMenu === "function") {
    unsubscribers.push(onMenu((items) => {
      state.items = items || [];
      renderItemsTab();
      renderOverview();
      renderLayoutDiagram();
    }));
  }
  if (typeof onThemes === "function") {
    unsubscribers.push(onThemes((map) => {
      state.themeOverrides = map || {};
      renderThemeGallery();
      // Không dựng lại lưới nếu người dùng đang thao tác trong đó (vd đang kéo
      // color-picker) — tránh giật giá trị đang chỉnh dở khi echo từ server về.
      if (!isEditingOverrideGrid()) renderOverrideGrid();
      applyPreviewCardTheme();
    }));
  }
  if (typeof onStatus === "function") {
    unsubscribers.push(onStatus((map) => {
      state.status = map || {};
      renderOverview();
    }));
  }
  if (typeof onMedia === "function") {
    unsubscribers.push(onMedia((map) => {
      state.media = map || {};
      renderItemsTab(); // ảnh có thể vừa tải xong → cập nhật thumbnail trong bảng
      if (!$("itemModalOverlay").classList.contains("hidden")) {
        updateImagePickerPreview();
        updateItemLivePreview();
      }
    }));
  }
}

async function bootApp() {
  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("appShell").classList.toggle("demo-active", !!DEMO);
  $("demoBanner").classList.toggle("hidden", !DEMO);
  $("sidebarUser").textContent = state.user?.email || (DEMO ? "Chế độ thử nghiệm (chưa cấu hình Firebase)" : "");
  $("logoutBtn").classList.toggle("hidden", !!DEMO);

  try {
    if (typeof initData === "function") await initData();
  } catch (err) {
    toast("Lỗi khởi tạo dữ liệu: " + errMsg(err), "err");
  }
  startDataSubscriptions();
  switchTab("overview");
}

function showLogin() {
  teardownSubscriptions();
  $("appShell").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
}

function initAuthGate() {
  if (DEMO) {
    bootApp();
    return;
  }
  if (typeof onAuth !== "function") {
    // Không có onAuth trong data-layer → không xác định được trạng thái đăng
    // nhập, hiển thị màn hình đăng nhập; nút Đăng nhập sẽ báo lỗi rõ ràng.
    showLogin();
    return;
  }
  onAuth((user) => {
    state.user = user || null;
    if (user) bootApp();
    else showLogin();
  });
}

/* =============================================================================
   Điều hướng tab
   ========================================================================== */
const TAB_TITLES = {
  overview: "Tổng quan", items: "Món ăn", layout: "Bố cục", theme: "Giao diện", preview: "Xem trước",
};

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.dataset.tabPanel === tab));
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll("#tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("topbarTitle").textContent = TAB_TITLES[tab] || "";

  if (tab === "overview") renderOverview();
  if (tab === "layout") renderLayoutDiagram();
  if (tab === "theme") { renderThemeGallery(); renderOverrideGrid(); }
  if (tab === "preview" && !state.previewInitialized) {
    state.previewInitialized = true;
    renderPreviewGrid();
  }
}

/* =============================================================================
   TAB 1 — TỔNG QUAN
   ========================================================================== */
function statCardHtml(value, label) {
  return `<div class="stat-card"><div class="stat-value">${value}</div><div class="stat-label">${escapeHtml(label)}</div></div>`;
}

function renderOverview() {
  if (!$("statGrid")) return;
  const layout = computeLayout(state.items, state.settings);
  const totalItems = state.items.length;
  const visibleItems = state.items.filter((i) => i.visible !== false).length;
  const totalPages = layout.totalPages;
  const nominalPerScreen = totalPages ? Math.ceil(totalPages / 4) : 0;

  $("statGrid").innerHTML = [
    statCardHtml(totalItems, "Tổng số món"),
    statCardHtml(visibleItems, "Số món đang hiện"),
    statCardHtml(totalPages, "Tổng số trang"),
    statCardHtml(nominalPerScreen, "Số trang mỗi màn hình"),
  ].join("");

  $("screenGrid").innerHTML = [1, 2, 3, 4].map((n) => {
    const st = state.status[n] || state.status[String(n)] || {};
    const ms = toMillis(st.lastSeen);
    const online = ms != null && (Date.now() - ms) < 3 * 60 * 1000;
    return `
    <div class="screen-card">
      <div class="screen-card__head">
        <span class="screen-card__title">Màn hình ${n}</span>
        <span class="status-pill ${online ? "on" : "off"}"><span class="dot"></span>${online ? "Đang chạy" : "Mất kết nối"}</span>
      </div>
      <dl>
        <dt>Liên lạc cuối</dt><dd>${relativeTimeVi(ms)}</dd>
        <dt>Trang hiện tại</dt><dd>${st.page != null ? st.page : "—"}</dd>
        <dt>Revision</dt><dd>${st.revision != null ? st.revision : "—"}</dd>
        <dt>Độ phân giải</dt><dd>${st.res ? escapeHtml(st.res) : "—"}</dd>
      </dl>
    </div>`;
  }).join("");
}

/* =============================================================================
   TAB 2 — MÓN ĂN
   ========================================================================== */
function isDndEnabled() {
  return !state.search && !state.categoryFilter;
}

function getFilteredSortedItems() {
  let list = sortItems(state.items);
  if (state.categoryFilter) list = list.filter((i) => (i.category || "") === state.categoryFilter);
  if (state.search) {
    const q = state.search.toLowerCase();
    list = list.filter((i) =>
      (i.name_pl || "").toLowerCase().includes(q) || (i.desc_pl || "").toLowerCase().includes(q));
  }
  return list;
}

/**
 * Nguồn ảnh dùng để hiển thị — DÙNG LẠI resolveImage() của data-layer để khớp
 * 100% với cách 4 màn hình thật hiển thị: imageUrl (URL dán) thắng mediaId
 * (ảnh đã tải lên) khi cả hai cùng có giá trị.
 */
function getThumbSrc(item) {
  if (typeof resolveImage === "function") return resolveImage(item, state.media) || null;
  // Dự phòng nếu vì lý do gì đó resolveImage không có sẵn.
  return item.imageUrl || (item.mediaId && state.media[item.mediaId]?.dataUrl) || null;
}

function itemThumbHtml(item) {
  const src = getThumbSrc(item);
  if (src) return `<img class="item-thumb" src="${escapeAttr(src)}" alt="" loading="lazy" onerror="this.outerHTML='&lt;div class=&quot;item-thumb placeholder&quot;&gt;🍽️&lt;/div&gt;'" />`;
  return `<div class="item-thumb placeholder">🍽️</div>`;
}

function itemRowHtml(item) {
  const priceStr = formatPriceVi(item.price, item.priceSuffix, state.settings.currency);
  const lock = Number(item.screenLock) || 0;
  return `
  <div class="item-row${item.visible === false ? " hidden-item" : ""}" draggable="true" data-id="${escapeAttr(item.id)}">
    <div class="drag-handle" title="Kéo để đổi thứ tự">⠿</div>
    ${itemThumbHtml(item)}
    <div class="item-main-mobile">
      <div class="item-name">${escapeHtml(item.name_pl || "(chưa đặt tên)")}</div>
      <div class="item-desc">${escapeHtml(item.desc_pl || "")}</div>
      ${item.badge ? `<span class="item-badge-tag">${escapeHtml(item.badge)}</span>` : ""}
    </div>
    <div class="item-cat">${escapeHtml(item.category || "—")}</div>
    <div class="item-price-col item-price">${priceStr}</div>
    <div class="item-badge-col">${item.badge ? escapeHtml(item.badge) : '<span style="color:var(--text-faint)">—</span>'}</div>
    <div class="item-vis-col">
      <label class="switch"><input type="checkbox" class="vis-toggle" data-id="${escapeAttr(item.id)}" ${item.visible !== false ? "checked" : ""}><span class="track"></span></label>
    </div>
    <div class="item-lock-col">
      <select class="lock-select" data-id="${escapeAttr(item.id)}">
        <option value="0" ${lock === 0 ? "selected" : ""}>Tự động</option>
        <option value="1" ${lock === 1 ? "selected" : ""}>Màn hình 1</option>
        <option value="2" ${lock === 2 ? "selected" : ""}>Màn hình 2</option>
        <option value="3" ${lock === 3 ? "selected" : ""}>Màn hình 3</option>
        <option value="4" ${lock === 4 ? "selected" : ""}>Màn hình 4</option>
      </select>
    </div>
    <div class="item-actions">
      <button type="button" class="btn btn-icon btn-ghost" data-action="edit" data-id="${escapeAttr(item.id)}" title="Sửa">✏️</button>
      <button type="button" class="btn btn-icon btn-ghost" data-action="dup" data-id="${escapeAttr(item.id)}" title="Nhân bản">📄</button>
      <button type="button" class="btn btn-icon btn-ghost" data-action="del" data-id="${escapeAttr(item.id)}" title="Xoá">🗑️</button>
    </div>
  </div>`;
}

function renderItemsTab() {
  if (!$("itemList")) return;

  const categories = [...new Set(state.items.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pl"));
  const filterSel = $("categoryFilter");
  const prevVal = filterSel.value;
  filterSel.innerHTML = '<option value="">Tất cả danh mục</option>' +
    categories.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("");
  filterSel.value = categories.includes(prevVal) ? prevVal : (state.categoryFilter || "");
  $("categoryOptions").innerHTML = categories.map((c) => `<option value="${escapeAttr(c)}"></option>`).join("");

  const list = getFilteredSortedItems();
  $("itemList").innerHTML = list.map(itemRowHtml).join("");
  $("itemEmptyState").classList.toggle("hidden", list.length > 0);
  $("dndDisabledHint").classList.toggle("hidden", isDndEnabled());
}

async function saveItemField(id, partial, msg = "Đã lưu") {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  Object.assign(it, partial);
  renderItemsTab();
  try {
    await saveItem({ ...it });
    await bumpRevisionAfterSave();
    toast(msg);
  } catch (err) {
    toast("Lỗi: " + errMsg(err), "err");
  }
}

async function reorderItems(srcId, targetId) {
  const sorted = sortItems(state.items);
  const fromIdx = sorted.findIndex((i) => i.id === srcId);
  const toIdx = sorted.findIndex((i) => i.id === targetId);
  if (fromIdx < 0 || toIdx < 0) return;
  const [moved] = sorted.splice(fromIdx, 1);
  sorted.splice(toIdx, 0, moved);

  const changed = [];
  sorted.forEach((it, idx) => {
    const newOrder = (idx + 1) * 10; // đánh số lại theo bước 10
    if (it.order !== newOrder) { it.order = newOrder; changed.push(it); }
  });
  state.items = sorted;
  renderItemsTab();
  try {
    await Promise.all(changed.map((it) => saveItem({ ...it })));
    await bumpRevisionAfterSave();
    toast("Đã lưu thứ tự mới");
  } catch (err) {
    toast("Lỗi khi lưu thứ tự: " + errMsg(err), "err");
  }
}

async function duplicateItem(id) {
  const src = state.items.find((i) => i.id === id);
  if (!src) return;
  const newId = crypto.randomUUID ? crypto.randomUUID() : "item_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  const copy = { ...src, id: newId, name_pl: `${src.name_pl || ""} (kopia)`, order: (src.order || 0) + 1 };
  try {
    await saveItem(copy);
    state.items.push(copy);
    await bumpRevisionAfterSave();
    toast("Đã nhân bản món");
    renderItemsTab();
  } catch (err) {
    toast("Lỗi: " + errMsg(err), "err");
  }
}

async function deleteItemFlow(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  const ok = await showConfirm(
    "Xoá món ăn",
    `Bạn có chắc muốn xoá "${item.name_pl || "món này"}"? Hành động này không thể hoàn tác.`,
    "Xoá",
  );
  if (!ok) return;
  try {
    await deleteItem(id);
    state.items = state.items.filter((i) => i.id !== id);
    await bumpRevisionAfterSave();
    toast("Đã xoá món");
    renderItemsTab();
    renderOverview();
  } catch (err) {
    toast("Lỗi: " + errMsg(err), "err");
  }
}

/* ---------- Modal thêm/sửa món ---------- */
function openItemModal(id) {
  state.editingItemId = id || null;
  const isEdit = !!id;
  const item = isEdit ? state.items.find((i) => i.id === id) : null;

  $("itemModalTitle").textContent = isEdit ? "Sửa món" : "Thêm món";
  $("fName").value = item?.name_pl || "";
  $("fDesc").value = item?.desc_pl || "";
  $("fPrice").value = item?.price ?? "";
  $("fPriceSuffix").value = item?.priceSuffix || "";
  $("fCategory").value = item?.category || "";
  $("fBadge").value = item?.badge || "";
  $("fScreenLock").value = String(item?.screenLock || 0);
  $("fVisible").checked = item ? item.visible !== false : true;
  $("fImageUrl").value = item?.imageUrl || "";
  $("fImageFile").value = "";
  $("uploadStatus").textContent = "";
  $("uploadStatus").style.color = "";

  state.uploadedMediaId = item?.mediaId || "";
  state.uploadedMediaDataUrl = item?.mediaId ? (state.media[item.mediaId]?.dataUrl || "") : "";

  updateImagePickerPreview();
  updateItemLivePreview();
  $("itemModalOverlay").classList.remove("hidden");
  $("fName").focus();
}

function closeItemModal() {
  $("itemModalOverlay").classList.add("hidden");
  state.editingItemId = null;
}

// Thứ tự ưu tiên hiển thị PHẢI khớp với resolveImage() của data-layer:
// URL dán (fImageUrl) thắng ảnh đã tải lên (mediaId) khi cả hai cùng có giá trị.
function pickPreviewSrc() {
  const urlVal = $("fImageUrl").value.trim();
  return urlVal || state.uploadedMediaDataUrl || "";
}

function updateImagePickerPreview() {
  const drop = $("imageDropPreview");
  const src = pickPreviewSrc();
  if (src) {
    drop.innerHTML = `<img src="${escapeAttr(src)}" alt="" onerror="this.parentElement.textContent='🍽️'" />`;
  } else {
    drop.textContent = "🍽️";
  }
}

function updateItemLivePreview() {
  const name = $("fName").value || "Tên món";
  const desc = $("fDesc").value || "";
  const price = parseFloat($("fPrice").value) || 0;
  const suffix = $("fPriceSuffix").value || "";
  const badge = $("fBadge").value || "";

  $("previewName").textContent = name;
  $("previewDesc").textContent = desc;
  $("previewPrice").textContent = formatPriceVi(price, suffix, state.settings.currency);
  const badgeEl = $("previewBadge");
  if (badge) { badgeEl.textContent = badge; badgeEl.classList.remove("hidden"); }
  else badgeEl.classList.add("hidden");

  const imgBox = $("previewImgBox");
  const src = pickPreviewSrc();
  if (src) {
    imgBox.classList.remove("placeholder");
    imgBox.innerHTML = `<img src="${escapeAttr(src)}" alt="" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.classList.add('placeholder');this.parentElement.textContent='🍽️';" />`;
  } else {
    imgBox.classList.add("placeholder");
    imgBox.textContent = "🍽️";
  }
  applyPreviewCardTheme();
}

function applyPreviewCardTheme() {
  const card = $("itemPreviewCard");
  if (!card) return;
  const theme = getActiveThemeResolved();
  card.style.setProperty("--preview-bg", theme.bg || "#0d0d17");
  card.style.setProperty("--preview-text", theme.textColor || "#ffffff");
  card.style.setProperty("--preview-outline", theme.outlineColor || "#000000");
  card.style.setProperty("--preview-outline-w", `${theme.outlineWidth ?? 1}px`);
  card.style.setProperty("--preview-price", theme.priceColor || "#ffd166");
  card.style.setProperty("--preview-accent", theme.accent || "#ff3b57");
  card.style.setProperty("--preview-font-heading", theme.fontHeading || "inherit");
  card.style.setProperty("--preview-font-body", theme.fontBody || "inherit");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Không đọc được tệp ảnh."));
    reader.readAsDataURL(file);
  });
}

async function handleFileSelected(file) {
  const statusEl = $("uploadStatus");
  statusEl.style.color = "";
  statusEl.textContent = "Đang tải ảnh lên…";
  try {
    // Đọc trước bản xem trước cục bộ để hiện ngay — nhanh hơn chờ onMedia echo
    // dữ liệu về từ server (Firestore) sau khi uploadMedia() ghi xong.
    const localDataUrl = await readFileAsDataUrl(file);
    const mediaId = await uploadMedia(file);
    state.uploadedMediaId = mediaId;
    state.uploadedMediaDataUrl = localDataUrl;
    const hasUrl = !!$("fImageUrl").value.trim();
    statusEl.textContent = hasUrl
      ? "✓ Đã tải ảnh lên và nén thành công. Lưu ý: URL đang dán ở trên sẽ được ưu tiên hiển thị — xoá URL nếu muốn dùng ảnh vừa tải."
      : "✓ Đã tải ảnh lên và nén thành công.";
    statusEl.style.color = "var(--good)";
    updateImagePickerPreview();
    updateItemLivePreview();
  } catch (err) {
    statusEl.textContent = "Lỗi: " + (errMsg(err) || "không tải được ảnh (có thể quá dung lượng cho phép).");
    statusEl.style.color = "var(--bad)";
  }
}

async function handleItemFormSubmit(e) {
  e.preventDefault();
  const name = $("fName").value.trim();
  if (!name) { toast("Vui lòng nhập tên món", "err"); return; }
  const price = parseFloat($("fPrice").value);
  if (isNaN(price) || price < 0) { toast("Giá không hợp lệ", "err"); return; }

  const isEdit = !!state.editingItemId;
  const existing = isEdit ? state.items.find((i) => i.id === state.editingItemId) : null;
  const id = isEdit ? state.editingItemId
    : (crypto.randomUUID ? crypto.randomUUID() : "item_" + Date.now() + "_" + Math.random().toString(36).slice(2));

  const maxOrder = state.items.reduce((m, i) => Math.max(m, i.order || 0), 0);
  const item = {
    id,
    name_pl: name,
    desc_pl: $("fDesc").value.trim(),
    price,
    priceSuffix: $("fPriceSuffix").value.trim(),
    category: $("fCategory").value.trim(),
    badge: $("fBadge").value.trim(),
    screenLock: parseInt($("fScreenLock").value, 10) || 0,
    visible: $("fVisible").checked,
    imageUrl: $("fImageUrl").value.trim(),
    mediaId: state.uploadedMediaId || "",
    order: existing ? existing.order : maxOrder + 10,
  };

  const saveBtn = $("itemSaveBtn");
  saveBtn.disabled = true;
  try {
    await saveItem(item);
    if (existing) Object.assign(existing, item);
    else state.items.push(item);
    await bumpRevisionAfterSave();
    toast("Đã lưu món");
    closeItemModal();
    renderItemsTab();
    renderOverview();
    renderLayoutDiagram();
  } catch (err) {
    toast("Lỗi: " + errMsg(err), "err");
  } finally {
    saveBtn.disabled = false;
  }
}

/* =============================================================================
   TAB 3 — BỐ CỤC
   ========================================================================== */
function renderLayoutSegments() {
  document.querySelectorAll("#itemsPerPageSeg button").forEach((b) => {
    b.classList.toggle("active", parseInt(b.dataset.val, 10) === (state.settings.itemsPerPage || 6));
  });
  document.querySelectorAll("#distributionSeg button").forEach((b) => {
    b.classList.toggle("active", b.dataset.val === (state.settings.distribution || "auto"));
  });
}

function renderLayoutControlsFromSettings() {
  if (!$("itemsPerPageSeg")) return;
  renderLayoutSegments();
  setIfNotFocused($("rotationSlider"), state.settings.rotationSeconds || 10);
  $("rotationVal").textContent = `${state.settings.rotationSeconds || 10}s`;
  if (document.activeElement !== $("transitionSelect")) $("transitionSelect").value = state.settings.transition || "fade";
  $("showHeaderToggle").checked = state.settings.showHeader !== false;
  setIfNotFocused($("headerTextInput"), state.settings.headerText_pl || "");
  $("headerTextInput").disabled = state.settings.showHeader === false;
  setIfNotFocused($("currencyInput"), state.settings.currency || "zł");
  const reloadHour = Number.isFinite(state.settings.reloadHour) ? state.settings.reloadHour : 4;
  setIfNotFocused($("reloadHourSlider"), reloadHour);
  $("reloadHourVal").textContent = formatHour(reloadHour);
}

/** "4" -> "04:00" — hiển thị giờ tự tải lại dễ đọc hơn số trần. */
function formatHour(h) {
  const n = Math.min(23, Math.max(0, Math.round(Number(h) || 0)));
  return `${String(n).padStart(2, "0")}:00`;
}

function renderLayoutDiagram() {
  const container = $("layoutDiagram");
  if (!container) return;
  const layout = computeLayout(state.items, state.settings);
  container.innerHTML = [1, 2, 3, 4].map((n) => {
    const pages = layout.screens[n];
    const pagesHtml = pages.length
      ? pages.map((p) => {
          const names = p.items.map((it) => it.name_pl || "(chưa đặt tên)").join(", ") || "(trống)";
          return `<div class="diagram-page"><div class="diagram-page__label">Trang ${p.pageNo}</div><div class="diagram-page__items">${escapeHtml(names)}</div></div>`;
        }).join("")
      : `<div class="diagram-empty">Không có trang — hiện màn hình chờ</div>`;
    return `<div class="diagram-screen">
      <div class="diagram-screen__title"><span>Màn hình ${n}</span><span>${pages.length} trang</span></div>
      ${pagesHtml}
    </div>`;
  }).join("");
}

function initLayoutTab() {
  document.querySelectorAll("#itemsPerPageSeg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = parseInt(btn.dataset.val, 10);
      state.settings.itemsPerPage = val;
      renderLayoutSegments();
      renderLayoutDiagram();
      saveSettingsPatch({ itemsPerPage: val });
    });
  });
  document.querySelectorAll("#distributionSeg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.val;
      state.settings.distribution = val;
      renderLayoutSegments();
      renderLayoutDiagram();
      saveSettingsPatch({ distribution: val });
    });
  });

  const rotationSlider = $("rotationSlider");
  const debouncedRotation = debounce((val) => saveSettingsPatch({ rotationSeconds: val }), 400);
  rotationSlider.addEventListener("input", () => {
    const val = parseInt(rotationSlider.value, 10);
    $("rotationVal").textContent = `${val}s`;
    state.settings.rotationSeconds = val;
    debouncedRotation(val);
  });

  $("transitionSelect").addEventListener("change", (e) => {
    state.settings.transition = e.target.value;
    saveSettingsPatch({ transition: e.target.value });
  });

  const showHeaderToggle = $("showHeaderToggle");
  const headerTextInput = $("headerTextInput");
  showHeaderToggle.addEventListener("change", () => {
    state.settings.showHeader = showHeaderToggle.checked;
    headerTextInput.disabled = !showHeaderToggle.checked;
    saveSettingsPatch({ showHeader: showHeaderToggle.checked });
  });
  const debouncedHeaderText = debounce((val) => saveSettingsPatch({ headerText_pl: val }), 400);
  headerTextInput.addEventListener("input", () => {
    state.settings.headerText_pl = headerTextInput.value;
    debouncedHeaderText(headerTextInput.value);
  });

  const debouncedCurrency = debounce((val) => { saveSettingsPatch({ currency: val }); renderItemsTab(); }, 400);
  $("currencyInput").addEventListener("input", (e) => {
    state.settings.currency = e.target.value;
    debouncedCurrency(e.target.value);
  });

  const reloadHourSlider = $("reloadHourSlider");
  const debouncedReloadHour = debounce((val) => saveSettingsPatch({ reloadHour: val }), 400);
  reloadHourSlider.addEventListener("input", () => {
    const val = parseInt(reloadHourSlider.value, 10);
    $("reloadHourVal").textContent = formatHour(val);
    state.settings.reloadHour = val;
    debouncedReloadHour(val);
  });
}

/* =============================================================================
   TAB 4 — GIAO DIỆN
   ========================================================================== */
const FONT_OPTIONS = ["Bebas Neue", "Poppins", "Playfair Display", "Oswald", "Anton", "Inter", "Nunito", "Roboto", "Lato", "Source Sans Pro"];
const PARTICLE_OPTIONS = [
  ["none", "Không có"], ["snow", "Tuyết"], ["petals", "Cánh hoa"], ["embers", "Than hồng"],
  ["fireworks", "Pháo hoa"], ["leaves", "Lá rơi"], ["bubbles", "Bong bóng"],
];
const EFFECTS_LEVEL_OPTIONS = [["full", "Đầy đủ"], ["lite", "Nhẹ"], ["off", "Tắt"]];

function renderThemeGallery() {
  const gallery = $("themeGallery");
  if (!gallery) return;
  const activeId = state.settings.themeId || "hanabi";
  gallery.innerHTML = Object.entries(THEMES).map(([id, preset]) => {
    const selected = id === activeId;
    const bg = preset.bgGradient || preset.bg || "#000";
    return `
    <button type="button" class="theme-swatch${selected ? " selected" : ""}" data-theme-id="${id}" style="background:${bg};color:${preset.textColor || "#fff"}">
      ${selected ? '<span class="theme-swatch__check">✓</span>' : ""}
      <span class="theme-swatch__name">${escapeHtml(preset.name_vi || id)}</span>
      <span class="theme-swatch__dots">
        <span style="background:${preset.accent || "#fff"}"></span>
        <span style="background:${preset.priceColor || "#fff"}"></span>
        <span style="background:${preset.cardBg || "#0008"}"></span>
      </span>
    </button>`;
  }).join("");
  $("activeThemeName").textContent = THEMES[activeId]?.name_vi || activeId;
}

function toHexColor(v) {
  if (!v) return "#000000";
  if (v.startsWith("#")) return v.length === 7 ? v : "#000000";
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(",").map((s) => parseFloat(s.trim()));
    return "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n || 0))).toString(16).padStart(2, "0")).join("");
  }
  return "#000000";
}

function parseRgba(v) {
  if (!v) return { hex: "#000000", alpha: 0.5 };
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
    const [r, g, b, a] = parts;
    const hex = "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n || 0))).toString(16).padStart(2, "0")).join("");
    return { hex, alpha: a == null ? 1 : a };
  }
  if (v.startsWith("#")) return { hex: v, alpha: 1 };
  return { hex: "#000000", alpha: 0.5 };
}

function hexAlphaToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function colorFieldHtml(key, label, value) {
  const v = value || "#000000";
  return `<div class="override-field" data-key="${key}">
    <label>${escapeHtml(label)}</label>
    <div class="override-color-row">
      <input type="color" data-field="${key}" value="${toHexColor(v)}" />
      <input type="text" data-field-text="${key}" value="${escapeAttr(v)}" />
    </div>
  </div>`;
}
function numberFieldHtml(key, label, value, min, max, step) {
  return `<div class="override-field" data-key="${key}">
    <label>${escapeHtml(label)}</label>
    <input type="number" data-field="${key}" value="${value ?? 0}" min="${min}" max="${max}" step="${step}" />
  </div>`;
}
function selectFieldHtml(key, label, value, options) {
  return `<div class="override-field" data-key="${key}">
    <label>${escapeHtml(label)}</label>
    <select data-field="${key}">
      ${options.map(([val, lab]) => `<option value="${escapeAttr(val)}" ${val === value ? "selected" : ""}>${escapeHtml(lab)}</option>`).join("")}
    </select>
  </div>`;
}
function rgbaFieldHtml(key, label, value) {
  const { hex, alpha } = parseRgba(value);
  return `<div class="override-field" data-key="${key}">
    <label>${escapeHtml(label)}</label>
    <div class="override-color-row">
      <input type="color" data-field="${key}-hex" value="${hex}" />
      <input type="range" data-field="${key}-alpha" min="0" max="1" step="0.05" value="${alpha}" style="flex:1" />
      <span style="font-size:11px;color:var(--text-muted);min-width:32px;text-align:right" data-field-alpha-label="${key}">${Math.round(alpha * 100)}%</span>
    </div>
  </div>`;
}

function renderOverrideGrid() {
  const grid = $("overrideGrid");
  if (!grid) return;
  const resolved = getActiveThemeResolved();
  grid.innerHTML = [
    colorFieldHtml("bg", "Màu nền", resolved.bg),
    colorFieldHtml("textColor", "Màu chữ", resolved.textColor),
    colorFieldHtml("outlineColor", "Màu viền chữ", resolved.outlineColor),
    numberFieldHtml("outlineWidth", "Độ dày viền (px)", resolved.outlineWidth, 0, 6, 1),
    colorFieldHtml("priceColor", "Màu giá", resolved.priceColor),
    rgbaFieldHtml("cardBg", "Màu nền thẻ", resolved.cardBg),
    colorFieldHtml("accent", "Màu nhấn (accent)", resolved.accent),
    selectFieldHtml("fontHeading", "Font tiêu đề", resolved.fontHeading, FONT_OPTIONS.map((f) => [f, f])),
    selectFieldHtml("fontBody", "Font nội dung", resolved.fontBody, FONT_OPTIONS.map((f) => [f, f])),
    selectFieldHtml("particles", "Kiểu hiệu ứng hạt", resolved.particles, PARTICLE_OPTIONS),
    // effectsLevel thuộc settings/global (mục 2), không thuộc themes/{id} — nhưng
    // được đặt ở tab Giao diện theo yêu cầu bố trí UI; lưu đích đúng vẫn là settings.
    selectFieldHtml("effectsLevel", "Mức hiệu ứng", state.settings.effectsLevel || "full", EFFECTS_LEVEL_OPTIONS),
  ].join("");
  wireOverrideFieldEvents();
}

const debouncedSaveThemeOverride = debounce((patch) => persistThemeOverride(patch), 400);
const debouncedSaveEffectsLevel = debounce((level) => saveSettingsPatch({ effectsLevel: level }), 400);

async function persistThemeOverride(patch) {
  const id = state.settings.themeId || "hanabi";
  const merged = { ...(state.themeOverrides[id] || {}), ...patch };
  state.themeOverrides[id] = merged;
  try {
    await saveTheme(id, merged);
    await bumpRevisionAfterSave();
    toast("Đã lưu tuỳ chỉnh theme");
    applyPreviewCardTheme();
  } catch (err) {
    toast("Lỗi: " + errMsg(err), "err");
  }
}

function wireOverrideFieldEvents() {
  const grid = $("overrideGrid");
  grid.querySelectorAll("[data-field]").forEach((input) => {
    const key = input.dataset.field;
    input.addEventListener("input", () => {
      if (key === "effectsLevel") {
        state.settings.effectsLevel = input.value;
        debouncedSaveEffectsLevel(input.value);
        return;
      }
      if (key.endsWith("-hex") || key.endsWith("-alpha")) {
        const base = key.replace(/-hex$|-alpha$/, "");
        const hexInput = grid.querySelector(`[data-field="${base}-hex"]`);
        const alphaInput = grid.querySelector(`[data-field="${base}-alpha"]`);
        const rgba = hexAlphaToRgba(hexInput.value, parseFloat(alphaInput.value));
        const label = grid.querySelector(`[data-field-alpha-label="${base}"]`);
        if (label) label.textContent = `${Math.round(parseFloat(alphaInput.value) * 100)}%`;
        debouncedSaveThemeOverride({ [base]: rgba });
        return;
      }
      let val = input.value;
      if (input.type === "number") val = parseFloat(val) || 0;
      if (input.type === "color") {
        const textSibling = grid.querySelector(`[data-field-text="${key}"]`);
        if (textSibling) textSibling.value = val;
      }
      debouncedSaveThemeOverride({ [key]: val });
    });
  });

  grid.querySelectorAll("[data-field-text]").forEach((input) => {
    const key = input.dataset.fieldText;
    input.addEventListener("change", () => {
      const colorSibling = grid.querySelector(`[data-field="${key}"]`);
      if (colorSibling && /^#[0-9a-fA-F]{6}$/.test(input.value)) colorSibling.value = input.value;
      debouncedSaveThemeOverride({ [key]: input.value });
    });
  });
}

/* =============================================================================
   TAB 5 — XEM TRƯỚC
   ========================================================================== */
function renderPreviewGrid() {
  const grid = $("previewGrid");
  if (!grid) return;
  grid.classList.toggle("has-expanded", !!state.expandedPreview);
  grid.innerHTML = [1, 2, 3, 4].map((n) => `
    <div class="preview-frame${state.expandedPreview === n ? " expanded" : ""}" data-screen="${n}">
      <div class="preview-frame__head">
        <strong>Màn hình ${n}</strong>
        <button type="button" class="btn btn-sm btn-ghost" data-expand="${n}">${state.expandedPreview === n ? "⤢ Thu nhỏ" : "⤢ Phóng to"}</button>
      </div>
      <div class="preview-frame__stage" id="previewStage${n}">
        <iframe id="previewFrame${n}" src="../omh${n}.html?preview=1" loading="lazy" title="Xem trước màn hình ${n}"></iframe>
      </div>
    </div>`).join("");
  requestAnimationFrame(scalePreviewFrames);
}

function scalePreviewFrames() {
  [1, 2, 3, 4].forEach((n) => {
    const stage = $(`previewStage${n}`);
    const iframe = $(`previewFrame${n}`);
    if (!stage || !iframe) return;
    const scale = stage.clientWidth / 1920;
    iframe.style.transform = `scale(${scale})`;
  });
}

/* =============================================================================
   Gắn sự kiện tĩnh (chạy một lần khi khởi động)
   ========================================================================== */
function wireItemsListEvents() {
  const container = $("itemList");
  container.addEventListener("click", (e) => {
    const editBtn = e.target.closest('[data-action="edit"]');
    const dupBtn = e.target.closest('[data-action="dup"]');
    const delBtn = e.target.closest('[data-action="del"]');
    if (editBtn) return openItemModal(editBtn.dataset.id);
    if (dupBtn) return duplicateItem(dupBtn.dataset.id);
    if (delBtn) return deleteItemFlow(delBtn.dataset.id);
    const row = e.target.closest(".item-row");
    if (row && !e.target.closest("input, select, button, label")) openItemModal(row.dataset.id);
  });
  container.addEventListener("change", (e) => {
    const visToggle = e.target.closest(".vis-toggle");
    const lockSelect = e.target.closest(".lock-select");
    if (visToggle) saveItemField(visToggle.dataset.id, { visible: visToggle.checked }, visToggle.checked ? "Đã hiện món" : "Đã ẩn món");
    if (lockSelect) saveItemField(lockSelect.dataset.id, { screenLock: parseInt(lockSelect.value, 10) || 0 }, "Đã cập nhật màn hình ghim");
  });
  container.addEventListener("dragstart", (e) => {
    const row = e.target.closest(".item-row");
    if (!row || !isDndEnabled()) { e.preventDefault(); return; }
    dragSrcId = row.dataset.id;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", row.dataset.id);
  });
  container.addEventListener("dragend", (e) => {
    const row = e.target.closest(".item-row");
    if (row) row.classList.remove("dragging");
    container.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
  });
  container.addEventListener("dragover", (e) => {
    if (!isDndEnabled()) return;
    const row = e.target.closest(".item-row");
    if (!row) return;
    e.preventDefault();
    row.classList.add("drop-target");
  });
  container.addEventListener("dragleave", (e) => {
    const row = e.target.closest(".item-row");
    if (row) row.classList.remove("drop-target");
  });
  container.addEventListener("drop", (e) => {
    e.preventDefault();
    const row = e.target.closest(".item-row");
    if (row) row.classList.remove("drop-target");
    if (!isDndEnabled() || !row || !dragSrcId || dragSrcId === row.dataset.id) return;
    reorderItems(dragSrcId, row.dataset.id);
    dragSrcId = null;
  });
}

function wireStaticEvents() {
  // Điều hướng tab (sidebar + thanh tab di động)
  document.querySelectorAll(".nav-item, #tabbar button").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Đăng nhập / đăng xuất
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    const errEl = $("loginError");
    const btn = $("loginSubmitBtn");
    errEl.classList.add("hidden");
    errEl.textContent = "";
    if (typeof signIn !== "function") {
      errEl.textContent = "Không tìm thấy chức năng đăng nhập (data-layer chưa sẵn sàng).";
      errEl.classList.remove("hidden");
      return;
    }
    btn.disabled = true;
    btn.textContent = "Đang đăng nhập…";
    try {
      await signIn(email, password);
    } catch (err) {
      errEl.textContent = "Đăng nhập thất bại: " + (errMsg(err) || "sai email hoặc mật khẩu.");
      errEl.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = "Đăng nhập";
    }
  });
  $("logoutBtn").addEventListener("click", async () => {
    if (typeof signOutAdmin === "function") {
      try { await signOutAdmin(); } catch (err) { toast("Lỗi đăng xuất: " + errMsg(err), "err"); }
    }
  });

  // Đẩy cập nhật (Tổng quan)
  const pushUpdate = () => saveSettingsPatch({}, "Đã đẩy cập nhật tới 4 màn hình");
  $("pushUpdateBtn").addEventListener("click", pushUpdate);
  $("pushUpdateBtnTop").addEventListener("click", pushUpdate);

  // Món ăn: thêm / tìm kiếm / lọc / modal
  $("addItemBtn").addEventListener("click", () => openItemModal(null));
  $("itemModalClose").addEventListener("click", closeItemModal);
  $("itemModalCancel").addEventListener("click", closeItemModal);
  $("itemModalOverlay").addEventListener("click", (e) => { if (e.target.id === "itemModalOverlay") closeItemModal(); });
  $("itemForm").addEventListener("submit", handleItemFormSubmit);

  $("itemSearch").addEventListener("input", debounce((e) => {
    state.search = e.target.value.trim();
    renderItemsTab();
  }, 200));
  $("categoryFilter").addEventListener("change", (e) => {
    state.categoryFilter = e.target.value;
    renderItemsTab();
  });

  // Ảnh: chọn tệp / dán URL / xoá ảnh đã tải / xem trước trực tiếp
  ["fName", "fDesc", "fPrice", "fPriceSuffix", "fBadge"].forEach((id) => {
    $(id).addEventListener("input", updateItemLivePreview);
  });
  $("fImageUrl").addEventListener("input", () => { updateImagePickerPreview(); updateItemLivePreview(); });
  $("fImageFile").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleFileSelected(file);
  });
  $("clearImageUrlBtn").addEventListener("click", () => {
    $("fImageUrl").value = "";
    $("uploadStatus").style.color = "";
    $("uploadStatus").textContent = state.uploadedMediaDataUrl
      ? "Đã xoá URL — giờ sẽ dùng ảnh đã tải lên."
      : "Đã xoá URL.";
    updateImagePickerPreview();
    updateItemLivePreview();
  });
  $("clearUploadedImgBtn").addEventListener("click", () => {
    state.uploadedMediaId = "";
    state.uploadedMediaDataUrl = "";
    $("fImageFile").value = "";
    $("uploadStatus").style.color = "";
    $("uploadStatus").textContent = "Đã xoá ảnh tải lên.";
    updateImagePickerPreview();
    updateItemLivePreview();
  });

  wireItemsListEvents();
  initLayoutTab();

  // Giao diện: chọn theme + khôi phục mặc định
  $("themeGallery").addEventListener("click", (e) => {
    const btn = e.target.closest(".theme-swatch");
    if (!btn) return;
    const id = btn.dataset.themeId;
    state.settings.themeId = id;
    renderThemeGallery();
    renderOverrideGrid();
    applyPreviewCardTheme();
    saveSettingsPatch({ themeId: id }, "Đã áp dụng theme cho cả 4 màn hình");
  });
  $("resetThemeBtn").addEventListener("click", async () => {
    const id = state.settings.themeId || "hanabi";
    const preset = THEMES[id] || THEMES.hanabi;
    const ok = await showConfirm(
      "Khôi phục mặc định",
      `Khôi phục theme "${preset?.name_vi || id}" về màu gốc? Mọi tuỳ chỉnh riêng sẽ mất.`,
      "Khôi phục",
    );
    if (!ok) return;
    try {
      await saveTheme(id, { ...preset });
      state.themeOverrides[id] = { ...preset };
      await bumpRevisionAfterSave();
      toast("Đã khôi phục mặc định");
      renderOverrideGrid();
      applyPreviewCardTheme();
    } catch (err) {
      toast("Lỗi: " + errMsg(err), "err");
    }
  });

  // Xem trước
  $("reloadAllBtn").addEventListener("click", () => {
    [1, 2, 3, 4].forEach((n) => {
      const iframe = $(`previewFrame${n}`);
      if (iframe) iframe.src = `../omh${n}.html?preview=1&_r=${Date.now()}`;
    });
    toast("Đã tải lại 4 màn hình xem trước");
  });
  $("previewGrid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-expand]");
    if (!btn) return;
    const n = parseInt(btn.dataset.expand, 10);
    state.expandedPreview = state.expandedPreview === n ? null : n;
    renderPreviewGrid();
  });
  window.addEventListener("resize", debounce(scalePreviewFrames, 150));

  // Làm mới "X phút trước" định kỳ dù không thao tác gì
  setInterval(() => { if (state.activeTab === "overview") renderOverview(); }, 20000);
}

/* =============================================================================
   Khởi động
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  wireStaticEvents();
  initAuthGate();
});
