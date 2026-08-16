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

// Glyph hiển thị cho món chưa có ảnh — SVG line-art nội tuyến vẽ bằng
// `currentColor` (không phải emoji bitmap). Emoji hệ thống là ảnh bitmap có độ
// phân giải cố định do font emoji của OS quyết định; phóng to ở màn 4K (kích
// thước CSS clamp() lớn hơn nhưng bitmap gốc thì không đổi) làm lộ răng cưa/
// khối vuông rất rõ khi đứng gần. SVG là vector nên luôn sắc nét ở mọi độ
// phân giải, và `stroke="currentColor"` khiến glyph tự động ăn theo màu theme
// (giống hệt cách chữ dùng var(--text)) thay vì màu emoji cố định của hệ điều
// hành. Mỗi icon chỉ là phần <path>/<circle> bên trong — khung <svg> dùng
// chung được ghép trong glyphFor() để đồng nhất stroke-width/viewBox.
const CATEGORY_GLYPH_ICONS = {
  // Tô ramen: vành tô + hơi nóng bốc lên — dùng chung cho súp nói chung.
  bowlSteam: `<path d="M7 21h34" stroke-width="2.7"/><path d="M8 21c0 9.5 6.9 16 16 16s16-6.5 16-16"/><path d="M17 9c-1.6 2-1.6 4.3 0 6.3" stroke-width="2"/><path d="M24 7c-1.6 2-1.6 4.3 0 6.3" stroke-width="2"/><path d="M31 9c-1.6 2-1.6 4.3 0 6.3" stroke-width="2"/>`,
  // Nigiri sushi: mô cơm + dải rong biển + lát topping cong phía trên.
  sushi: `<path d="M10 33c0-7.2 6.3-12.5 14-12.5s14 5.3 14 12.5c0 4.6-6.3 6-14 6s-14-1.4-14-6z"/><path d="M10.6 29.4h26.8"/><path d="M15 20c2.7-2.8 5.9-4.3 9-4.3s6.3 1.5 9 4.3"/>`,
  // Donburi: tô cơm thấp + đôi đũa gác ngang miệng tô.
  donburi: `<path d="M8 23h32" stroke-width="2.7"/><path d="M9 23c0 8.6 6.4 14.5 15 14.5s15-5.9 15-14.5"/><path d="M17.6 20.4c2-2.6 4.2-3.8 6.4-3.8s4.4 1.2 6.4 3.8"/><path d="M13 12l23 8"/><path d="M15 10l23 8"/>`,
  // Món khai vị kiểu xiên nướng: đĩa tròn + xiên que với các viên tròn.
  skewer: `<ellipse cx="24" cy="33.6" rx="15.4" ry="5"/><path d="M9.5 15l28 19"/><circle cx="16.2" cy="19.5" r="2.7"/><circle cx="24.4" cy="25.1" r="2.7"/><circle cx="32.6" cy="30.7" r="2.7"/>`,
  // Dango tráng miệng: que xiên + 3 viên tròn xếp chồng.
  dango: `<path d="M24 6v36" stroke-width="2.4"/><circle cx="24" cy="15" r="5.6"/><circle cx="24" cy="24" r="5.6"/><circle cx="24" cy="33" r="5.6"/>`,
  // Ly đồ uống: ly thon + vạch mực nước + ống hút chéo.
  drink: `<path d="M15 11h18l-2.6 25.3a3.2 3.2 0 01-3.18 2.8h-6.44a3.2 3.2 0 01-3.18-2.8z"/><path d="M16.3 22.6h15.4"/><path d="M29 11l4.6-6"/>`,
  // Mặc định (không rõ danh mục): đĩa tròn tối giản, sang trọng, trung tính.
  plate: `<circle cx="24" cy="24" r="16.5"/><circle cx="24" cy="24" r="9"/>`,
};

// Ánh xạ danh mục món (field `category` trong Firestore, xem seed-data.js và
// ARCHITECTURE.md mục 2) sang icon phía trên. Giữ nguyên các bí danh cũ
// (donburi/grill/yakitori/dessert/drink/soup/zupa/curry — phòng khi admin tự
// gõ category cũ hoặc dữ liệu cũ còn sót) ĐỒNG THỜI khớp đúng các giá trị
// category THẬT mà seed-data.js (thực đơn Oława/King Long) đang dùng: zupy,
// sajgonki, kurczak-ch, dania, makarony, kidbox, dodatki — trước đây các bí
// danh cũ (donburi/przystawki/desery/napoje…) không khớp category thật nào
// của bộ dữ liệu Nhật giả định cũ, nay đổi hẳn sang thực đơn thật nên phải
// kiểm lại TỪNG giá trị category thật, không được đoán (xem "Known traps" —
// khớp sai âm thầm rơi về glyph mặc định, không có lỗi nào hiện ra để biết).
const CATEGORY_GLYPH_KEY = {
  ramen: "bowlSteam",
  soup: "bowlSteam",
  zupa: "bowlSteam",
  zupy: "bowlSteam", // Zupy (Pho, Tajska, Wonton, Tom Yum) — số nhiều, giá trị thật
  sushi: "sushi",
  sashimi: "sushi",
  donburi: "donburi",
  don: "donburi",
  curry: "donburi",
  dania: "donburi", // Dania główne (Tofu/Kurczak/Wieprzowina/Wołowina/Krewetki/Kaczka)
  grill: "skewer",
  yakitori: "skewer",
  przystawki: "skewer",
  sajgonki: "skewer", // Sajgonki (nem rán) — món khai vị
  "kurczak-ch": "skewer", // Kurczak chrupiący (bestseller, chiên giòn)
  dessert: "dango",
  desery: "dango",
  drink: "drink",
  napoje: "drink",
  makarony: "bowlSteam", // Makarony i ryż (mì/cơm — tô)
  kidbox: "plate", // Kid-Box — không có glyph riêng, dùng đĩa mặc định tường minh
  dodatki: "plate", // Dodatki (phần thêm/gia vị) — như trên
  default: "plate",
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
        logConnectionError("initData", err);
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
    // treo máy thật. BỎ QUA HOÀN TOÀN ở ?preview=1: đây là watchdog cho máy
    // phát signage không người trông coi, KHÔNG phải cho iframe xem trước
    // trong tay admin. Tab "Xem trước" mở 4 iframe omhN.html?preview=1 cùng
    // lúc — trên điện thoại, Safari throttle rAF của các iframe nền/không
    // hoạt động, `lastFrameAt` vượt quá 90s, và watchdog trong MỖI iframe tự
    // gọi location.reload() trên chính nó — 4 iframe cùng reload lặp lại vô
    // hạn, khiến cả tab admin bị Safari coi là crash loop và giết chết
    // ("Đã có sự cố xảy ra liên tục…"). document.visibilityState bên trong
    // iframe phản ánh visibility của TAB CHA (không phải của iframe), nên
    // điều kiện "hidden" phía trên không bao giờ đúng khi tab admin đang mở —
    // guard đó không cứu được trường hợp này. Vì vậy cần chặn watchdog ngay
    // từ đầu cho preview, giống hệt 2 timer resync/reload phía trên.
    if (!isPreview) {
      state.watchdogTimer = setInterval(() => {
        if (document.visibilityState === "hidden") return;
        if (Date.now() - state.lastFrameAt > WATCHDOG_TIMEOUT_MS) {
          location.reload();
        }
      }, WATCHDOG_CHECK_MS);
    }
  }

  // Bù trôi cho watchdog: nếu tab bị ẩn/nền LÂU (điện thoại khoá màn hình,
  // chuyển app, iOS treo tab nền…) thì `state.lastFrameAt` không được cập
  // nhật suốt thời gian đó (rAF không chạy khi ẩn). Guard "hidden" trong
  // watchdog chặn được việc reload TRONG LÚC ẩn, nhưng ngay khi tab hiện lại,
  // rAF cần một nhịp để "bắt kịp" — nếu nhịp watchdog kế tiếp (tối đa
  // WATCHDOG_CHECK_MS sau đó) chạy trước khi frame() kịp cập nhật lastFrameAt,
  // hiệu số Date.now() - lastFrameAt vẫn còn > 90s (tính luôn cả thời gian ẩn
  // trước đó) và trang sẽ bị reload NGAY KHI vừa quay lại — một cú giật cho
  // người đang xem, dù máy không hề treo. Reset lastFrameAt ngay khi
  // visibilitychange báo "visible" để mốc thời gian watchdog bắt đầu đếm lại
  // từ 0 tại đúng lúc khung hình có thể tiếp tục chạy, thay vì cộng dồn thời
  // gian đã trôi qua lúc tab còn ẩn. Lắp không điều kiện (kể cả preview) vì
  // vô hại khi watchdog đã tắt, và hữu ích nếu sau này có timer khác dùng lại
  // lastFrameAt.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      state.lastFrameAt = Date.now();
    }
  });

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
      reportSoftError("onSettings", e);
    }

    try {
      onMenu((items) => {
        state.items = Array.isArray(items) ? items : [];
        recompute();
      });
    } catch (e) {
      reportSoftError("onMenu", e);
    }

    try {
      onThemes((themes) => {
        state.themesOverride = themes && typeof themes === "object" ? themes : {};
        applyThemeIfNeeded();
      });
    } catch (e) {
      reportSoftError("onThemes", e);
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

  function reportSoftError(source, err) {
    // Lỗi khi subscribe không nên làm sập cả trang — hiện banner kín đáo và tiếp tục
    showConnError(true);
    logConnectionError(source, err);
  }

  /**
   * Ghi chi tiết lỗi kết nối ra CONSOLE (tiếng Việt, dùng chung logic phân
   * loại với admin.js/data-layer.js) — CHỈ ra console, không hiện cho khách.
   * Màn hình khách chỉ thấy 1 dòng tiếng Ba Lan tối giản (showConnError()) vì
   * đây là màn hình signage đối diện khách hàng, không phải công cụ debug.
   */
  function logConnectionError(source, err) {
    try {
      const describe = typeof DataLayerNS.describeConnectionError === "function"
        ? DataLayerNS.describeConnectionError
        : null;
      console.error(
        `[display:${SCREEN_ID}] Lỗi kết nối dữ liệu (${source}):`,
        describe ? describe(err) : (err && err.message) || err,
        err
      );
    } catch (e) {
      /* logging không được phép làm sập vòng lặp kết nối */
    }
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
      // "grid" | "grid+featured" — xem pagination.js computeScreenPages() +
      // display.css khối "Trang nổi bật". Bất kỳ giá trị lạ nào (dữ liệu cũ,
      // gõ tay sai) đều rơi về "grid" an toàn (hành vi CŨ, không bao giờ tự
      // nhiên bật trang nổi bật nếu admin chưa từng chọn).
      layout: s.layout === "grid+featured" ? "grid+featured" : "grid",
      // { [screenId]: itemId } — KHÔNG ép kiểu gì thêm ở đây (id không hợp lệ
      // tự động rơi về "không có trang nổi bật cho màn đó" trong
      // pagination.js, không cần validate trước).
      featuredByScreen:
        s.featuredByScreen && typeof s.featuredByScreen === "object" ? s.featuredByScreen : {},
      featuredPosition: s.featuredPosition === "before" ? "before" : "after",
      // BUG CŨ: `typeof s.currency === "string" && s.currency ? ... : "zł"`
      // coi currency:"" (giá trị HỢP LỆ, nghĩa là "tắt hậu tố tiền tệ" — xem
      // formatPrice()/currencySuffix() bên dưới) là falsy rồi vẫn ép về "zł",
      // cùng 1 lỗi với formatPrice() cũ. Chỉ khi field KHÔNG PHẢI string
      // (thiếu/null/undefined) mới fallback "zł".
      currency: typeof s.currency === "string" ? s.currency : "zł",
      // Mặc định TẮT (bảng hiệu không cần nhắc lại nó là menu) — chỉ bật khi
      // admin đã lưu showHeader:true rõ ràng. Xem DEFAULT_SETTINGS ở
      // data-layer.js để biết lý do đầy đủ.
      showHeader: s.showHeader === true,
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
    // Trang nổi bật (xem buildCards()) đổi hẳn CSS layout của chính
    // .menu-grid-layer (class "featured", xem display.css) — phải NẰM
    // TRONG cùng chuỗi className bên dưới, vì mỗi lần đổi trạng thái
    // layer-incoming/active/leaving đều GHI ĐÈ TOÀN BỘ className (không
    // phải classList.add/remove riêng lẻ) để đảm bảo animation CSS chạy
    // lại từ đầu (ép reflow) — ghi "featured" tách rời bằng classList sẽ
    // bị chính dòng ghi đè này xoá mất ngay sau đó.
    const isFeatured = !!(items && items.featured);
    const featuredClass = isFeatured ? " featured" : "";

    buildCards(incoming, items || []);

    // reset class rồi ép reflow để animation CSS chạy lại từ đầu
    incoming.className = `menu-grid-layer t-${transitionType} layer-incoming${featuredClass}`;
    if (isFeatured) {
      delete incoming.dataset.count; // không áp quy tắc data-count="N" của lưới cho trang nổi bật
    } else {
      incoming.dataset.count = String((items || []).length);
    }
    void incoming.offsetWidth;

    requestAnimationFrame(() => {
      incoming.className = `menu-grid-layer t-${transitionType} layer-active${featuredClass}`;
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
    const show = state.settings ? state.settings.showHeader : false;
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
    // Trang nổi bật (Option 2 "grid+featured", xem pagination.js
    // computeScreenPages()) — `items` là 1 mảng [item] có đánh dấu
    // `.featured = true`. Render markup RIÊNG (1 món chiếm toàn panel,
    // không phải lưới nhiều ô) — xem buildFeaturedArticle() + display.css
    // khối "Trang nổi bật". `.featured` là thuộc tính gắn trên CHÍNH mảng
    // `items` (không phải trên container) nên còn nguyên qua tham số hàm.
    if (items && items.featured && items[0]) {
      container.classList.add("featured");
      container.appendChild(buildFeaturedArticle(items[0]));
      return; // không chạy fitCardPrices() — không có .card nào trong trang này
    }
    container.classList.remove("featured");
    items.forEach((item, i) => {
      const card = document.createElement("article");
      card.className = "card";
      card.style.setProperty("--i", String(i));
      card.innerHTML = cardMarkup(item);
      container.appendChild(card);
    });
    fitCardPrices(container);
  }

  // ---------------------------------------------------------------------
  // "Không được wrap" cho tên món dài + giá RỘNG (vd khoảng giá "24–31" của
  // biến thể 2 trục) — display.css đặt --price-tag ở đúng --price-scale=1.35
  // (giá trị đã đo/duyệt) cho trường hợp phổ biến (giá 2-3 ký tự). Nhưng với
  // giá NHIỀU KÝ TỰ HƠN (khoảng giá, "od X") cộng tên món dài nhất thực đơn
  // thật ("Kurczak chrupiący"/"Krewetki chrupiące") trên cùng 1 hàng, chip giá
  // rộng ra đủ để đẩy tên món xuống 2 dòng — ĐO ĐƯỢC THẬT (không phải giả
  // định) bằng Playwright khi kiểm bộ dữ liệu thật, xem báo cáo kèm code
  // review. display.css tự nó (thuần CSS) không có cách "co giãn theo nội
  // dung" nên xử lý ở đây: sau khi thẻ đã render (1 lần/trang, KHÔNG phải mỗi
  // khung hình — rẻ, không đụng ngân sách hiệu năng SoC yếu), đo xem
  // .card-name có bị wrap quá 1 dòng không; nếu có, hạ dần cỡ chữ GIÁ (không
  // bao giờ hạ cỡ chữ TÊN MÓN — đó là SÀN không được phép hồi quy, xem
  // --card-name-fs trong display.css) cho tới khi tên món về lại 1 dòng, hoặc
  // chạm sàn "giá bằng đúng cỡ tên món" (KHÔNG BAO GIỜ để giá NHỎ HƠN tên).
  const PRICE_SCALE_STEPS = [1.35, 1.2, 1.05, 1]; // 1.35 = giá trị đã duyệt (~35% to hơn); 1 = sàn cuối, giá = tên
  // Nếu hạ hết PRICE_SCALE_STEPS (giá đã bằng đúng cỡ tên món) mà TÊN MÓN vẫn
  // wrap — trường hợp cực đoan đo được thật: "Kurczak chrupiący" (tên dài
  // nhất thực đơn) + giá khoảng "24–31" (biến thể 2 trục) CỘNG LẠI vẫn dài
  // hơn 1 hàng dù giá đã nhỏ bằng tên — bậc cứu hộ thứ 2 là nới lỏng
  // letter-spacing của CHÍNH TÊN MÓN dần về 0 rồi âm nhẹ. Đây KHÔNG PHẢI hạ
  // sàn cỡ chữ (cap-height/mm đo được không đổi — letter-spacing không ảnh
  // hưởng cap-height) nên không vi phạm yêu cầu "không được hồi quy sàn chữ";
  // dùng cho chính trường hợp mà bản mockup gốc cũng đã thử nghiệm tương tự
  // (xem scratchpad/revA2/pairings/crowding_test.py — 4 mức letter-spacing
  // cho đúng chữ "Krewetki chrupiące" ở đúng cỡ chữ production).
  const NAME_TRACKING_STEPS = [0.01, 0, -0.01, -0.02, -0.03]; // em — 0.01 = giá trị đã duyệt
  function fitCardPrices(container) {
    const cards = container.querySelectorAll(".card");
    cards.forEach((card) => {
      const nameEl = card.querySelector(".card-name");
      const priceEl = card.querySelector(".price-tag");
      const rowEl = card.querySelector(".row-name-price");
      if (!nameEl || !priceEl) return;
      // Chiều cao 1 dòng "danh nghĩa" của tên món — LẤY TỪ line-height đã
      // tính toán sẵn (getComputedStyle trả về px cụ thể cho line-height:.94
      // unitless), KHÔNG đo getBoundingClientRect() ở đây: nếu tên món đã
      // đang wrap 2 dòng (trường hợp ta cần phát hiện), rect thật sẽ CAO GẤP
      // ĐÔI — dùng nó làm "mốc 1 dòng" sẽ tự đánh lừa chính nó ngay từ đầu.
      priceEl.style.fontSize = "";
      nameEl.style.letterSpacing = "";
      priceEl.classList.remove("tight-fit");
      if (rowEl) rowEl.classList.remove("tight-fit");
      const singleLine = parseFloat(getComputedStyle(nameEl).lineHeight) || nameEl.getBoundingClientRect().height;
      const fitsOneLine = () => nameEl.getBoundingClientRect().height <= singleLine * 1.35;
      // >1.35x sàn 1 dòng -> coi là đã tràn xuống dòng 2 (chừa biên cho dấu
      // tiếng Ba Lan có phần đuôi/mũ cao hơn chữ thường 1 chút).
      for (const scale of PRICE_SCALE_STEPS) {
        priceEl.style.fontSize = `calc(var(--card-name-fs) * ${scale})`;
        if (fitsOneLine()) return;
      }
      for (const tracking of NAME_TRACKING_STEPS) {
        nameEl.style.letterSpacing = `${tracking}em`;
        if (fitsOneLine()) return;
      }
      // Bậc cứu hộ CUỐI — đo được thật xảy ra với đúng "Kurczak chrupiący"
      // (tên dài nhất thực đơn) + giá khoảng "XX–XX" (biến thể 2 trục) ở mật
      // độ 6-up: dù giá đã nhỏ bằng tên VÀ tracking đã xiết hết mức vẫn thiếu
      // vài chục px. Xiết thêm khoảng cách tên/giá + đệm quanh chip giá (CHỈ
      // cho đúng thẻ này — class .tight-fit, xem display.css — số đông thẻ
      // giá ngắn không bị ảnh hưởng, vẫn giữ khoảng cách rộng rãi mặc định).
      priceEl.classList.add("tight-fit");
      if (rowEl) rowEl.classList.add("tight-fit");
      if (fitsOneLine()) return;
      // Cả 3 bậc cứu hộ đều không đủ (chưa gặp trong thực đơn thật) — chấp
      // nhận wrap 2 dòng, KHÔNG cắt/không tràn (overflow-wrap/word-break vẫn
      // giữ nguyên) — suy biến an toàn còn hơn phá layout.
    });
  }

  function cardMarkup(item) {
    const name = escapeHtml(item.name_pl || "");
    const currency = state.settings ? state.settings.currency : undefined;
    const priceInfo = priceAndCaptionFor(item, currency);

    // 3 pill cố định (OSTRE/WEGE/BESTSELLER) — DỮ LIỆU (item.spicy/vege/best),
    // không phải category, quyết định pill nào hiện. Khác với `badge` (ribbon
    // tự do góc phải, xem bên dưới) — 2 hệ thống nhãn độc lập, không xung đột
    // vị trí (pill neo ảnh góc trái, ribbon neo GÓC PHẢI toàn thẻ).
    const pills = [];
    if (item.spicy) pills.push('<span class="tag-pill tag-spicy"><span class="dot"></span>Ostre</span>');
    if (item.vege) pills.push('<span class="tag-pill tag-vege"><span class="dot"></span>Wege</span>');
    if (item.best) pills.push('<span class="tag-pill tag-best"><span class="dot"></span>Bestseller</span>');
    const pillHtml = pills.length ? `<div class="pill-overlay">${pills.join("")}</div>` : "";

    const badgeHtml = item.badge
      ? `<span class="ribbon">${escapeHtml(item.badge)}</span>`
      : "";
    const imgSrc = resolveImage(item);
    const mediaHtml = imgSrc
      ? `<div class="card-media">${pillHtml}<img src="${escapeAttr(imgSrc)}" alt="${escapeAttr(name)}" loading="lazy" decoding="async"></div>`
      : `<div class="card-media placeholder">${pillHtml}<span class="placeholder-glyph" aria-hidden="true">${glyphFor(item.category)}</span></div>`;

    const captionHtml = priceInfo.caption
      ? `<p class="card-option">${escapeHtml(priceInfo.caption)}</p>`
      : "";

    return `${mediaHtml}${badgeHtml}<div class="card-content">
      <div class="row-name-price">
        <h2 class="card-name">${name}</h2>
        <span class="price-tag">${priceInfo.priceText}</span>
      </div>
      ${captionHtml}
    </div>`;
  }

  // ---------------------------------------------------------------------
  // Trang nổi bật (Option 2 "grid+featured") — 1 món chiếm TOÀN panel, theo
  // đúng ảnh tham chiếu chủ quán đưa (mảng màu phẳng, ảnh RẤT LỚN, tên RẤT
  // LỚN, mô tả, giá từng biến thể dạng "flag/arrow", legend nhỏ giải thích
  // icon cay — xem display.css khối "Trang nổi bật"). Trả về 1 <article>
  // DOM THẬT (không phải chuỗi HTML như cardMarkup()) để khớp đúng cách
  // buildCards() gọi appendChild() trực tiếp — trang này chỉ có 1 món, không
  // cần lặp innerHTML nhiều lần như buildCards() với mảng thẻ lưới.
  // ---------------------------------------------------------------------
  function buildFeaturedArticle(item) {
    const name = escapeHtml(item.name_pl || "");
    const currency = state.settings ? state.settings.currency : undefined;
    const desc = item.desc_pl ? `<p class="feature-desc">${escapeHtml(item.desc_pl)}</p>` : "";

    const pills = [];
    if (item.spicy) pills.push('<span class="tag-pill tag-spicy"><span class="dot"></span>Ostre</span>');
    if (item.vege) pills.push('<span class="tag-pill tag-vege"><span class="dot"></span>Wege</span>');
    if (item.best) pills.push('<span class="tag-pill tag-best"><span class="dot"></span>Bestseller</span>');
    const pillHtml = pills.length ? `<div class="feature-pills">${pills.join("")}</div>` : "";

    const imgSrc = resolveImage(item);
    const mediaHtml = imgSrc
      ? `<div class="feature-media"><img src="${escapeAttr(imgSrc)}" alt="${escapeAttr(name)}" loading="lazy" decoding="async"></div>`
      : `<div class="feature-media placeholder"><span class="placeholder-glyph" aria-hidden="true">${glyphFor(item.category)}</span></div>`;

    // Giá từng biến thể dạng "flag" — KHÔNG dùng priceAndCaptionFor() (hàm đó
    // rút gọn nhiều biến thể thành 1 khoảng giá "od X"/"X–Y" cho vừa 1 hàng
    // hẹp cạnh tên món trên thẻ lưới 6-up). Trang nổi bật có cả panel cho 1
    // món nên liệt kê ĐỦ từng lựa chọn — đúng yêu cầu "variant prices as
    // flag/arrow tags" (số nhiều).
    const rawVariants = Array.isArray(item.variants) ? item.variants : [];
    const variants = rawVariants.filter((v) => v && Number.isFinite(Number(v.price)));
    const flagsHtml = variants.length > 1
      ? variants.map((v) => {
          const label = Array.isArray(v.axis) ? v.axis.filter(Boolean).join(" · ") : "";
          const labelHtml = label ? `<span class="flag-label">${escapeHtml(label)}</span>` : "";
          return `<span class="flag-tag">${labelHtml}<span class="flag-price">${formatPrice(v.price, item.priceSuffix, currency)}</span></span>`;
        }).join("")
      : `<span class="flag-tag"><span class="flag-price">${formatPrice(
          variants.length === 1 ? variants[0].price : item.price,
          item.priceSuffix,
          currency
        )}</span></span>`;

    // Legend nhỏ giải thích icon "Ostre" — xem ghi chú đầy đủ ở display.css.
    // CHỈ hiện khi CHÍNH món này spicy:true (khớp điều kiện dựng pill "Ostre"
    // ở pills phía trên) — trước đây hiện VÔ ĐIỀU KIỆN dù món không hề cay,
    // khiến nó đọc như 1 dòng chú thích lạc lõng không gắn với nội dung nào
    // trên trang (đúng phần chủ quán chê "stray line"). Vẫn là 1 legend
    // CHUNG giải thích ký hiệu (dữ liệu chỉ có spicy:true/false, không có
    // thang số 1-3), không phải mức độ RIÊNG của món này.
    const legendHtml = item.spicy
      ? `<div class="feature-legend"><span class="legend-dot"></span>Ostre = danie pikantne</div>`
      : "";

    const article = document.createElement("article");
    article.className = "feature";
    article.innerHTML = `${mediaHtml}<div class="feature-body">
      ${pillHtml}
      <h2 class="feature-name">${name}</h2>
      ${desc}
      <div class="feature-prices">${flagsHtml}</div>
      ${legendHtml}
    </div>`;
    return article;
  }

  // ---------------------------------------------------------------------
  // Biến thể món (variants) — mô hình dữ liệu mới, xem ARCHITECTURE.md (chưa
  // cập nhật field mới ở đây — variantAxes/variants/spicy/vege/best là phần
  // mở rộng của tài liệu đang chờ được người phụ trách chốt vào hợp đồng):
  //   variantAxes: string[]                 0, 1, hoặc 2 tên trục (vd
  //                                          ["Białko","Wielkość"])
  //   variants: [{ axis: string[], price }] mỗi lựa chọn 1 giá
  // display.js CHỌN chiến lược hiển thị bằng cách XEM DỮ LIỆU (số trục, giá có
  // bằng nhau không) — KHÔNG hardcode theo item.category, đúng yêu cầu kiến
  // trúc: món mới thêm ở category bất kỳ vẫn tự động render đúng miễn có đúng
  // shape variants/variantAxes.
  //   - không có variants (hoặc chỉ 1 lựa chọn) -> giá đơn (đường cũ, không
  //     đổi — không cần migrate document cũ chỉ có field `price`)
  //   - 2 trục -> khoảng giá ("17–23") + caption "N smaki × M rozmiary"
  //   - 1 trục, giá bằng nhau hết -> giá đơn + caption "N smaków do wyboru"
  //   - 1 trục, giá khác nhau -> "od X" + caption như trên
  // Khi KHÔNG có caption biến thể (giá đơn, không trục), dòng lựa chọn rơi về
  // mô tả món (desc_pl) như hành vi cũ, để không mất nội dung admin đã nhập
  // cho món chưa có biến thể.
  // ---------------------------------------------------------------------

  /** Số nhiều tiếng Ba Lan theo quy tắc đếm chuẩn: 1 -> forms[0], 2-4 (trừ
   * 12-14) -> forms[1], còn lại (5+, và 12-14) -> forms[2]. */
  function pluralPl(n, forms) {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n === 1) return forms[0];
    if (n10 >= 2 && n10 <= 4 && !(n100 >= 12 && n100 <= 14)) return forms[1];
    return forms[2];
  }

  // Từ mô tả trục PHỤ (trục thứ 2 trong biến thể 2 trục, hoặc trục DUY NHẤT
  // trong biến thể 1 trục) — tra theo CHÍNH TÊN TRỤC trong dữ liệu (variantAxes),
  // không phải theo category, nên món mới ở category bất kỳ tự động đúng chữ
  // miễn variantAxes đặt tên đúng quy ước. "smak" (hương vị) là mặc định an
  // toàn khi không khớp tên nào — đúng với đa số biến thể thực đơn thật
  // (nước sốt/hương vị), xem seed-data.js.
  const AXIS_WORD_FORMS = {
    "Wielkość": ["rozmiar", "rozmiary", "rozmiarów"],
    "Ilość": ["porcja", "porcje", "porcji"],
    "Dodatek": ["dodatek", "dodatki", "dodatków"],
    default: ["smak", "smaki", "smaków"],
  };
  const AXIS1_WORD_FORMS = ["smak", "smaki", "smaków"]; // trục thứ 1 trong biến thể 2 trục — LUÔN "smak", xem ghi chú captionForVariants()
  const AXIS2_WORD_FORMS = ["rozmiar", "rozmiary", "rozmiarów"]; // trục thứ 2 trong biến thể 2 trục — LUÔN "rozmiar"

  function wordFormsForAxis(axisName) {
    return AXIS_WORD_FORMS[axisName] || AXIS_WORD_FORMS.default;
  }

  function distinctCount(values) {
    return new Set(values.map((v) => String(v == null ? "" : v))).size;
  }

  /**
   * Tính { priceText, caption } cho 1 món theo đúng 4 chiến lược ở trên.
   * @param {object} item
   * @param {string|undefined} currency - state.settings.currency
   */
  function priceAndCaptionFor(item, currency) {
    const rawVariants = Array.isArray(item.variants) ? item.variants : [];
    const variants = rawVariants.filter((v) => v && Number.isFinite(Number(v.price)));
    const axes = Array.isArray(item.variantAxes) ? item.variantAxes : [];

    // Không có biến thể (hoặc chỉ 1 lựa chọn duy nhất -> không thực sự là 1
    // "lựa chọn") -> đường cũ, không đổi hành vi với document cũ chỉ có field
    // `price` phẳng.
    if (variants.length <= 1) {
      const price = variants.length === 1 ? variants[0].price : item.price;
      return {
        // formatPrice() đã tự escape phần văn bản tự do (currency/suffix) —
        // KHÔNG escape thêm lần nữa ở đây (double-escape sẽ làm hỏng "&" nếu
        // admin từng nhập currency/suffix chứa ký tự đó).
        priceText: formatPrice(price, item.priceSuffix, currency),
        caption: item.desc_pl || "",
      };
    }

    const prices = variants.map((v) => Number(v.price));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const suffix = item.priceSuffix;

    if (axes.length >= 2) {
      const n1 = distinctCount(variants.map((v) => (Array.isArray(v.axis) ? v.axis[0] : "")));
      const n2 = distinctCount(variants.map((v) => (Array.isArray(v.axis) ? v.axis[1] : "")));
      const priceText = min === max
        ? formatPrice(min, suffix, currency)
        : formatPriceRange(min, max, suffix, currency);
      const caption = `${n1} ${pluralPl(n1, AXIS1_WORD_FORMS)} × ${n2} ${pluralPl(n2, AXIS2_WORD_FORMS)}`;
      return { priceText, caption };
    }

    // 1 trục (hoặc variantAxes thiếu/rỗng nhưng vẫn có >=2 variants — coi như
    // 1 trục ẩn danh, dùng chữ mặc định "smak").
    const axisName = axes.length === 1 ? axes[0] : undefined;
    const forms = wordFormsForAxis(axisName);
    const n = variants.length;
    const caption = `${n} ${pluralPl(n, forms)} do wyboru`;
    const priceText = min === max
      ? formatPrice(min, suffix, currency)
      : `od ${formatPrice(min, suffix, currency)}`;
    return { priceText, caption };
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
    const iconKey = CATEGORY_GLYPH_KEY[key] || CATEGORY_GLYPH_KEY.default;
    const inner = CATEGORY_GLYPH_ICONS[iconKey] || CATEGORY_GLYPH_ICONS.plate;
    // fill="none" + stroke="currentColor" trên <svg> gốc được mọi phần tử con
    // (path/circle/ellipse) kế thừa qua CSS presentation attribute — không
    // cần lặp lại trên từng path. currentColor ăn theo `color` của
    // .placeholder-glyph (đặt bằng var(--text) trong display.css) nên đổi
    // theme là glyph đổi màu theo, giống hệt outline chữ.
    return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  }

  // Số nguyên -> KHÔNG ép 2 chữ số thập phân (28, không phải 28,00) — đúng
  // hình ảnh giá đã đo/duyệt (xem scratchpad/revA2/pairings/measure_output.json,
  // mọi giá trong thực đơn thật đều hiện dạng "28"/"38" không ",00"). Có phần
  // thập phân (vd 4.5 -> "4,50") -> vẫn ép đủ 2 chữ số kiểu tiền Ba Lan (dấu
  // phẩy thập phân — xem toLocaleString("pl-PL")), không rút gọn "4,5".
  function formatNumberPl(num) {
    if (!Number.isFinite(num)) return "—";
    return Number.isInteger(num)
      ? num.toLocaleString("pl-PL")
      : num.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /**
   * Hậu tố tiền tệ (vd " zł") — hoặc CHUỖI RỖNG nếu currency:"" (cách chính
   * thức để TẮT hậu tố tiền tệ, xem ghi chú formatPrice() bên dưới).
   */
  function currencySuffix(currency) {
    // BUG CŨ: `currency || "zł"` coi currency:"" (chuỗi rỗng, giá trị HỢP LỆ
    // — không phải "thiếu") là falsy rồi vẫn ép về "zł", nên trước đây KHÔNG
    // CÓ CÁCH NÀO tắt hậu tố tiền tệ qua settings.currency. Chỉ null/undefined
    // (field thật sự chưa từng tồn tại trong document) mới nên fallback "zł"
    // — tương thích ngược 100% với document cũ không có field currency. Thiết
    // kế đã duyệt (scratchpad/revA2/pairings, pairing 1) không hiện hậu tố
    // tiền tệ trên thẻ món -> seed-data.js đặt settings.currency:"".
    const cur = currency != null ? currency : "zł";
    return cur ? ` ${escapeHtml(cur)}` : "";
  }

  function formatPrice(price, suffix, currency) {
    const formatted = formatNumberPl(Number(price));
    const suf = suffix ? ` ${escapeHtml(String(suffix))}` : "";
    return `${formatted}${currencySuffix(currency)}${suf}`;
  }

  /** Khoảng giá cho biến thể 2 trục, vd "17–23 zł" — dùng chung logic tiền tệ/
   * hậu tố với formatPrice() (chỉ hiện 1 lần ở cuối, không lặp lại 2 lần). */
  function formatPriceRange(min, max, suffix, currency) {
    const formatted = `${formatNumberPl(min)}–${formatNumberPl(max)}`;
    const suf = suffix ? ` ${escapeHtml(String(suffix))}` : "";
    return `${formatted}${currencySuffix(currency)}${suf}`;
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
