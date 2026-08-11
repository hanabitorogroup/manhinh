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

const HEARTBEAT_MS = 60000;
const RETRY_BASE_MS = 3000;
const RETRY_MAX_MS = 30000;
const LAYER_TRANSITION_MS = 800; // khớp với --layer-delay / thời lượng CSS transition dài nhất

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
    heartbeatTimer: null,
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
  // Thuật toán phân trang — đúng theo ARCHITECTURE.md mục 3
  // ---------------------------------------------------------------------
  function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }

  function sortItems(list) {
    return list.slice().sort((a, b) => {
      const oa = numOr(a.order, 0);
      const ob = numOr(b.order, 0);
      if (oa !== ob) return oa - ob;
      return String(a.name_pl || "").localeCompare(String(b.name_pl || ""), "pl");
    });
  }

  function computeScreenPages(settings, items, screenId) {
    if (!settings) return [];
    const itemsPerPage = settings.itemsPerPage;
    const visible = items.filter((i) => i && i.visible !== false);

    if (settings.distribution === "manual") {
      // Chế độ thủ công: món có screenLock = 1..4 được GHIM vào đúng màn hình đó.
      // Món còn lại (screenLock = 0, thiếu, hoặc giá trị ngoài phạm vi 1..4 — tức
      // "Tự động", giá trị mặc định của MỌI món cho tới khi chủ quán ghim tay) KHÔNG
      // được phép biến mất khỏi cả 4 màn hình — nếu không, chỉ cần bật "thủ công" mà
      // chưa ghim món nào là toàn bộ thực đơn trống trơn, một cái bẫy chết người với
      // chủ quán không rành kỹ thuật. Vì vậy nhóm món "trôi nổi" này được chia đều
      // cho 4 màn hình bằng ĐÚNG thuật toán khối của chế độ tự động (sort toàn cục
      // theo (order, name_pl) → chunk theo itemsPerPage → mỗi màn nhận
      // ceil(số trang / 4) trang, cắt theo screenId). Vì phép chia dựa trên toàn bộ
      // danh sách món trôi nổi (không phụ thuộc trạng thái riêng của từng màn hình)
      // nên 4 màn hình luôn đồng thuận trang nào thuộc màn nào — không có tranh chấp.
      //
      // Trang của màn hình này = các trang món đã ghim (hiển thị TRƯỚC, ổn định vì
      // luôn thuộc đúng màn) rồi NỐI TIẾP các trang món trôi nổi thuộc phần của màn
      // hình này (hiển thị SAU).
      const isLockedHere = (item) => {
        const lock = Number(item.screenLock);
        return lock >= 1 && lock <= 4 && lock === screenId;
      };
      const isFloating = (item) => {
        const lock = Number(item.screenLock);
        return !(lock >= 1 && lock <= 4);
      };

      const locked = visible.filter(isLockedHere);
      const lockedPages = chunk(sortItems(locked), itemsPerPage);

      const floating = visible.filter(isFloating);
      const floatingPages = chunk(sortItems(floating), itemsPerPage);
      const floatingPerScreen = Math.ceil(floatingPages.length / 4) || 0;
      const floatingStart = (screenId - 1) * floatingPerScreen;
      const floatingPagesForScreen = floatingPages.slice(floatingStart, floatingStart + floatingPerScreen);

      return lockedPages.concat(floatingPagesForScreen);
    }

    // Chế độ tự động: chia đều toàn bộ số trang cho 4 màn hình theo thứ tự.
    const sorted = sortItems(visible);
    const pages = chunk(sorted, itemsPerPage);
    const perScreen = Math.ceil(pages.length / 4) || 0;
    const start = (screenId - 1) * perScreen;
    return pages.slice(start, start + perScreen);
  }

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
