// =============================================================================
// display.js — Vòng đời màn hình menu điện tử (Hanabi & Toro)
// -----------------------------------------------------------------------------
// Xuất ra duy nhất: bootDisplay(screenId)
// 4 file omh1..4.html chỉ gọi bootDisplay(N) — TOÀN BỘ logic nằm ở đây:
// subscribe dữ liệu → phân trang → render tại chỗ → xoay vòng đồng bộ đồng hồ
// tuyệt đối → heartbeat → chống lưu ảnh → phòng thủ khi mất kết nối.
//
// Ghi chú quan trọng: theo hợp đồng ARCHITECTURE.md mục 4, data-layer.js chỉ
// CAM KẾT xuất initData/onSettings/onMenu/onThemes/onStatus/saveSettings/
// saveItem/deleteItem/saveTheme/uploadMedia/heartbeat/getServerOffsetMs/DEMO.
// Không có `onMedia` trong hợp đồng. Vì vậy ta import các hàm đã cam kết bằng
// named import (an toàn), còn `onMedia` (nếu agent kia có bổ sung) được dò tìm
// qua namespace import — KHÔNG import trực tiếp bằng tên để tránh lỗi liên kết
// module nếu hàm đó chưa tồn tại (một named import trỏ tới export không có sẽ
// làm cả module sập ngay từ đầu — tuyệt đối tránh vì yêu cầu "không bao giờ để
// màn hình trống").
// =============================================================================

import {
  initData,
  onSettings,
  onMenu,
  onThemes,
  heartbeat,
  getServerOffsetMs,
} from "./data-layer.js";
import * as DataLayerNS from "./data-layer.js";
import { THEMES, applyTheme } from "./themes.js";
import { startParticles, stopParticles } from "./effects.js";
import { computeScreenPages } from "./pagination.js";

const HEARTBEAT_MS = 60000;
const RETRY_BASE_MS = 3000;
const RETRY_MAX_MS = 30000;
const LAYER_TRANSITION_MS = 800; // khớp với --layer-delay / thời lượng CSS transition dài nhất

// ---------------------------------------------------------------------------
// Hardening chạy 24/7 (mục "Problem 4" — phần cứng signage yếu, không ai
// đứng cạnh reset thủ công): tự tải lại đêm để dọn bộ nhớ WebView, watchdog
// khi vòng lặp render bị treo, và đồng bộ lại đồng hồ server định kỳ để bù
// trôi đồng hồ Android chạy nhiều tuần không tắt.
// ---------------------------------------------------------------------------
const CLOCK_RESYNC_MS = 60 * 60 * 1000; // 1 giờ/lần — đủ bù trôi đồng hồ, không tốn quota Firestore
const RELOAD_CHECK_MS = 60 * 1000; // kiểm tra mỗi phút có tới đúng "giờ tĩnh lặng" để tự tải lại không
const WATCHDOG_CHECK_MS = 10 * 1000;
const WATCHDOG_TIMEOUT_MS = 90 * 1000; // ~90s không "tick" -> coi như treo, tự tải lại

const RESTAURANT_NAME = "Hanabi & Toro";
const RESTAURANT_TAGLINE = "Sushi i Kuchnia Japońska";

// Glyph (emoji hệ thống) hiển thị cho món chưa có ảnh, không cần font ngoài
const CATEGORY_GLYPH = {
  ramen: "🍜",
  sushi: "🍣",
  sashimi: "🍣",
  donburi: "🍚",
  grill: "🍢",
  yakitori: "🍢",
  dessert: "🍡",
  drink: "🍵",
  napoje: "🍵",
  soup: "🥣",
  zupa: "🥣",
  curry: "🍛",
  default: "🍽",
};

const FALLBACK_THEME = {
  bg: "#0a0a0a",
  bgGradient: "",
  textColor: "#f5f0e6",
  outlineColor: "#000000",
  outlineWidth: 2,
  accent: "#c0392b",
  priceColor: "#ffd166",
  cardBg: "rgba(0,0,0,.4)",
  fontHeading: "Bebas Neue",
  fontBody: "Segoe UI",
  particles: "none",
  overlayImage: "",
};

/**
 * Khởi động một màn hình hiển thị.
 * @param {number} screenId - SCREEN_ID mặc định (1..4), có thể bị ghi đè bởi ?screen=
 */
export function bootDisplay(screenId) {
  const params = new URLSearchParams(location.search);
  const screenOverride = parseInt(params.get("screen"), 10);
  const SCREEN_ID =
    Number.isFinite(screenOverride) && screenOverride >= 1 && screenOverride <= 4
      ? screenOverride
      : screenId;
  const isPreview = params.get("preview") === "1";
  const isSafe = params.get("safe") === "1";

  const els = {
    app: document.getElementById("app"),
    canvas: document.getElementById("fx"),
    header: document.getElementById("menu-header"),
    gridStage: document.getElementById("grid"),
    idle: document.getElementById("idle"),
    err: document.getElementById("conn-error"),
  };

  if (!els.app || !els.gridStage) {
    // Không có khung DOM tối thiểu — không thể làm gì thêm, tránh ném lỗi vô ích.
    return;
  }

  if (els.app.dataset.screen === String(SCREEN_ID) && els.app.dataset.booted === "1") {
    return; // tránh bootDisplay chạy trùng nếu bị gọi 2 lần
  }
  els.app.dataset.screen = String(SCREEN_ID);
  els.app.dataset.booted = "1";
  if (isSafe) els.app.classList.add("safe-mode");

  // Double-buffer 2 layer để chuyển trang mượt (fade/slide/flip/curtain)
  const layerA = document.createElement("div");
  const layerB = document.createElement("div");
  layerA.className = "menu-grid-layer layer-hidden";
  layerB.className = "menu-grid-layer layer-hidden";
  els.gridStage.appendChild(layerA);
  els.gridStage.appendChild(layerB);

  const state = {
    settings: null,
    items: [],
    themesOverride: {},
    mediaMap: {},
    screenPages: [],
    currentPageIndex: -1,
    lastTick: null,
    contentDirty: false,
    offsetMs: 0,
    rafId: null,
    lastFrameAt: Date.now(), // watchdog: cập nhật mỗi khung hình render
    heartbeatTimer: null,
    resyncTimer: null,
    reloadCheckTimer: null,
    watchdogTimer: null,
    themeApplied: null,
    activeLayer: null, // "A" | "B" | null
    idleShown: null, // null = chưa xác định, true/false = đã set
    connFailed: false,
  };

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  connectLoop();

  async function connectLoop() {
    let attempt = 0;
    for (;;) {
      try {
        await initData();
        state.connFailed = false;
        showConnError(false);
        try {
          state.offsetMs = getServerOffsetMs ? getServerOffsetMs() || 0 : 0;
        } catch (e) {
          state.offsetMs = 0;
        }
        break;
      } catch (err) {
        attempt++;
        state.connFailed = true;
        showConnError(true);
        const wait = Math.min(RETRY_BASE_MS * attempt, RETRY_MAX_MS);
        await sleep(wait);
      }
    }

    subscribeAll();
    startRotationLoop();
    if (!isPreview) startHeartbeat();
    startMaintenanceTimers();
  }

  // ---------------------------------------------------------------------
  // Hardening 24/7: đồng bộ lại đồng hồ server, tự tải lại đêm, watchdog.
  // ---------------------------------------------------------------------
  function startMaintenanceTimers() {
    // Đồng bộ lại serverOffsetMs mỗi giờ — đồng hồ Android có thể trôi sau
    // nhiều tuần chạy liên tục, mà 4 màn hình dựa vào offset này để lật trang
    // cùng lúc (đồng hồ tuyệt đối, mục 3 ARCHITECTURE.md). Bỏ qua ở
    // ?preview=1 để không tốn thêm quota Firestore cho các iframe xem trước.
    if (!isPreview) {
      state.resyncTimer = setInterval(() => {
        if (typeof DataLayerNS.resyncServerOffset !== "function") return;
        Promise.resolve(DataLayerNS.resyncServerOffset())
          .then((off) => {
            if (typeof off === "number" && Number.isFinite(off)) state.offsetMs = off;
          })
          .catch(() => {
            /* lỗi mạng tạm thời — giữ offset cũ, thử lại ở lần sau */
          });
      }, CLOCK_RESYNC_MS);
    }

    // Tự tải lại 1 lần/ngày đúng giờ settings.reloadHour để dọn bộ nhớ WebView
    // tích tụ khi chạy 24/7 trên phần cứng signage yếu. KHÔNG chạy ở
    // ?preview=1 — nếu không sẽ làm reload luôn cả các iframe xem trước trong
    // trang admin (đang chạy chính omhN.html?preview=1 trong iframe).
    if (!isPreview) {
      state.reloadCheckTimer = setInterval(maybeNightlyReload, RELOAD_CHECK_MS);
    }

    // Watchdog: nếu vòng lặp requestAnimationFrame không "tick" trong ~90s
    // (WebView bị hệ điều hành throttle nền, hoặc JS bị treo cứng do lỗi lạ)
    // thì tự tải lại trang — bỏ qua khi document đang ẩn (document hidden),
    // vì đó là hành vi throttle rAF bình thường của trình duyệt, không phải
    // treo máy thật.
    state.watchdogTimer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - state.lastFrameAt > WATCHDOG_TIMEOUT_MS) {
        location.reload();
      }
    }, WATCHDOG_CHECK_MS);
  }

  /**
   * Tự tải lại đúng 1 lần/ngày vào settings.reloadHour (giờ địa phương của
   * chính màn hình, dùng đồng hồ đã bù offset server). Ghi ngày đã tải lại
   * vào localStorage (theo SCREEN_ID) để đảm bảo CHỈ 1 lần/ngày dù hàm này bị
   * gọi lại nhiều lần trong đúng khung giờ đó, kể cả sau khi trang tự reload.
   */
  function maybeNightlyReload() {
    const targetHour = state.settings ? state.settings.reloadHour : 4;
    const now = new Date(Date.now() + state.offsetMs);
    if (now.getHours() !== targetHour) return;

    const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const lsKey = `hbt_autoReloadDate_screen${SCREEN_ID}`;
    let last = null;
    try {
      last = localStorage.getItem(lsKey);
    } catch (e) {
      /* localStorage có thể bị chặn (chế độ riêng tư...) — chấp nhận rủi ro tải lại thêm lần, không chặn tính năng */
    }
    if (last === todayKey) return;
    try {
      localStorage.setItem(lsKey, todayKey);
    } catch (e) {
      /* bỏ qua — vẫn tải lại dù không ghi được cờ, an toàn hơn là bỏ lỡ */
    }
    location.reload();
  }

  // ---------------------------------------------------------------------
  // Subscribe dữ liệu
  // ---------------------------------------------------------------------
  function subscribeAll() {
    try {
      onSettings((settings) => {
        state.settings = normalizeSettings(settings);
        applyThemeIfNeeded();
        recompute();
      });
    } catch (e) {
      reportSoftError();
    }

    try {
      onMenu((items) => {
        state.items = Array.isArray(items) ? items : [];
        recompute();
      });
    } catch (e) {
      reportSoftError();
    }

    try {
      onThemes((themes) => {
        state.themesOverride = themes && typeof themes === "object" ? themes : {};
        applyThemeIfNeeded();
      });
    } catch (e) {
      reportSoftError();
    }

    // onMedia không nằm trong hợp đồng bắt buộc — chỉ dùng nếu tồn tại thật sự
    if (typeof DataLayerNS.onMedia === "function") {
      try {
        DataLayerNS.onMedia((mediaMap) => {
          state.mediaMap = mediaMap && typeof mediaMap === "object" ? mediaMap : {};
          state.contentDirty = true; // ảnh mới sẵn sàng -> vẽ lại trang hiện tại
        });
      } catch (e) {
        /* im lặng — ảnh sẽ dùng placeholder */
      }
    }
  }

  function reportSoftError() {
    // Lỗi khi subscribe không nên làm sập cả trang — hiện banner kín đáo và tiếp tục
    showConnError(true);
  }

  // ---------------------------------------------------------------------
  // Chuẩn hoá settings với giá trị mặc định an toàn
  // ---------------------------------------------------------------------
  function normalizeSettings(raw) {
    const s = raw && typeof raw === "object" ? raw : {};
    return {
      themeId: typeof s.themeId === "string" && s.themeId ? s.themeId : "hanabi",
      rotationSeconds: clamp(numOr(s.rotationSeconds, 10), 5, 60),
      itemsPerPage: clamp(numOr(s.itemsPerPage, 6), 4, 6),
      transition: ["fade", "slide", "flip", "curtain"].includes(s.transition)
        ? s.transition
        : "fade",
      distribution: s.distribution === "manual" ? "manual" : "auto",
      currency: typeof s.currency === "string" && s.currency ? s.currency : "zł",
      showHeader: s.showHeader !== false,
      headerText_pl: typeof s.headerText_pl === "string" && s.headerText_pl ? s.headerText_pl : "MENU",
      effectsLevel: ["full", "lite", "off"].includes(s.effectsLevel) ? s.effectsLevel : "full",
      reloadHour: clamp(Math.trunc(numOr(s.reloadHour, 4)), 0, 23),
      revision: numOr(s.revision, 0),
    };
  }

  function numOr(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  // ---------------------------------------------------------------------
  // Thuật toán phân trang — đúng theo ARCHITECTURE.md mục 3. NGUỒN DUY NHẤT
  // nằm ở ./pagination.js (dùng chung với admin.js) — xem ghi chú ở đó.
  // ---------------------------------------------------------------------
  function recompute() {
    if (!state.settings) return;
    state.screenPages = computeScreenPages(state.settings, state.items, SCREEN_ID);
    state.contentDirty = true;
  }

  // ---------------------------------------------------------------------
  // Vòng lặp xoay trang — đồng hồ tuyệt đối, dùng requestAnimationFrame,
  // KHÔNG dùng setInterval (tránh 4 màn hình lệch nhịp dần theo thời gian).
  // ---------------------------------------------------------------------
  function startRotationLoop() {
    function frame() {
      state.rafId = requestAnimationFrame(frame);
      state.lastFrameAt = Date.now(); // watchdog theo dõi mốc này (xem startMaintenanceTimers)
      updateRotation();
    }
    state.rafId = requestAnimationFrame(frame);
  }

  function updateRotation() {
    const pageCount = state.screenPages.length;

    if (pageCount === 0) {
      if (state.idleShown !== true) showIdleScreen();
      return;
    }
    if (state.idleShown !== false) hideIdleScreen();

    const rotationSeconds = state.settings ? state.settings.rotationSeconds : 10;
    const now = Date.now() + state.offsetMs;
    const tick = Math.floor(now / (rotationSeconds * 1000));

    if (tick !== state.lastTick || state.contentDirty) {
      state.lastTick = tick;
      const pageIndex = tick % pageCount;
      if (pageIndex !== state.currentPageIndex || state.contentDirty) {
        state.currentPageIndex = pageIndex;
        state.contentDirty = false;
        renderPage(state.screenPages[pageIndex]);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Render trang (double-buffer 2 layer để chuyển cảnh mượt)
  // ---------------------------------------------------------------------
  function renderPage(items) {
    updateHeader();
    const transitionType = state.settings ? state.settings.transition : "fade";
    const incoming = state.activeLayer === "A" ? layerB : layerA;
    const outgoing = state.activeLayer === "A" ? layerA : layerB;

    buildCards(incoming, items || []);

    // reset class rồi ép reflow để animation CSS chạy lại từ đầu
    incoming.className = `menu-grid-layer t-${transitionType} layer-incoming`;
    incoming.dataset.count = String((items || []).length);
    void incoming.offsetWidth;

    requestAnimationFrame(() => {
      incoming.className = `menu-grid-layer t-${transitionType} layer-active`;
      incoming.dataset.count = String((items || []).length);
      if (outgoing.childElementCount > 0) {
        outgoing.className = `menu-grid-layer t-${transitionType} layer-leaving`;
      }
    });

    if (outgoing.childElementCount > 0) {
      setTimeout(() => {
        outgoing.className = "menu-grid-layer layer-hidden";
        outgoing.innerHTML = "";
      }, LAYER_TRANSITION_MS);
    }

    state.activeLayer = state.activeLayer === "A" ? "B" : "A";
  }

  function updateHeader() {
    if (!els.header) return;
    const show = state.settings ? state.settings.showHeader : true;
    if (!show) {
      els.header.hidden = true;
      return;
    }
    els.header.hidden = false;
    const text = state.settings ? state.settings.headerText_pl : "MENU";
    if (els.header.textContent !== text) els.header.textContent = text;
  }

  function buildCards(container, items) {
    container.innerHTML = "";
    items.forEach((item, i) => {
      const card = document.createElement("article");
      card.className = "card";
      card.style.setProperty("--i", String(i));
      card.innerHTML = cardMarkup(item);
      container.appendChild(card);
    });
  }

  function cardMarkup(item) {
    const name = escapeHtml(item.name_pl || "");
    const desc = escapeHtml(item.desc_pl || "");
    const priceText = formatPrice(item.price, item.priceSuffix, state.settings ? state.settings.currency : "zł");
    const badgeHtml = item.badge
      ? `<span class="ribbon">${escapeHtml(item.badge)}</span>`
      : "";
    const imgSrc = resolveImage(item);
    const mediaHtml = imgSrc
      ? `<div class="card-media"><img src="${escapeAttr(imgSrc)}" alt="${escapeAttr(name)}" loading="lazy" decoding="async"></div>`
      : `<div class="card-media placeholder"><span class="placeholder-glyph" aria-hidden="true">${glyphFor(item.category)}</span></div>`;

    return `${mediaHtml}${badgeHtml}<div class="card-body">
      <h2 class="card-name">${name}</h2>
      ${desc ? `<p class="card-desc">${desc}</p>` : ""}
      <div class="price-badge">${priceText}</div>
    </div>`;
  }

  function resolveImage(item) {
    if (item.imageUrl && typeof item.imageUrl === "string") return item.imageUrl;
    if (item.mediaId && state.mediaMap && state.mediaMap[item.mediaId]) {
      const media = state.mediaMap[item.mediaId];
      if (typeof media === "string") return media;
      if (media && typeof media.dataUrl === "string") return media.dataUrl;
    }
    return null;
  }

  function glyphFor(category) {
    const key = String(category || "").toLowerCase();
    return CATEGORY_GLYPH[key] || CATEGORY_GLYPH.default;
  }

  function formatPrice(price, suffix, currency) {
    const num = Number(price);
    const formatted = Number.isFinite(num)
      ? num.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "—";
    const cur = currency || "zł";
    const suf = suffix ? ` ${escapeHtml(String(suffix))}` : "";
    return `${formatted} ${escapeHtml(cur)}${suf}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }

  // ---------------------------------------------------------------------
  // Màn hình chờ (khi màn hình này không có trang nào)
  // ---------------------------------------------------------------------
  function showIdleScreen() {
    state.idleShown = true;
    if (els.idle) {
      if (!els.idle.dataset.built) {
        els.idle.innerHTML = `
          <div class="idle-logo">${escapeHtml(RESTAURANT_NAME)}</div>
          <div class="idle-tagline">${escapeHtml(RESTAURANT_TAGLINE)}</div>
        `;
        els.idle.dataset.built = "1";
      }
      els.idle.hidden = false;
    }
    if (els.header) els.header.hidden = true;
    layerA.className = "menu-grid-layer layer-hidden";
    layerB.className = "menu-grid-layer layer-hidden";
  }

  function hideIdleScreen() {
    state.idleShown = false;
    if (els.idle) els.idle.hidden = true;
  }

  // ---------------------------------------------------------------------
  // Theme + hiệu ứng hạt
  // ---------------------------------------------------------------------
  function resolveTheme() {
    const themeId = state.settings ? state.settings.themeId : "hanabi";
    const custom = state.themesOverride && state.themesOverride[themeId];
    const preset = THEMES && THEMES[themeId];
    return custom || preset || (THEMES && THEMES.hanabi) || FALLBACK_THEME;
  }

  function applyThemeIfNeeded() {
    if (!state.settings) return;
    const theme = resolveTheme();
    if (theme !== state.themeApplied) {
      state.themeApplied = theme;
      try {
        applyTheme(els.app, theme);
      } catch (e) {
        /* lỗi theme không được phép làm sập màn hình hiển thị */
      }
    }
    updateParticles(theme);
  }

  function updateParticles(theme) {
    let reduceMotion = false;
    try {
      reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) { /* noop */ }

    const level = isSafe || reduceMotion ? "off" : (state.settings ? state.settings.effectsLevel : "full");
    const type = level === "off" ? "none" : theme && theme.particles ? theme.particles : "none";

    stopParticles();
    if (els.canvas && type !== "none" && level !== "off") {
      startParticles(els.canvas, type, level);
    }
  }

  // ---------------------------------------------------------------------
  // Heartbeat — bỏ qua hoàn toàn khi ?preview=1
  // ---------------------------------------------------------------------
  function startHeartbeat() {
    const send = () => {
      try {
        const info = {
          revision: state.settings ? state.settings.revision : null,
          page: state.currentPageIndex + 1,
          ua: navigator.userAgent,
          res: `${window.screen.width}x${window.screen.height}`,
        };
        const result = heartbeat(SCREEN_ID, info);
        if (result && typeof result.catch === "function") result.catch(() => {});
      } catch (e) {
        /* nhịp tim lỗi không ảnh hưởng tới hiển thị */
      }
    };
    send();
    state.heartbeatTimer = setInterval(send, HEARTBEAT_MS);
  }

  // ---------------------------------------------------------------------
  // Banner lỗi kết nối — kín đáo, không che nội dung, tiếp tục thử lại
  // ---------------------------------------------------------------------
  function showConnError(visible) {
    if (!els.err) return;
    if (visible) {
      els.err.hidden = false;
      els.err.textContent = "Trwa łączenie z serwerem danych… wyświetlane dane mogą być nieaktualne.";
      requestAnimationFrame(() => els.err.classList.add("visible"));
    } else {
      els.err.classList.remove("visible");
      setTimeout(() => {
        if (!els.err.classList.contains("visible")) els.err.hidden = true;
      }, 600);
    }
  }
}
