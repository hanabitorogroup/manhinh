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
import { SEED_DATA } from "../assets/js/seed-data.js";

// Số món trong dữ liệu mẫu ĐỌC TRỰC TIẾP từ seed-data.js thay vì gõ tay một
// con số — trước đây panel này hardcode "72 món" (số của bộ món Nhật giả
// định cũ) và không ai sửa lại khi seed-data.js đổi thành thực đơn Oława
// thật (27 món, có variants). Đọc SEED_DATA.menu.length ở đây đảm bảo con số
// hiển thị KHÔNG BAO GIỜ lệch khỏi seed thật, kể cả sau này ai đó thêm/bớt
// món trong seed-data.js mà quên cập nhật admin.js.
const SEED_COUNT = Array.isArray(SEED_DATA?.menu) ? SEED_DATA.menu.length : 0;

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
  // GHI CHÚ — cũng KHÔNG nằm trong bảng "API bắt buộc" mục 4 ARCHITECTURE.md,
  // theo đúng tiền lệ onMedia/resolveImage/resyncServerOffset bên dưới: dùng
  // qua `typeof === 'function'` trước khi gọi, không import cứng bằng tên.
  seedSampleData,
  deleteAllMenuItems,
  runPreflight,
  checkWritePermission,
  // GHI CHÚ — cũng KHÔNG nằm trong bảng "API bắt buộc" mục 4 ARCHITECTURE.md,
  // theo đúng tiền lệ ở trên: dò bằng `typeof === 'function'` trước khi gọi
  // (xem bootApp()). "Chữa" settings/global thiếu field ngay khi admin mở
  // trang — xem JSDoc của hàm này trong data-layer.js.
  healSettingsDefaults,
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
    layout: "grid",
    featuredByScreen: {},
    featuredPosition: "after",
    currency: "zł",
    showHeader: false,
    headerText_pl: "MENU",
    effectsLevel: "full",
    reloadHour: 4,
    displayScalePercent: 100,
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
  preflightChecks: [], // kết quả runPreflight()/checkWritePermission(), xem renderPreflightPanel()
  seedBusy: false, // đang nhập/xoá dữ liệu mẫu -> chặn bấm 2 lần chồng nhau
  // Trình sửa biến thể (variants) — trạng thái LÀM VIỆC tạm thời trong lúc mở
  // modal Thêm/Sửa món, xem deriveVariantEditorState()/buildVariantsPayloadFromEditor().
  // { mode: "none"|"one"|"two", axis1Name, axis2Name, entries[], rows[], cols[], cellPrices{} }
  variantEditor: { mode: "none" },
  // Chế độ biến thể của món NGAY LÚC MỞ modal — dùng để biết chủ quán có chủ
  // động chuyển từ "có biến thể" về "không có" hay không (chỉ khi đó mới thật
  // sự xoá variantAxes/variants lúc lưu — xem handleItemFormSubmit()).
  variantEditorOriginalMode: "none",
};

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
  const n = Number(price);
  const s = Number.isFinite(n)
    ? (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ","))
    : "—";
  // BUG CŨ: `currency || "zł"` coi currency:"" (giá trị HỢP LỆ — nghĩa là tắt
  // hậu tố tiền tệ, xem display.js formatPrice()/currencySuffix()) là thiếu
  // rồi ép về "zł", cùng lỗi với display.js — sửa đồng bộ để bản xem trước
  // trong trang quản trị khớp với màn hình thật. Chỉ null/undefined mới
  // fallback "zł".
  const cur = currency != null ? currency : "zł";
  const curPart = cur ? ` ${cur}` : "";
  return `${s}${curPart}${suffix ? " " + suffix : ""}`;
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
   Preflight — banner chẩn đoán cấu hình Firebase (Blocker 2)
   -----------------------------------------------------------------------------
   Chạy khi !DEMO, ĐỘC LẬP với luồng đăng nhập (initAuthGate) — hiện ngay cả
   khi chưa đăng nhập, vì chính config/Firestore/Auth hỏng có thể là LÝ DO
   không đăng nhập được. Sau khi đăng nhập thành công, bootApp() gọi thêm
   checkWritePermission() và gộp kết quả vào cùng panel này.
   ========================================================================== */
function preflightIcon(status) {
  return status === "ok" ? "✅" : status === "fail" ? "❌" : "⚠️";
}

/** Thêm/ghi đè 1 kết quả kiểm tra (theo id) rồi vẽ lại panel. */
function upsertPreflightCheck(check) {
  if (!check) return;
  const idx = state.preflightChecks.findIndex((c) => c.id === check.id);
  if (idx >= 0) state.preflightChecks[idx] = check;
  else state.preflightChecks.push(check);
  renderPreflightPanel();
}

function renderPreflightPanel() {
  const panel = $("preflightPanel");
  if (!panel) return;
  const checks = state.preflightChecks;
  if (!checks.length) {
    panel.classList.add("hidden");
    return;
  }
  const anyFail = checks.some((c) => c.status === "fail");
  const anyWarn = checks.some((c) => c.status === "warn");
  panel.classList.remove("hidden");
  panel.classList.toggle("panel-fail", anyFail);
  panel.classList.toggle("panel-warn", !anyFail && anyWarn);
  panel.classList.toggle("panel-ok", !anyFail && !anyWarn);
  $("preflightTitle").textContent = anyFail
    ? "⚠️ Phát hiện lỗi cấu hình Firebase — xem chi tiết bên dưới"
    : anyWarn
      ? "Đã kiểm tra kết nối Firebase — một vài mục cần tự kiểm tra thêm"
      : "✅ Kết nối Firebase ổn định";
  $("preflightList").innerHTML = checks.map((c) => `
    <li class="preflight-item ${c.status}">
      <span class="preflight-item__icon">${preflightIcon(c.status)}</span>
      <span class="preflight-item__body">
        <strong>${escapeHtml(c.label)}</strong> — ${escapeHtml(c.message)}
        ${c.fix ? `<div class="preflight-item__fix">👉 ${escapeHtml(c.fix)}</div>` : ""}
      </span>
    </li>`).join("");

  if (!anyFail && !anyWarn) {
    // Không có lỗi nào — tự thu gọn sau vài giây, không cần chủ quán bấm gì.
    clearTimeout(renderPreflightPanel._autoHideTimer);
    renderPreflightPanel._autoHideTimer = setTimeout(() => panel.classList.add("hidden"), 6000);
  } else {
    clearTimeout(renderPreflightPanel._autoHideTimer);
  }
}

/** Chạy (1) config, (2) đọc Firestore, (3) Auth Email/Password — trước khi biết trạng thái đăng nhập. */
async function runPreflightCheckUI() {
  if (DEMO) return;
  if (typeof runPreflight !== "function") return;
  const panel = $("preflightPanel");
  if (panel) {
    panel.classList.remove("hidden");
    $("preflightTitle").textContent = "Đang kiểm tra kết nối Firebase…";
    $("preflightList").innerHTML = "";
  }
  try {
    const result = await runPreflight();
    state.preflightChecks = result.checks || [];
    renderPreflightPanel();
  } catch (err) {
    state.preflightChecks = [{
      id: "preflight-crash", status: "warn", label: "Tự kiểm tra cấu hình",
      message: "Không tự kiểm tra được cấu hình Firebase: " + errMsg(err),
    }];
    renderPreflightPanel();
  }
}

/** Chạy SAU khi đăng nhập thành công — gộp kết quả kiểm tra quyền ghi vào panel đã có. */
async function runPostLoginWriteCheckUI() {
  if (DEMO) return;
  if (typeof checkWritePermission !== "function") return;
  try {
    const check = await checkWritePermission();
    upsertPreflightCheck(check);
  } catch (err) {
    upsertPreflightCheck({
      id: "firestore-write", status: "warn", label: "Quyền ghi Firestore",
      message: "Không tự kiểm tra được quyền ghi: " + errMsg(err),
    });
  }
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
      // Danh sách món trong 4 <select> "món nổi bật" (tab Bố cục) phải khớp
      // với state.items mới nhất — vd món vừa đổi tên/ẩn đi phải cập nhật
      // ngay trong <select>, không đợi admin chuyển tab qua lại.
      renderFeaturedControls();
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
  runPostLoginWriteCheckUI(); // Blocker 2 — gộp kết quả kiểm tra quyền ghi vào panel preflight
  healSettingsOnce(); // Defect fix — settings/global thiếu field (vd chỉ có revision) tự "chữa lành" 1 lần mỗi phiên
}

/**
 * Gọi healSettingsDefaults() đúng 1 lần mỗi lần bootApp() chạy (mỗi lần đăng
 * nhập/tải trang thành công) — KHÔNG gọi lại mỗi khi onSettings() bắn sự
 * kiện, để không tạo vòng lặp đọc/ghi Firestore không cần thiết mỗi lần
 * document đổi (bản thân healSettingsDefaults() đã tự an toàn trước lặp vì
 * chỉ ghi khi thật sự còn field thiếu — xem JSDoc trong data-layer.js — nhưng
 * gọi 1 lần/phiên vẫn là cách dùng đúng, tiết kiệm quota). Không chặn UI: nếu
 * lỗi (mất mạng, thiếu quyền ghi vì admins/<UID> chưa được thêm...) chỉ log
 * ra console, KHÔNG toast lỗi cho admin — đây là hành vi "dọn dẹp nền", 4 màn
 * hình đã có fallback an toàn qua normalizeSettings() nên không có gì khẩn
 * cấp phải làm gián đoạn admin để báo lỗi.
 */
async function healSettingsOnce() {
  if (DEMO) return; // DEMO luôn seed đủ field ngay từ đầu — không có gì để chữa
  if (typeof healSettingsDefaults !== "function") return;
  try {
    const result = await healSettingsDefaults();
    if (result && result.healed) {
      console.info(
        `[admin] Đã tự bổ sung ${result.fields.length} field còn thiếu trong settings/global: ${result.fields.join(", ")}.`
      );
    }
  } catch (err) {
    console.error("[admin] healSettingsDefaults lỗi (bỏ qua):", err);
  }
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
        <dt>Màn hình vật lý</dt><dd>${escapeHtml(st.screenRes || st.res || "—")}</dd>
        <dt>Khung nhìn thực tế (CSS)</dt><dd>${st.viewportRes ? escapeHtml(st.viewportRes) : "—"}</dd>
        <dt>Tỉ lệ điểm ảnh (DPR)</dt><dd>${st.dpr != null ? escapeHtml(String(st.dpr)) : "—"}</dd>
      </dl>
    </div>`;
  }).join("");

  renderSeedPanel();
}

/* =============================================================================
   TAB 1 — Nhập / xoá dữ liệu mẫu ("Thiết lập & dữ liệu mẫu")
   -----------------------------------------------------------------------------
   CHỈ hiện khi !DEMO (ở DEMO, seed đã tự nạp sẵn vào localStorage — xem
   ensureSeeded() trong data-layer.js). Nổi bật khi `menu` đang RỖNG (lần đầu
   kết nối Firebase thật, đúng tình huống chủ quán cần nhất).
   Khi `menu` ĐÃ có dữ liệu, nút "Nhập thực đơn" vẫn hiện THẲNG (không thu gọn)
   — trước đây cả nút nhập LẪN nút xoá cùng nằm sau 1 <details> gập với nhãn
   "🛠️ Công cụ dữ liệu mẫu (nâng cao)", nên chủ quán cần nhập lại thực đơn thật
   (đúng việc cần làm ngay sau khi có Firestore thật) không tìm thấy nút, phải
   hỏi lại. Nút nhập vẫn AN TOÀN khi bấm — showSeedChoiceModal() bên dưới luôn
   chặn lại bằng modal 3 lựa chọn (Thêm vào / Xoá hết rồi nhập lại / Huỷ) khi
   `menu` không rỗng, không có đường nào bấm 1 phát là ghi đè/xoá ngay. CHỈ thao
   tác THẬT SỰ không cần xác nhận thêm nào khác — xoá sạch không kèm nhập lại —
   mới còn giấu sau <details> gập, đúng tinh thần bản gốc: cái gì phá dữ liệu
   không hỏi thêm mới cần rào, cái gì đã có rào riêng thì không cần giấu nữa.
   ========================================================================== */
function renderSeedPanel() {
  const wrap = $("seedPanelWrap");
  if (!wrap) return;
  if (DEMO) {
    wrap.innerHTML = "";
    return;
  }
  const count = state.items.length;
  const seedAvailable = typeof seedSampleData === "function";
  const deleteAvailable = typeof deleteAllMenuItems === "function";
  const seedLabel = `${SEED_COUNT} món`;

  let bodyHtml;
  if (count === 0) {
    bodyHtml = `
    <div class="setup-panel setup-panel--warn">
      <div class="setup-panel__icon">📥</div>
      <div class="setup-panel__body">
        <h4>Firestore chưa có món ăn nào</h4>
        <p>Nhập nhanh thực đơn Oława thật (<strong>${seedLabel}</strong>, kèm biến thể) từ <code>seed-data.js</code> thay vì phải gõ tay từng món — sẵn sàng chạy ngay trên 4 màn hình, phân trang, xoay vòng. Có thể xoá sạch sau đó nếu muốn nhập lại từ đầu.</p>
        <div class="setup-panel__actions">
          <button type="button" class="btn btn-primary" id="seedImportBtn" ${seedAvailable ? "" : "disabled"}>📥 Nhập thực đơn (${seedLabel})</button>
        </div>
      </div>
    </div>`;
  } else {
    bodyHtml = `
    <div class="setup-panel">
      <div class="setup-panel__icon">📥</div>
      <div class="setup-panel__body">
        <h4>Nhập thực đơn Oława</h4>
        <p>Firestore hiện có <strong>${count}</strong> món ăn. Nút này nạp thực đơn Oława thật (<strong>${seedLabel}</strong>, kèm biến thể) từ <code>seed-data.js</code> — dùng để thay thế dữ liệu thử nghiệm cũ hoặc nhập lại món mẫu bị xoá nhầm. Có dữ liệu sẵn rồi sẽ được hỏi lại trước khi ghi đè.</p>
        <div class="setup-panel__actions">
          <button type="button" class="btn btn-primary" id="seedImportBtn" ${seedAvailable ? "" : "disabled"}>📥 Nhập thực đơn (${seedLabel})</button>
        </div>
      </div>
    </div>
    <details class="setup-panel setup-panel--collapsed">
      <summary>🗑️ Xoá toàn bộ dữ liệu (nâng cao)</summary>
      <div class="setup-panel__body">
        <p>Xoá vĩnh viễn toàn bộ <strong>${count}</strong> món ăn hiện có trong Firestore, không nhập lại gì cả. Chỉ dùng khi muốn dọn sạch trước khi tự nhập thực đơn khác.</p>
        <div class="setup-panel__actions">
          <button type="button" class="btn btn-danger" id="seedDeleteBtn" ${deleteAvailable ? "" : "disabled"}>🗑️ Xoá toàn bộ dữ liệu</button>
        </div>
      </div>
    </details>`;
  }

  wrap.innerHTML = `<div class="section-title">Thiết lập &amp; dữ liệu mẫu</div>${bodyHtml}`;
  const importBtn = wrap.querySelector("#seedImportBtn");
  const deleteBtn = wrap.querySelector("#seedDeleteBtn");
  if (importBtn) importBtn.addEventListener("click", openSeedImportFlow);
  if (deleteBtn) deleteBtn.addEventListener("click", openSeedDeleteFlow);
}

function seedProgressShow(initialLabel) {
  state.seedBusy = true;
  const overlay = $("seedProgressModalOverlay");
  $("seedProgressLabel").textContent = initialLabel;
  $("seedProgressBar").style.width = "0%";
  overlay.classList.remove("hidden");
}

function seedProgressUpdate(done, total, label) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  $("seedProgressBar").style.width = `${pct}%`;
  $("seedProgressLabel").textContent = `${label} (${done}/${total})`;
}

function seedProgressHide() {
  state.seedBusy = false;
  $("seedProgressModalOverlay").classList.add("hidden");
}

/** Modal 3 lựa chọn khi `menu` đã có dữ liệu: Thêm vào / Xoá hết rồi nhập lại / Huỷ. */
function showSeedChoiceModal(count) {
  return new Promise((resolve) => {
    $("seedChoiceCount").textContent = String(count);
    // Cả 2 dòng mô tả trong modal đều nhắc số món của SEED_DATA — điền cùng
    // 1 giá trị vào mọi chỗ mang class này thay vì gõ tay số trong HTML tĩnh
    // (xem ghi chú SEED_COUNT ở đầu file: số này phải luôn khớp seed thật).
    document.querySelectorAll(".seed-import-count").forEach((el) => { el.textContent = String(SEED_COUNT); });
    const overlay = $("seedChoiceModalOverlay");
    overlay.classList.remove("hidden");
    const addBtn = $("seedChoiceAddBtn");
    const replaceBtn = $("seedChoiceReplaceBtn");
    const cancelBtn = $("seedChoiceCancelBtn");
    const cleanup = (result) => {
      overlay.classList.add("hidden");
      addBtn.removeEventListener("click", onAdd);
      replaceBtn.removeEventListener("click", onReplace);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlay);
      resolve(result);
    };
    const onAdd = () => cleanup("add");
    const onReplace = () => cleanup("replace");
    const onCancel = () => cleanup(null);
    const onOverlay = (e) => { if (e.target === overlay) cleanup(null); };
    addBtn.addEventListener("click", onAdd);
    replaceBtn.addEventListener("click", onReplace);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlay);
  });
}

async function openSeedImportFlow() {
  if (state.seedBusy) return;
  if (typeof seedSampleData !== "function") {
    toast("Chức năng nhập dữ liệu mẫu chưa sẵn sàng (thiếu data-layer.seedSampleData).", "err");
    return;
  }
  const count = state.items.length;
  let mode = "add";

  if (count > 0) {
    const choice = await showSeedChoiceModal(count);
    if (!choice) return; // Huỷ
    mode = choice;
    if (mode === "replace") {
      const ok2 = await showConfirm(
        "Xác nhận xoá dữ liệu hiện có",
        `Bạn sắp XOÁ VĨNH VIỄN toàn bộ ${count} món ăn đang có trong Firestore, sau đó nhập lại thực đơn Oława thật (${SEED_COUNT} món). Hành động này KHÔNG THỂ HOÀN TÁC. Bạn có chắc chắn muốn tiếp tục?`,
        "Xoá và nhập lại"
      );
      if (!ok2) return;
    }
  } else {
    const ok = await showConfirm(
      "Nhập thực đơn Oława",
      `Thao tác này sẽ ghi ${SEED_COUNT} món của thực đơn Oława thật vào collection "menu" trong Firestore, cùng cấu hình mặc định "settings/global" nếu chưa có. Tiếp tục?`,
      `Nhập ${SEED_COUNT} món`
    );
    if (!ok) return;
  }

  seedProgressShow(mode === "replace" ? "Đang xoá dữ liệu cũ…" : "Đang chuẩn bị ghi dữ liệu mẫu…");
  try {
    const result = await seedSampleData(mode, (done, total, stage) => {
      seedProgressUpdate(done, total, stage === "deleting" ? "Đang xoá dữ liệu cũ…" : "Đang ghi dữ liệu mẫu…");
    });
    seedProgressHide();
    await bumpRevisionAfterSave();
    const extra = result.deleted ? `, đã xoá ${result.deleted} món cũ trước đó` : "";
    toast(`Đã nhập dữ liệu mẫu thành công — ${result.written} tài liệu đã ghi${extra}.`);
  } catch (err) {
    seedProgressHide();
    toast("Lỗi khi nhập dữ liệu mẫu: " + errMsg(err), "err");
  }
}

async function openSeedDeleteFlow() {
  if (state.seedBusy) return;
  if (typeof deleteAllMenuItems !== "function") {
    toast("Chức năng xoá dữ liệu mẫu chưa sẵn sàng (thiếu data-layer.deleteAllMenuItems).", "err");
    return;
  }
  const count = state.items.length;
  if (count === 0) {
    toast("Không có món nào để xoá.");
    return;
  }
  const ok = await showConfirm(
    "Xoá toàn bộ dữ liệu",
    `Bạn sắp XOÁ VĨNH VIỄN toàn bộ ${count} món ăn hiện có trong collection "menu" của Firestore, không nhập lại gì cả. Hành động này KHÔNG THỂ HOÀN TÁC. Bạn có chắc chắn?`,
    "Xoá toàn bộ"
  );
  if (!ok) return;

  seedProgressShow("Đang xoá dữ liệu…");
  try {
    const result = await deleteAllMenuItems((done, total) => {
      seedProgressUpdate(done, total, "Đang xoá dữ liệu…");
    });
    seedProgressHide();
    await bumpRevisionAfterSave();
    toast(`Đã xoá ${result.deleted} món ăn.`);
  } catch (err) {
    seedProgressHide();
    toast("Lỗi khi xoá dữ liệu: " + errMsg(err), "err");
  }
}

/* =============================================================================
   TAB 2 — MÓN ĂN
   ========================================================================== */
/** Đổi thứ tự (▲▼) chỉ hợp lý khi đang xem TOÀN BỘ danh sách theo đúng thứ tự
 * thật (order asc) — khi có tìm kiếm/lọc, danh sách hiển thị là 1 tập con nên
 * "lên/xuống" sẽ không khớp với vị trí thật trong toàn bộ thực đơn. */
function isReorderEnabled() {
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

/** Danh sách variant hợp lệ (có giá là số) của 1 món — dùng ở nhiều nơi. */
function validVariantsOf(item) {
  return Array.isArray(item && item.variants)
    ? item.variants.filter((v) => v && Number.isFinite(Number(v.price)))
    : [];
}

/** "17–23 zł" hoặc "17 zł" nếu mọi biến thể cùng giá. */
function variantPriceRangeText(item, variants) {
  const prices = variants.map((v) => Number(v.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max
    ? formatPriceVi(min, item.priceSuffix, state.settings.currency)
    : `${formatPriceVi(min, "", "")}–${formatPriceVi(max, item.priceSuffix, state.settings.currency)}`;
}

/**
 * Ô "Giá" trong danh sách món:
 *  - Món chỉ có 1 giá (không variants, hoặc variants chỉ có ≤1 lựa chọn thật)
 *    -> ô nhập số SỬA NGAY TẠI CHỖ (tác vụ thường xuyên nhất — đổi giá — không
 *    cần mở form đầy đủ). Lưu khi rời khỏi ô (blur/Enter), xem wireItemsListEvents().
 *  - Món có ≥2 biến thể thật -> nút hiện "N biến thể (khoảng giá)", bấm vào mở
 *    modal Sửa món (trình sửa biến thể — xem renderVariantEditorBody()).
 */
function priceCellHtml(item) {
  const variants = validVariantsOf(item);
  if (variants.length > 1) {
    const range = variantPriceRangeText(item, variants);
    return `<button type="button" class="price-variant-btn" data-action="edit" data-id="${escapeAttr(item.id)}" title="Sửa từng biến thể">
      <span class="price-variant-btn__count">${variants.length} biến thể</span>
      <span class="price-variant-btn__range">${range}</span>
    </button>`;
  }
  const priceVal = Number.isFinite(Number(item.price)) ? Number(item.price) : "";
  return `<div class="price-inline-wrap">
    <input type="number" class="price-inline-input" inputmode="decimal" step="0.01" min="0"
      value="${priceVal}" data-id="${escapeAttr(item.id)}"
      aria-label="Giá món ${escapeAttr(item.name_pl || "")}" />
  </div>`;
}

function itemRowHtml(item, list) {
  const lock = Number(item.screenLock) || 0;
  const reorderOk = isReorderEnabled();
  const idx = list.findIndex((i) => i.id === item.id);
  const atTop = idx <= 0;
  const atBottom = idx === list.length - 1;
  const visible = item.visible !== false;
  return `
  <div class="item-row${visible ? "" : " hidden-item"}" data-id="${escapeAttr(item.id)}">
    <div class="reorder-col">
      <button type="button" class="btn btn-icon btn-ghost reorder-btn" data-action="move-up" data-id="${escapeAttr(item.id)}" title="Chuyển lên" aria-label="Chuyển lên" ${(!reorderOk || atTop) ? "disabled" : ""}>▲</button>
      <button type="button" class="btn btn-icon btn-ghost reorder-btn" data-action="move-down" data-id="${escapeAttr(item.id)}" title="Chuyển xuống" aria-label="Chuyển xuống" ${(!reorderOk || atBottom) ? "disabled" : ""}>▼</button>
    </div>
    ${itemThumbHtml(item)}
    <div class="item-main-mobile">
      <div class="item-name">${escapeHtml(item.name_pl || "(chưa đặt tên)")}</div>
      <div class="item-desc">${escapeHtml(item.desc_pl || "")}</div>
      ${item.badge ? `<span class="item-badge-tag">${escapeHtml(item.badge)}</span>` : ""}
    </div>
    <div class="item-cat">${escapeHtml(item.category || "—")}</div>
    <div class="item-price-col">${priceCellHtml(item)}</div>
    <div class="item-badge-col">${item.badge ? escapeHtml(item.badge) : '<span style="color:var(--text-faint)">—</span>'}</div>
    <div class="item-vis-col">
      <button type="button" class="vis-toggle-btn ${visible ? "is-visible" : "is-hidden"}" data-action="toggle-visible" data-id="${escapeAttr(item.id)}">
        ${visible ? "Đang bán" : "Hết hàng"}
      </button>
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
  $("itemList").innerHTML = list.map((item) => itemRowHtml(item, list)).join("");
  $("itemEmptyState").classList.toggle("hidden", list.length > 0);
  $("dndDisabledHint").classList.toggle("hidden", isReorderEnabled());
}

/**
 * Lưu 1 (hoặc vài) field của 1 món — dùng cho mọi thao tác "1 chạm" trong danh
 * sách (đổi giá tại chỗ, bật/tắt hiện, ghim màn hình). Cập nhật lạc quan
 * (hiện ngay), nhưng nếu lưu thất bại thì KHÔI PHỤC lại giá trị cũ và render
 * lại — "silent failure" (giữ nguyên giá trị mới trên màn hình dù chưa lưu
 * được xuống server) là điều tuyệt đối không được phép, xem yêu cầu "Obvious
 * save state" của chủ quán.
 */
async function saveItemField(id, partial, msg = "Đã lưu") {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  const prevValues = {};
  Object.keys(partial).forEach((k) => { prevValues[k] = it[k]; });
  Object.assign(it, partial);
  renderItemsTab();
  try {
    await saveItem({ ...it });
    await bumpRevisionAfterSave();
    toast(msg);
  } catch (err) {
    Object.assign(it, prevValues);
    renderItemsTab();
    toast("Lỗi: " + errMsg(err) + " — đã khôi phục giá trị cũ.", "err");
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

/**
 * Đổi thứ tự bằng nút ▲▼ (thay cho kéo–thả HTML5 — gần như không dùng được
 * bằng ngón tay trên điện thoại). Chuyển món lên/xuống đúng 1 vị trí so với
 * món liền kề trong danh sách đầy đủ (không lọc) — chỉ hoạt động khi
 * isReorderEnabled() (không đang tìm kiếm/lọc danh mục).
 * @param {string} id
 * @param {"up"|"down"} direction
 */
function moveItem(id, direction) {
  if (!isReorderEnabled()) return;
  const sorted = sortItems(state.items);
  const idx = sorted.findIndex((i) => i.id === id);
  if (idx < 0) return;
  const neighbor = direction === "up" ? sorted[idx - 1] : sorted[idx + 1];
  if (!neighbor) return;
  return reorderItems(id, neighbor.id);
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

/* =============================================================================
   Trình sửa biến thể (variants) — món có variantAxes (0/1/2 trục) + variants[]
   -----------------------------------------------------------------------------
   Toàn bộ chỉnh sửa diễn ra trên state.variantEditor (bản nháp cục bộ, KHÔNG
   đụng tới state.items/Firestore cho tới khi bấm "Lưu món") — nhờ vậy mở modal
   rồi đổi qua lại chế độ/số dòng/số cột không bao giờ làm mất dữ liệu thật cho
   tới khi chủ quán chủ động bấm Lưu, và huỷ modal (Huỷ/✕) không để lại dấu vết.

     mode "none": không có biến thể -> dùng thẳng ô "Giá" (#fPrice) như cũ.
     mode "one" : 1 trục -> danh sách {label, price} thêm/xoá tự do — đúng
                  trường hợp "Dania główne: 5 vị cùng 1 giá" (nút "Áp dụng cho
                  tất cả" bên dưới giải quyết đúng ca này).
     mode "two" : 2 trục -> bảng: hàng = trục 1, cột = trục 2, mỗi ô 1 giá —
                  đúng trường hợp Pho (Białko × Wielkość).
   ========================================================================== */
let _variantIdSeq = 0;
function nextVariantId(prefix) {
  _variantIdSeq += 1;
  return `${prefix}${_variantIdSeq}`;
}

/** Đọc item.variantAxes/variants hiện có -> dựng state làm việc cho trình sửa. */
function deriveVariantEditorState(item) {
  const axes = Array.isArray(item && item.variantAxes) ? item.variantAxes : [];
  const rawVariants = validVariantsOf(item || {});

  if (rawVariants.length <= 1) {
    return { mode: "none" };
  }

  if (axes.length >= 2) {
    const rows = [];
    const rowIndex = new Map();
    const cols = [];
    const colIndex = new Map();
    const cellPrices = {};
    rawVariants.forEach((v) => {
      const a0 = Array.isArray(v.axis) ? String(v.axis[0] ?? "") : "";
      const a1 = Array.isArray(v.axis) ? String(v.axis[1] ?? "") : "";
      if (!rowIndex.has(a0)) { const rid = nextVariantId("r"); rowIndex.set(a0, rid); rows.push({ id: rid, label: a0 }); }
      if (!colIndex.has(a1)) { const cid = nextVariantId("c"); colIndex.set(a1, cid); cols.push({ id: cid, label: a1 }); }
      const rid = rowIndex.get(a0);
      const cid = colIndex.get(a1);
      cellPrices[rid] = cellPrices[rid] || {};
      cellPrices[rid][cid] = Number(v.price);
    });
    return { mode: "two", axis1Name: axes[0] || "", axis2Name: axes[1] || "", rows, cols, cellPrices };
  }

  const entries = rawVariants.map((v) => ({
    id: nextVariantId("e"),
    label: Array.isArray(v.axis) ? String(v.axis[0] ?? "") : "",
    price: Number(v.price),
  }));
  return { mode: "one", axis1Name: axes.length === 1 ? (axes[0] || "") : "", entries };
}

/** { variantAxes, variants, price } sẵn sàng ghi vào Firestore, hoặc null nếu mode "none". */
function buildVariantsPayloadFromEditor(ed) {
  if (!ed || ed.mode === "none") return null;
  if (ed.mode === "one") {
    const variants = ed.entries
      .filter((en) => Number.isFinite(Number(en.price)))
      .map((en) => ({ axis: [String(en.label || "").trim()], price: Number(en.price) }));
    const axisName = String(ed.axis1Name || "").trim();
    const prices = variants.map((v) => v.price);
    return { variantAxes: axisName ? [axisName] : [], variants, price: prices.length ? Math.min(...prices) : 0 };
  }
  const variants = [];
  ed.rows.forEach((r) => {
    ed.cols.forEach((c) => {
      const val = ed.cellPrices[r.id] && ed.cellPrices[r.id][c.id];
      if (Number.isFinite(Number(val))) {
        variants.push({ axis: [String(r.label || "").trim(), String(c.label || "").trim()], price: Number(val) });
      }
    });
  });
  const axis1 = String(ed.axis1Name || "").trim();
  const axis2 = String(ed.axis2Name || "").trim();
  const prices = variants.map((v) => v.price);
  return { variantAxes: [axis1, axis2], variants, price: prices.length ? Math.min(...prices) : 0 };
}

function minPriceOfEditor(ed) {
  const built = buildVariantsPayloadFromEditor(ed);
  if (!built || !built.variants.length) return NaN;
  return Math.min(...built.variants.map((v) => v.price));
}

/** Số lựa chọn "có thật" (có giá hoặc đã đặt tên) — dùng để cảnh báo trước khi xoá. */
function countVariantEditorEntries(ed) {
  if (!ed) return 0;
  if (ed.mode === "one") {
    return ed.entries.filter((e) => Number.isFinite(Number(e.price)) || (e.label && e.label.trim())).length;
  }
  if (ed.mode === "two") {
    let n = 0;
    ed.rows.forEach((r) => ed.cols.forEach((c) => {
      if (Number.isFinite(Number(ed.cellPrices[r.id] && ed.cellPrices[r.id][c.id]))) n++;
    }));
    return n;
  }
  return 0;
}

/** Dựng lại state làm việc khi đổi "Số lượng lựa chọn giá" — cố giữ dữ liệu đã nhập khi có thể. */
function switchVariantEditorMode(oldEd, newMode) {
  if (newMode === "none") return { mode: "none" };

  if (newMode === "one") {
    if (oldEd && oldEd.mode === "one") return oldEd;
    if (oldEd && oldEd.mode === "two") {
      const entries = oldEd.rows.map((r) => {
        const prices = oldEd.cols
          .map((c) => oldEd.cellPrices[r.id] && oldEd.cellPrices[r.id][c.id])
          .map(Number)
          .filter((n) => Number.isFinite(n));
        return { id: r.id, label: r.label, price: prices.length ? Math.min(...prices) : null };
      });
      return { mode: "one", axis1Name: oldEd.axis1Name || "", entries: entries.length ? entries : [{ id: nextVariantId("e"), label: "", price: null }] };
    }
    const flat = parseFloat($("fPrice").value);
    return { mode: "one", axis1Name: "", entries: [{ id: nextVariantId("e"), label: "", price: Number.isFinite(flat) ? flat : null }] };
  }

  // newMode === "two"
  if (oldEd && oldEd.mode === "two") return oldEd;
  if (oldEd && oldEd.mode === "one") {
    const col = { id: nextVariantId("c"), label: "" };
    const rows = oldEd.entries.map((en) => ({ id: en.id, label: en.label }));
    const cellPrices = {};
    oldEd.entries.forEach((en) => { cellPrices[en.id] = { [col.id]: en.price }; });
    return {
      mode: "two", axis1Name: oldEd.axis1Name || "", axis2Name: "",
      rows: rows.length ? rows : [{ id: nextVariantId("r"), label: "" }],
      cols: [col], cellPrices,
    };
  }
  const flat = parseFloat($("fPrice").value);
  const r = { id: nextVariantId("r"), label: "" };
  const c = { id: nextVariantId("c"), label: "" };
  return {
    mode: "two", axis1Name: "", axis2Name: "",
    rows: [r], cols: [c],
    cellPrices: { [r.id]: { [c.id]: Number.isFinite(flat) ? flat : null } },
  };
}

async function handleVariantModeChange(newMode) {
  const ed = state.variantEditor || { mode: "none" };
  if (newMode === ed.mode) return;
  const rank = { none: 0, one: 1, two: 2 };
  if (rank[newMode] < rank[ed.mode]) {
    const count = countVariantEditorEntries(ed);
    if (count > 0) {
      const ok = await showConfirm(
        "Đổi số lượng lựa chọn giá",
        newMode === "none"
          ? `Chuyển về "1 giá duy nhất" sẽ xoá toàn bộ ${count} lựa chọn giá hiện có (chỉ áp dụng sau khi bạn bấm "Lưu món"). Giá thấp nhất hiện tại sẽ được giữ làm giá mới.`
          : `Chuyển về "Một chiều" sẽ gộp lại các lựa chọn hiện có, có thể làm mất một số mức giá khác nhau theo cột. Tiếp tục?`,
        "Tiếp tục",
      );
      if (!ok) return;
    }
  }
  if (newMode === "none") {
    const minP = minPriceOfEditor(ed);
    if (Number.isFinite(minP)) $("fPrice").value = minP;
  }
  state.variantEditor = switchVariantEditorMode(ed, newMode);
  renderVariantModeSeg();
  renderVariantEditorBody();
  updateFlatPriceFieldVisibility();
  updateItemLivePreview();
}

function renderVariantModeSeg() {
  const seg = $("variantModeSeg");
  if (!seg) return;
  const mode = (state.variantEditor && state.variantEditor.mode) || "none";
  seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.val === mode));
}

/** Ô "Giá *" phẳng chỉ còn ý nghĩa (và chỉ còn hiện) ở chế độ "Không có". */
function updateFlatPriceFieldVisibility() {
  const ed = state.variantEditor;
  const isFlat = !ed || ed.mode === "none";
  const wrap = $("flatPriceField");
  if (wrap) wrap.classList.toggle("hidden", !isFlat);
  const input = $("fPrice");
  if (input) input.required = isFlat; // ô ẩn không được cản constraint validation của form
}

function variantSummaryPriceText(ed) {
  const built = buildVariantsPayloadFromEditor(ed);
  if (!built || !built.variants.length) return "—";
  return formatPriceVi(built.price, "", state.settings.currency);
}

function renderOneAxisEditorHtml(ed) {
  return `
  <div class="variant-editor variant-editor--one">
    <p class="field-hint">Giá thấp nhất hiển thị trên màn hình: <strong id="variantSummaryPrice">${variantSummaryPriceText(ed)}</strong> (tự tính từ danh sách bên dưới).</p>
    <div class="field">
      <label for="variantAxis1Name">Tên trục (vd: Vị, Size)</label>
      <input type="text" id="variantAxis1Name" value="${escapeAttr(ed.axis1Name)}" placeholder="VD: Smak" />
    </div>
    <div class="variant-rows" id="variantOneRows">
      ${ed.entries.map((en) => `
        <div class="variant-row" data-entry-id="${en.id}">
          <input type="text" class="variant-row__label" data-entry-id="${en.id}" placeholder="Tên lựa chọn (vd: Pikantne)" value="${escapeAttr(en.label)}" />
          <input type="number" class="variant-row__price" data-entry-id="${en.id}" step="0.01" min="0" placeholder="Giá" value="${en.price ?? ""}" />
          <button type="button" class="variant-row__remove" data-entry-id="${en.id}" title="Xoá lựa chọn" aria-label="Xoá lựa chọn">🗑️</button>
        </div>`).join("")}
    </div>
    <button type="button" class="btn btn-sm" id="variantOneAddBtn">➕ Thêm lựa chọn</button>

    <div class="variant-apply-all">
      <input type="number" id="variantOneApplyPrice" step="0.01" min="0" placeholder="Giá áp dụng cho tất cả" />
      <button type="button" class="btn btn-sm btn-primary" id="variantOneApplyBtn">Áp dụng cho tất cả</button>
    </div>
  </div>`;
}

function renderTwoAxisEditorHtml(ed) {
  return `
  <div class="variant-editor variant-editor--two">
    <p class="field-hint">Giá thấp nhất hiển thị trên màn hình: <strong id="variantSummaryPrice">${variantSummaryPriceText(ed)}</strong> (tự tính từ bảng bên dưới).</p>
    <div class="field-row">
      <div class="field">
        <label for="variantAxis1Name">Tên trục hàng (vd: Białko)</label>
        <input type="text" id="variantAxis1Name" value="${escapeAttr(ed.axis1Name)}" placeholder="VD: Białko" />
      </div>
      <div class="field">
        <label for="variantAxis2Name">Tên trục cột (vd: Wielkość)</label>
        <input type="text" id="variantAxis2Name" value="${escapeAttr(ed.axis2Name)}" placeholder="VD: Wielkość" />
      </div>
    </div>

    <div class="variant-grid-wrap">
      <table class="variant-grid">
        <thead>
          <tr>
            <th></th>
            ${ed.cols.map((c) => `<th>
                <input type="text" class="variant-col__label" data-col-id="${c.id}" value="${escapeAttr(c.label)}" placeholder="Cột" />
                <button type="button" class="variant-col__remove" data-col-id="${c.id}" title="Xoá cột" aria-label="Xoá cột">✕</button>
              </th>`).join("")}
            <th><button type="button" class="btn btn-sm" id="variantAddColBtn">➕ Cột</button></th>
          </tr>
        </thead>
        <tbody>
          ${ed.rows.map((r) => `
            <tr>
              <th>
                <input type="text" class="variant-row__label" data-row-id="${r.id}" value="${escapeAttr(r.label)}" placeholder="Hàng" />
                <button type="button" class="variant-row__remove" data-row-id="${r.id}" title="Xoá hàng" aria-label="Xoá hàng">✕</button>
              </th>
              ${ed.cols.map((c) => {
                const val = (ed.cellPrices[r.id] && ed.cellPrices[r.id][c.id] != null) ? ed.cellPrices[r.id][c.id] : "";
                return `<td><input type="number" class="variant-cell-price" data-row-id="${r.id}" data-col-id="${c.id}" step="0.01" min="0" value="${val}" /></td>`;
              }).join("")}
              <td></td>
            </tr>`).join("")}
          <tr><td colspan="${ed.cols.length + 2}"><button type="button" class="btn btn-sm" id="variantAddRowBtn">➕ Hàng</button></td></tr>
        </tbody>
      </table>
    </div>

    <div class="variant-apply-all">
      <input type="number" id="variantTwoApplyPrice" step="0.01" min="0" placeholder="Giá áp dụng cho mọi ô" />
      <button type="button" class="btn btn-sm btn-primary" id="variantTwoApplyBtn">Áp dụng cho tất cả</button>
    </div>
  </div>`;
}

function renderVariantEditorBody() {
  const wrap = $("variantEditorWrap");
  const body = $("variantEditorBody");
  if (!wrap || !body) return;
  const ed = state.variantEditor;
  const show = ed && ed.mode !== "none";
  wrap.classList.toggle("hidden", !show);
  if (!show) { body.innerHTML = ""; return; }
  body.innerHTML = ed.mode === "one" ? renderOneAxisEditorHtml(ed) : renderTwoAxisEditorHtml(ed);
}

async function removeVariantEntry(ed, entryId) {
  const idx = ed.entries.findIndex((x) => x.id === entryId);
  if (idx < 0) return;
  const en = ed.entries[idx];
  if (Number.isFinite(Number(en.price)) || (en.label && en.label.trim())) {
    const ok = await showConfirm("Xoá lựa chọn", `Xoá lựa chọn "${en.label || "(chưa đặt tên)"}"? Giá của lựa chọn này sẽ mất khi bạn lưu món.`, "Xoá");
    if (!ok) return;
  }
  ed.entries.splice(idx, 1);
  renderVariantEditorBody();
  updateItemLivePreview();
}

async function removeVariantRow(ed, rowId) {
  const idx = ed.rows.findIndex((x) => x.id === rowId);
  if (idx < 0) return;
  const r = ed.rows[idx];
  const hasPrice = ed.cols.some((c) => Number.isFinite(Number(ed.cellPrices[rowId] && ed.cellPrices[rowId][c.id])));
  if (hasPrice || (r.label && r.label.trim())) {
    const ok = await showConfirm("Xoá hàng", `Xoá hàng "${r.label || "(chưa đặt tên)"}"? Toàn bộ giá trong hàng này sẽ mất khi bạn lưu món.`, "Xoá");
    if (!ok) return;
  }
  ed.rows.splice(idx, 1);
  delete ed.cellPrices[rowId];
  renderVariantEditorBody();
  updateItemLivePreview();
}

async function removeVariantCol(ed, colId) {
  const idx = ed.cols.findIndex((x) => x.id === colId);
  if (idx < 0) return;
  const c = ed.cols[idx];
  const hasPrice = ed.rows.some((r) => Number.isFinite(Number(ed.cellPrices[r.id] && ed.cellPrices[r.id][colId])));
  if (hasPrice || (c.label && c.label.trim())) {
    const ok = await showConfirm("Xoá cột", `Xoá cột "${c.label || "(chưa đặt tên)"}"? Toàn bộ giá trong cột này sẽ mất khi bạn lưu món.`, "Xoá");
    if (!ok) return;
  }
  ed.cols.splice(idx, 1);
  ed.rows.forEach((r) => { if (ed.cellPrices[r.id]) delete ed.cellPrices[r.id][colId]; });
  renderVariantEditorBody();
  updateItemLivePreview();
}

/** Gắn sự kiện MỘT LẦN DUY NHẤT lên #variantEditorBody (container tồn tại suốt vòng đời trang,
 * chỉ innerHTML của nó đổi theo render) — input/change cập nhật state trực tiếp KHÔNG render lại
 * toàn bộ (để không mất tiêu điểm/con trỏ đang gõ dở), click cho hành động thêm/xoá/áp dụng mới
 * render lại (thay đổi cấu trúc bảng). */
function wireVariantEditorEvents() {
  const body = $("variantEditorBody");
  if (!body) return;

  body.addEventListener("input", (e) => {
    const ed = state.variantEditor;
    if (!ed) return;
    const t = e.target;
    if (t.id === "variantAxis1Name") { ed.axis1Name = t.value; return; }
    if (t.id === "variantAxis2Name") { ed.axis2Name = t.value; return; }
    if (t.classList.contains("variant-row__label") && t.dataset.entryId) {
      const en = ed.entries.find((x) => x.id === t.dataset.entryId);
      if (en) en.label = t.value;
    } else if (t.classList.contains("variant-row__price") && t.dataset.entryId) {
      const en = ed.entries.find((x) => x.id === t.dataset.entryId);
      if (en) en.price = t.value === "" ? null : parseFloat(t.value);
    } else if (t.classList.contains("variant-row__label") && t.dataset.rowId) {
      const r = ed.rows.find((x) => x.id === t.dataset.rowId);
      if (r) r.label = t.value;
    } else if (t.classList.contains("variant-col__label") && t.dataset.colId) {
      const c = ed.cols.find((x) => x.id === t.dataset.colId);
      if (c) c.label = t.value;
    } else if (t.classList.contains("variant-cell-price")) {
      const rid = t.dataset.rowId;
      const cid = t.dataset.colId;
      ed.cellPrices[rid] = ed.cellPrices[rid] || {};
      ed.cellPrices[rid][cid] = t.value === "" ? null : parseFloat(t.value);
    } else {
      return;
    }
    const summaryEl = $("variantSummaryPrice");
    if (summaryEl) summaryEl.textContent = variantSummaryPriceText(ed);
    updateItemLivePreview();
  });

  body.addEventListener("click", (e) => {
    const ed = state.variantEditor;
    if (!ed) return;

    if (e.target.closest("#variantOneAddBtn")) {
      ed.entries.push({ id: nextVariantId("e"), label: "", price: null });
      renderVariantEditorBody();
      return;
    }
    const removeEntryBtn = e.target.closest(".variant-row__remove[data-entry-id]");
    if (removeEntryBtn) { removeVariantEntry(ed, removeEntryBtn.dataset.entryId); return; }
    if (e.target.closest("#variantOneApplyBtn")) {
      const val = parseFloat($("variantOneApplyPrice").value);
      if (!Number.isFinite(val) || val < 0) { toast("Giá không hợp lệ", "err"); return; }
      ed.entries.forEach((en) => { en.price = val; });
      renderVariantEditorBody();
      updateItemLivePreview();
      toast(`Đã áp dụng ${formatPriceVi(val, "", state.settings.currency)} cho ${ed.entries.length} lựa chọn`);
      return;
    }

    if (e.target.closest("#variantAddRowBtn")) {
      ed.rows.push({ id: nextVariantId("r"), label: "" });
      renderVariantEditorBody();
      return;
    }
    if (e.target.closest("#variantAddColBtn")) {
      ed.cols.push({ id: nextVariantId("c"), label: "" });
      renderVariantEditorBody();
      return;
    }
    const removeRowBtn = e.target.closest(".variant-row__remove[data-row-id]");
    if (removeRowBtn) { removeVariantRow(ed, removeRowBtn.dataset.rowId); return; }
    const removeColBtn = e.target.closest(".variant-col__remove[data-col-id]");
    if (removeColBtn) { removeVariantCol(ed, removeColBtn.dataset.colId); return; }
    if (e.target.closest("#variantTwoApplyBtn")) {
      const val = parseFloat($("variantTwoApplyPrice").value);
      if (!Number.isFinite(val) || val < 0) { toast("Giá không hợp lệ", "err"); return; }
      ed.rows.forEach((r) => {
        ed.cols.forEach((c) => {
          ed.cellPrices[r.id] = ed.cellPrices[r.id] || {};
          ed.cellPrices[r.id][c.id] = val;
        });
      });
      renderVariantEditorBody();
      updateItemLivePreview();
      toast(`Đã áp dụng ${formatPriceVi(val, "", state.settings.currency)} cho toàn bộ ô`);
    }
  });
}

/* ---------- Modal thêm/sửa món ---------- */
function openItemModal(id) {
  state.editingItemId = id || null;
  const isEdit = !!id;
  const item = isEdit ? state.items.find((i) => i.id === id) : null;

  $("itemModalTitle").textContent = isEdit ? "Sửa món" : "Thêm món";
  $("fName").value = item?.name_pl || "";
  $("fDesc").value = item?.desc_pl || "";
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

  const editorState = deriveVariantEditorState(item);
  state.variantEditor = editorState;
  state.variantEditorOriginalMode = editorState.mode;
  $("fPrice").value = editorState.mode === "none" ? (item?.price ?? "") : "";
  renderVariantModeSeg();
  renderVariantEditorBody();
  updateFlatPriceFieldVisibility();

  updateImagePickerPreview();
  updateItemLivePreview();
  $("itemModalOverlay").classList.remove("hidden");
  $("fName").focus();
}

function closeItemModal() {
  $("itemModalOverlay").classList.add("hidden");
  state.editingItemId = null;
  state.variantEditor = { mode: "none" };
  state.variantEditorOriginalMode = "none";
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
  const suffix = $("fPriceSuffix").value || "";
  const badge = $("fBadge").value || "";

  let desc = $("fDesc").value || "";
  let price;
  const ed = state.variantEditor;
  if (ed && ed.mode !== "none") {
    const built = buildVariantsPayloadFromEditor(ed);
    const count = built ? built.variants.length : 0;
    price = built ? built.price : 0;
    if (count > 0) desc = `${count} biến thể — xem chi tiết ở màn hình thật`;
  } else {
    price = parseFloat($("fPrice").value) || 0;
  }

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

  const ed = state.variantEditor || { mode: "none" };
  let variantResult = null;
  let price;
  if (ed.mode !== "none") {
    variantResult = buildVariantsPayloadFromEditor(ed);
    if (!variantResult || variantResult.variants.length === 0) {
      toast('Vui lòng nhập ít nhất 1 giá cho biến thể, hoặc chuyển "Số lượng lựa chọn giá" về "Không có".', "err");
      return;
    }
    price = variantResult.price;
  } else {
    price = parseFloat($("fPrice").value);
  }
  if (isNaN(price) || price < 0) { toast("Giá không hợp lệ", "err"); return; }

  const isEdit = !!state.editingItemId;
  const existing = isEdit ? state.items.find((i) => i.id === state.editingItemId) : null;
  const id = isEdit ? state.editingItemId
    : (crypto.randomUUID ? crypto.randomUUID() : "item_" + Date.now() + "_" + Math.random().toString(36).slice(2));

  const maxOrder = state.items.reduce((m, i) => Math.max(m, i.order || 0), 0);
  // Trải `...existing` TRƯỚC — bảo toàn mọi field mà form này không có ô riêng
  // (spicy/vege/best…). variantAxes/variants CÓ ô riêng (trình sửa biến thể ở
  // trên) nên được ghi đè tường minh bên dưới — KHÔNG dựa vào spread này cho
  // 2 field đó, để tránh vừa spread giá trị cũ vừa gán giá trị mới chồng lên
  // nhau gây nhầm lẫn thứ tự.
  const item = {
    ...(existing || {}),
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

  if (variantResult) {
    // Đang ở chế độ "Một chiều"/"Hai chiều" -> LUÔN ghi lại variantAxes/variants
    // từ trình sửa (round-trip đầy đủ: không đổi gì thì viết lại y hệt dữ liệu
    // cũ; đổi 1 giá thì chỉ giá đó đổi, phần còn lại giữ nguyên).
    item.variantAxes = variantResult.variantAxes;
    item.variants = variantResult.variants;
  } else if (state.variantEditorOriginalMode && state.variantEditorOriginalMode !== "none") {
    // Chủ quán đã CHỦ ĐỘNG chuyển từ "có biến thể" về "Không có" (đã được hỏi
    // xác nhận ở handleVariantModeChange) -> xoá thật sự, không chỉ ẩn UI.
    item.variantAxes = [];
    item.variants = [];
  }
  // Nếu mode "none" ngay từ đầu (chưa từng có variants) -> không đụng tới 2
  // field này, giữ nguyên hành vi cũ với document cũ chỉ có `price` phẳng.

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
  const layoutMode = state.settings.layout === "grid+featured" ? "grid+featured" : "grid";
  document.querySelectorAll("#layoutModeSeg button").forEach((b) => {
    b.classList.toggle("active", b.dataset.val === layoutMode);
  });
  document.querySelectorAll("#featuredPositionSeg button").forEach((b) => {
    b.classList.toggle("active", b.dataset.val === (state.settings.featuredPosition || "after"));
  });
  const featuredCard = $("featuredCard");
  if (featuredCard) featuredCard.hidden = layoutMode !== "grid+featured";
}

/**
 * Vẽ 4 select "món nổi bật theo từng màn hình" (Option 2 "grid+featured") —
 * xem pagination.js computeScreenPages()/JSDoc "mô hình trang" để hiểu ĐÚNG
 * những gì admin sắp xếp lại được ở đây (CHỈ chọn món + CHỈ 1 vị trí
 * before/after áp dụng chung cho cả 4 màn — KHÔNG có danh sách trang tự do
 * kéo-thả, cố tình giữ đơn giản theo yêu cầu "không phát minh page-builder
 * nặng"). Gọi lại mỗi khi state.items đổi (renderItemsTab()) để danh sách
 * món trong <select> luôn khớp món/tên hiện có.
 */
function renderFeaturedControls() {
  const grid = $("featuredScreenGrid");
  if (!grid) return;
  const visibleItems = sortItems(state.items.filter((i) => i.visible !== false));
  const featuredByScreen = state.settings.featuredByScreen || {};
  const options = `<option value="">— Không chọn —</option>` + visibleItems
    .map((it) => `<option value="${escapeAttr(it.id)}">${escapeHtml(it.name_pl || "(chưa đặt tên)")}</option>`)
    .join("");
  grid.innerHTML = [1, 2, 3, 4].map((n) => {
    const current = featuredByScreen[n] || featuredByScreen[String(n)] || "";
    return `<div class="featured-screen-item">
      <label>Màn hình ${n}</label>
      <select data-screen="${n}">${options}</select>
    </div>`;
  }).join("");
  grid.querySelectorAll("select[data-screen]").forEach((sel) => {
    const n = sel.dataset.screen;
    sel.value = featuredByScreen[n] || featuredByScreen[String(n)] || "";
    sel.addEventListener("change", () => {
      const next = { ...(state.settings.featuredByScreen || {}) };
      if (sel.value) next[n] = sel.value; else delete next[n];
      state.settings.featuredByScreen = next;
      renderLayoutDiagram();
      saveSettingsPatch({ featuredByScreen: next });
    });
  });
}

function renderLayoutControlsFromSettings() {
  if (!$("itemsPerPageSeg")) return;
  renderLayoutSegments();
  renderFeaturedControls();
  setIfNotFocused($("rotationSlider"), state.settings.rotationSeconds || 10);
  $("rotationVal").textContent = `${state.settings.rotationSeconds || 10}s`;
  if (document.activeElement !== $("transitionSelect")) $("transitionSelect").value = state.settings.transition || "fade";
  // Mặc định TẮT (xem DEFAULT_SETTINGS ở data-layer.js) — chỉ bật ô tick khi
  // giá trị lưu thật là showHeader:true, không suy đoán khi field vắng mặt.
  $("showHeaderToggle").checked = state.settings.showHeader === true;
  setIfNotFocused($("headerTextInput"), state.settings.headerText_pl || "");
  $("headerTextInput").disabled = state.settings.showHeader !== true;
  setIfNotFocused($("currencyInput"), state.settings.currency != null ? state.settings.currency : "zł");
  const reloadHour = Number.isFinite(state.settings.reloadHour) ? state.settings.reloadHour : 4;
  setIfNotFocused($("reloadHourSlider"), reloadHour);
  $("reloadHourVal").textContent = formatHour(reloadHour);
  const displayScale = Number.isFinite(state.settings.displayScalePercent) ? state.settings.displayScalePercent : 100;
  setIfNotFocused($("displayScaleSlider"), displayScale);
  $("displayScaleVal").textContent = formatDisplayScale(displayScale);
}

/** 100 -> "100% (Tự động)", số khác -> "110%" — nhấn mạnh 100 là mặc định an toàn. */
function formatDisplayScale(percent) {
  const n = Math.min(125, Math.max(80, Math.round(Number(percent) || 100)));
  return n === 100 ? "100% (Tự động)" : `${n}%`;
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
          const isFeatured = !!(p.items && p.items.featured);
          const names = p.items.map((it) => it.name_pl || "(chưa đặt tên)").join(", ") || "(trống)";
          const cls = isFeatured ? "diagram-page diagram-page--featured" : "diagram-page";
          const label = isFeatured ? `⭐ Trang nổi bật` : `Trang ${p.pageNo}`;
          return `<div class="${cls}"><div class="diagram-page__label">${label}</div><div class="diagram-page__items">${escapeHtml(names)}</div></div>`;
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

  document.querySelectorAll("#layoutModeSeg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.val;
      state.settings.layout = val;
      renderLayoutSegments();
      renderFeaturedControls();
      renderLayoutDiagram();
      saveSettingsPatch({ layout: val });
    });
  });

  document.querySelectorAll("#featuredPositionSeg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.val;
      state.settings.featuredPosition = val;
      renderLayoutSegments();
      renderLayoutDiagram();
      saveSettingsPatch({ featuredPosition: val });
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

  // "Cỡ hiển thị" — hệ số nhân toàn bộ rem trên CẢ 4 màn hình (xem
  // display.css `html{font-size}` + applyDisplayScale() trong display.js).
  // Kẹp CỨNG bằng thuộc tính min/max trên chính <input type="range"> (80-125)
  // — người dùng KHÔNG THỂ kéo ra ngoài khoảng an toàn, và display.js
  // normalizeSettings() kẹp lại LẦN NỮA phía màn hình thật (2 lớp phòng thủ:
  // 1 lớp UI + 1 lớp dữ liệu, phòng trường hợp ghi thẳng vào Firestore ngoài
  // admin). "Về Tự động" (nút reset) LUÔN đưa được về 100% — không có ngưỡng
  // nào khiến chủ quán "kẹt" không sửa lại được qua chính trang admin.
  const displayScaleSlider = $("displayScaleSlider");
  const debouncedDisplayScale = debounce((val) => saveSettingsPatch({ displayScalePercent: val }), 400);
  displayScaleSlider.addEventListener("input", () => {
    const val = parseInt(displayScaleSlider.value, 10);
    $("displayScaleVal").textContent = formatDisplayScale(val);
    state.settings.displayScalePercent = val;
    debouncedDisplayScale(val);
  });
  $("displayScaleResetBtn").addEventListener("click", () => {
    displayScaleSlider.value = "100";
    $("displayScaleVal").textContent = formatDisplayScale(100);
    state.settings.displayScalePercent = 100;
    saveSettingsPatch({ displayScalePercent: 100 }, "Đã đưa cỡ hiển thị về Tự động (100%)");
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
   -----------------------------------------------------------------------------
   Bug đã vá (điện thoại bị Safari giết tab admin do lặp reload): tab này từng
   mount CẢ 4 iframe omhN.html?preview=1 cùng lúc, mỗi iframe tự vẽ canvas hạt
   + rAF riêng. Trên điện thoại, 4 vòng lặp đó đủ nặng để bị hệ điều hành
   throttle, kích hoạt watchdog reload bên trong display.js (nay đã tắt hẳn ở
   preview — xem display.js) — nhưng dù watchdog đã tắt, 4 canvas-animating
   iframe cùng lúc vẫn là tải nặng không cần thiết cho một khung xem trước thu
   nhỏ. Hai biện pháp giảm tải ở đây:
     1) Lazy-load THẬT bằng IntersectionObserver: iframe chỉ gán `src` (tức
        mới thật sự tải + chạy JS) khi ô xem trước của nó lọt vào viewport
        (hoặc khi người dùng bấm "Phóng to"). Trên điện thoại, lưới xếp 1 cột
        (xem admin.css @900px) nên ban đầu thường chỉ 1-2 ô lọt viewport —
        giảm trực tiếp số iframe "sống" cùng lúc thay vì cả 4.
     2) Ép `&safe=1` (tắt hẳn canvas hạt, xem display.js isSafe) cho các
        iframe xem trước khi viewport là kích thước điện thoại (cùng ngưỡng
        900px với layout 1 cột) — bố cục/món ăn/giá/theme màu vẫn hiển thị
        đúng 100% (đó là thứ chủ quán cần soát), chỉ tắt hoạt ảnh hạt trang
        trí vốn không quan trọng bằng và là nguồn tải CPU/GPU liên tục lớn
        nhất trên máy yếu. Trên desktop/tablet vẫn giữ hiệu ứng đầy đủ.
   ========================================================================== */
let previewObserver = null;

function isMobilePreviewViewport() {
  try {
    return window.matchMedia && window.matchMedia("(max-width: 900px)").matches;
  } catch (e) {
    return false;
  }
}

function previewFrameSrc(n, opts) {
  const bust = opts && opts.bust ? `&_r=${Date.now()}` : "";
  const safe = isMobilePreviewViewport() ? "&safe=1" : "";
  return `../omh${n}.html?preview=1${safe}${bust}`;
}

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
      <div class="preview-frame__stage" id="previewStage${n}" data-screen="${n}">
        <iframe id="previewFrame${n}" data-screen="${n}" title="Xem trước màn hình ${n}"></iframe>
      </div>
    </div>`).join("");
  requestAnimationFrame(scalePreviewFrames);
  setupPreviewLazyLoad();
  // Ô đang "phóng to" bị các ô khác `display:none` (CSS .has-expanded) nên sẽ
  // KHÔNG giao với viewport theo IntersectionObserver nếu bản thân nó cũng
  // đang display:none trước khi expand — ép tải ngay, không chờ observer.
  if (state.expandedPreview) loadPreviewFrame(state.expandedPreview);
}

function setupPreviewLazyLoad() {
  if (previewObserver) {
    previewObserver.disconnect();
    previewObserver = null;
  }
  const stages = [1, 2, 3, 4].map((n) => $(`previewStage${n}`)).filter(Boolean);
  if (typeof IntersectionObserver !== "function") {
    // Trình duyệt không hỗ trợ IO (hiếm) — tải hết ngay, không giữ chân
    // người dùng khỏi xem trước chỉ vì thiếu API tối ưu tải.
    [1, 2, 3, 4].forEach(loadPreviewFrame);
    return;
  }
  previewObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const n = parseInt(entry.target.dataset.screen, 10);
        if (Number.isFinite(n)) loadPreviewFrame(n);
      });
    },
    { rootMargin: "200px 0px" } // tải sớm một chút trước khi lọt hẳn vào khung nhìn để cuộn không bị giật
  );
  stages.forEach((stage) => previewObserver.observe(stage));
}

function loadPreviewFrame(n, opts) {
  const iframe = $(`previewFrame${n}`);
  if (!iframe) return;
  if (iframe.dataset.loaded === "1" && !(opts && opts.force)) return;
  iframe.dataset.loaded = "1";
  iframe.src = previewFrameSrc(n, opts);
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
/** Đổi 1 ô giá nhập tại chỗ (trong danh sách) thành lệnh lưu — validate + revert khi sai. */
function commitInlinePrice(input) {
  const id = input.dataset.id;
  const val = parseFloat(input.value);
  if (!Number.isFinite(val) || val < 0) {
    toast("Giá không hợp lệ", "err");
    renderItemsTab(); // khôi phục ô về giá trị đã lưu trước đó
    return;
  }
  const it = state.items.find((x) => x.id === id);
  if (it && Number(it.price) === val) return; // không đổi -> không gọi lưu vô ích
  saveItemField(id, { price: val }, "Đã lưu giá");
}

function wireItemsListEvents() {
  const container = $("itemList");
  container.addEventListener("click", (e) => {
    const editBtn = e.target.closest('[data-action="edit"]');
    const dupBtn = e.target.closest('[data-action="dup"]');
    const delBtn = e.target.closest('[data-action="del"]');
    const upBtn = e.target.closest('[data-action="move-up"]');
    const downBtn = e.target.closest('[data-action="move-down"]');
    const visBtn = e.target.closest('[data-action="toggle-visible"]');
    if (editBtn) return openItemModal(editBtn.dataset.id);
    if (dupBtn) return duplicateItem(dupBtn.dataset.id);
    if (delBtn) return deleteItemFlow(delBtn.dataset.id);
    if (upBtn) return moveItem(upBtn.dataset.id, "up");
    if (downBtn) return moveItem(downBtn.dataset.id, "down");
    if (visBtn) {
      const it = state.items.find((x) => x.id === visBtn.dataset.id);
      if (!it) return;
      const nextVisible = it.visible === false; // đang ẩn -> bấm để hiện, và ngược lại
      return saveItemField(visBtn.dataset.id, { visible: nextVisible }, nextVisible ? "Đã hiện món (đang bán)" : "Đã ẩn món (hết hàng)");
    }
    const row = e.target.closest(".item-row");
    if (row && !e.target.closest("input, select, button, label")) openItemModal(row.dataset.id);
  });
  container.addEventListener("change", (e) => {
    const lockSelect = e.target.closest(".lock-select");
    const priceInput = e.target.closest(".price-inline-input");
    if (lockSelect) saveItemField(lockSelect.dataset.id, { screenLock: parseInt(lockSelect.value, 10) || 0 }, "Đã cập nhật màn hình ghim");
    if (priceInput) commitInlinePrice(priceInput);
  });
  // Enter trong ô giá tại chỗ = xong việc, rời khỏi ô để kích hoạt lưu (change) —
  // không cần bấm "lưu" nào khác, đúng luồng "2-3 chạm" khi đổi giá trên điện thoại.
  container.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.closest(".price-inline-input")) {
      e.preventDefault();
      e.target.blur();
    }
  });
}

function wireStaticEvents() {
  // Preflight (Blocker 2): ẩn banner, ghim lại nếu người dùng đang xem lỗi
  // (không tự động ẩn nữa trong phiên này để không "chớp" mất thông tin).
  const preflightDismiss = $("preflightDismiss");
  if (preflightDismiss) {
    preflightDismiss.addEventListener("click", () => {
      $("preflightPanel").classList.add("hidden");
    });
  }

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

  // Trình sửa biến thể (variants): chuyển chế độ + wiring 1 lần cho bảng/danh sách
  $("variantModeSeg").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-val]");
    if (!btn) return;
    handleVariantModeChange(btn.dataset.val);
  });
  wireVariantEditorEvents();

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

  // Xem trước — nút này là hành động CHỦ ĐỘNG của người dùng (không phải tự
  // healing), nên tải lại thẳng cả 4 kể cả ô chưa từng lọt viewport; vẫn tôn
  // trọng safe=1 trên điện thoại qua previewFrameSrc().
  $("reloadAllBtn").addEventListener("click", () => {
    [1, 2, 3, 4].forEach((n) => loadPreviewFrame(n, { force: true, bust: true }));
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
  runPreflightCheckUI(); // Blocker 2 — độc lập với đăng nhập, chạy song song
  initAuthGate();
});
