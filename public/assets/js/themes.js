// =============================================================================
// themes.js
// -----------------------------------------------------------------------------
// Xuất ra:
//   - THEMES         : object 6 theme mẫu theo mùa (khớp schema themes/{themeId}
//                       trong ARCHITECTURE.md mục 8)
//   - applyTheme(el, theme) : ghi các CSS custom properties lên phần tử gốc
//   - mergeTheme(presetId, overrides) : lấy 1 preset rồi ghi đè bằng dữ liệu
//                       tuỳ biến admin lưu trong Firestore (themes/{themeId})
//
// Mỗi theme được chọn màu để: tương phản cao, "ngon mắt" (làm nổi bật đồ ăn),
// đọc được từ xa vài mét trên màn hình 50". Nền luôn tối/đậm hoặc có lớp thẻ
// (cardBg) đủ tối để chữ trắng/kem nổi rõ, tránh chói lóa như nền trắng thuần.
// =============================================================================

export const THEMES = {
  // ---------------------------------------------------------------------
  // Mặc định — "Hanabi" (pháo hoa Nhật Bản): đỏ torii + vàng ánh kim trên
  // nền tím-đen sâu, gợi không khí quán ramen/sushi về đêm.
  // ---------------------------------------------------------------------
  hanabi: {
    name_vi: "Mặc định (Hanabi)",
    bg: "#0d0d17",
    bgGradient: "linear-gradient(135deg, #1a0f2e 0%, #0d0d17 55%, #1c0a0a 100%)",
    textColor: "#fff5e6",
    outlineColor: "#000000",
    outlineWidth: 2,
    accent: "#ff3b57",
    priceColor: "#ffd166",
    cardBg: "rgba(10,10,20,0.55)",
    fontHeading: "Bebas Neue",
    fontBody: "Inter",
    particles: "fireworks",
    overlayImage: "",
  },

  // ---------------------------------------------------------------------
  // Giáng sinh (Boże Narodzenie): xanh thông đậm + đỏ + vàng, tuyết rơi.
  // ---------------------------------------------------------------------
  christmas: {
    name_vi: "Giáng sinh (Boże Narodzenie)",
    bg: "#0b1d16",
    bgGradient: "linear-gradient(160deg, #0d2a1c 0%, #0b1d16 55%, #08120e 100%)",
    textColor: "#ffffff",
    outlineColor: "#052008",
    outlineWidth: 2,
    accent: "#e63946",
    priceColor: "#ffd166",
    cardBg: "rgba(6,20,14,0.55)",
    fontHeading: "Bebas Neue",
    fontBody: "Inter",
    particles: "snow",
    overlayImage: "",
  },

  // ---------------------------------------------------------------------
  // Năm mới (Sylwester / Nowy Rok): xanh navy đen huyền bí + vàng kim,
  // pháo hoa ăn mừng năm mới.
  // ---------------------------------------------------------------------
  newyear: {
    name_vi: "Năm mới (Sylwester / Nowy Rok)",
    bg: "#05050f",
    bgGradient: "linear-gradient(135deg, #0a0a2a 0%, #05050f 55%, #1a0a1a 100%)",
    textColor: "#fdf6e3",
    outlineColor: "#000000",
    outlineWidth: 2,
    accent: "#ffd700",
    priceColor: "#ff4d6d",
    cardBg: "rgba(10,10,25,0.55)",
    fontHeading: "Bebas Neue",
    fontBody: "Inter",
    particles: "fireworks",
    overlayImage: "",
  },

  // ---------------------------------------------------------------------
  // Lễ Phục sinh (Wielkanoc): tông pastel xuân, thẻ nền sáng bán trong
  // suốt để vẫn giữ độ tương phản tốt cho chữ đậm màu.
  // ---------------------------------------------------------------------
  easter: {
    name_vi: "Lễ Phục sinh (Wielkanoc)",
    bg: "#ffe8ef",
    bgGradient: "linear-gradient(135deg, #fff1e6 0%, #ffe8ef 45%, #e8f6e3 100%)",
    textColor: "#3a2417",
    outlineColor: "#ffffff",
    outlineWidth: 2,
    accent: "#ff6f91",
    priceColor: "#7b4fa0",
    cardBg: "rgba(255,255,255,0.62)",
    fontHeading: "Poppins",
    fontBody: "Nunito",
    particles: "petals",
    overlayImage: "",
  },

  // ---------------------------------------------------------------------
  // Halloween / Wszystkich Świętych: cam-đen huyền bí, than hồng bay.
  // ---------------------------------------------------------------------
  halloween: {
    name_vi: "Halloween / Wszystkich Świętych",
    bg: "#0d0704",
    bgGradient: "linear-gradient(160deg, #1a0d05 0%, #0d0704 55%, #1a0505 100%)",
    textColor: "#ffe9c7",
    outlineColor: "#000000",
    outlineWidth: 2,
    accent: "#ff7518",
    priceColor: "#b6ff3c",
    cardBg: "rgba(10,5,3,0.6)",
    fontHeading: "Bebas Neue",
    fontBody: "Inter",
    particles: "embers",
    overlayImage: "",
  },

  // ---------------------------------------------------------------------
  // Mùa hè (Lato / Grill): xanh biển đậm + cam vàng rực, bong bóng nhẹ.
  // ---------------------------------------------------------------------
  summer: {
    name_vi: "Mùa hè (Lato / Grill)",
    bg: "#012a4a",
    bgGradient: "linear-gradient(135deg, #013a63 0%, #012a4a 55%, #01111f 100%)",
    textColor: "#ffffff",
    outlineColor: "#012a4a",
    outlineWidth: 2,
    accent: "#ffb703",
    priceColor: "#fb8500",
    cardBg: "rgba(1,42,74,0.5)",
    fontHeading: "Bebas Neue",
    fontBody: "Inter",
    particles: "bubbles",
    overlayImage: "",
  },
};

// =============================================================================
// Toán tương phản WCAG — dùng để TỰ TÍNH (không phải admin tự chọn thêm field
// nào mới trong themes/{id}, không đụng tới ARCHITECTURE.md mục 2/8) 2 biến
// suy ra ở dưới:
//   --scrim-rgb   nền lớp phủ (scrim) sau thẻ món — ĐEN cho theme chữ sáng
//                 (5/6 theme), TRẮNG cho theme chữ tối (vd Wielkanoc/Easter,
//                 chữ nâu đậm #3a2417 vốn thiết kế cho nền trang SÁNG, không
//                 phải cho lớp phủ ảnh món tối) — xem pickScrimBase() bên dưới.
//   --accent-ink / --price-ink   màu chữ trên ribbon/badge giá — TRƯỚC ĐÂY
//                 dùng cứng var(--bg), đúng cho 5 theme nền tối nhưng SAI cho
//                 Easter (--bg là hồng pastel rất sáng) khiến chữ ribbon/badge
//                 gần như cùng độ sáng với chính nền ribbon/badge. Tự chọn
//                 đen/trắng theo độ tương phản thật với accent/priceColor của
//                 TỪNG theme thay vì giả định --bg luôn tối, nên vẫn đúng nếu
//                 sau này admin tự đổi màu tuỳ biến bất kỳ (themes/{id} override).
// -----------------------------------------------------------------------------
// Đây là FIX CẤU TRÚC cho lỗi "chữ mô tả không đọc được trên theme Easter"
// (xem ghi chú trong display.css, khối "Lớp phủ (scrim)"): thay vì hạ 1 mã
// màu textColor cho tới khi qua được 1 theme, ta làm cho chính LỚP PHỦ (nền
// trung tính, không thuộc bộ nhận diện theo mùa) tự thích nghi với việc
// textColor của theme đó SÁNG hay TỐI — đúng bản chất vấn đề: 5/6 theme thiết
// kế chữ sáng cho nền tối (khớp lớp phủ đen mặc định), riêng Easter thiết kế
// chữ tối cho nền sáng (xem comment gốc trong THEMES.easter ở trên: "thẻ nền
// sáng bán trong suốt") — nhưng lớp phủ trên ảnh món lại LUÔN đen, bất kể
// theme, nên riêng Easter bị lệch hoàn toàn. Không sửa vì hoàn cảnh 1 theme —
// sửa vì NGUYÊN LÝ ("scrim phải cùng "cực sáng/tối" với textColor") đúng cho
// cả 6 theme hiện có VÀ mọi theme tuỳ biến admin tự tạo sau này.
function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

/** Phân tích "#rgb"/"#rrggbb"/"rgb(...)"/"rgba(...)" -> [r,g,b] (0-255), null nếu không đọc được. */
function parseColorToRgb(input) {
  if (typeof input !== "string" || !input.trim()) return null;
  const s = input.trim();
  if (s[0] === "#") {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    if (hex.length !== 6) return null;
    const n = parseInt(hex, 16);
    if (Number.isNaN(n)) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

/** Độ chói tương đối theo WCAG 2.x (0 = đen tuyệt đối, 1 = trắng tuyệt đối). */
function relativeLuminance(colorStr) {
  const rgb = parseColorToRgb(colorStr);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) => {
    const v = clamp01(c / 255);
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Tỉ lệ tương phản WCAG giữa 2 màu bất kỳ, luôn ≥ 1 (1 = không tương phản). */
function contrastRatio(colorA, colorB) {
  const La = relativeLuminance(colorA);
  const Lb = relativeLuminance(colorB);
  const lighter = Math.max(La, Lb);
  const darker = Math.min(La, Lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Chọn mực (đen hoặc trắng) cho chữ đặt trên 1 nền MÀU ĐẶC (không phải ảnh) —
 * dùng cho ribbon/price-badge. Trả về màu cho tương phản CAO HƠN trong 2 lựa
 * chọn — luôn ≥ tương phản của "màu ngẫu nhiên bất kỳ", không cần biết trước
 * nền đó sáng hay tối.
 */
function pickInkForSolidBg(bgColorStr) {
  const withBlack = contrastRatio(bgColorStr, "#000000");
  const withWhite = contrastRatio(bgColorStr, "#ffffff");
  return withWhite >= withBlack ? "#ffffff" : "#000000";
}

/**
 * Chọn "cực" (đen hay trắng) cho gốc màu lớp phủ (scrim) sau thẻ món, DỰA
 * TRÊN CHÍNH textColor của theme — không phải dựa trên bg hay accent. Chữ
 * sáng (đa số theme) -> scrim tối (như cũ, KHÔNG đổi hành vi 5/6 theme hiện
 * có). Chữ tối (Easter) -> scrim SÁNG, để chữ tối luôn có 1 nền đủ sáng đọc
 * được, bất kể ảnh món bên dưới sáng hay tối thế nào.
 * @returns {string} "0,0,0" hoặc "255,255,255" — dùng thẳng trong rgba(var(--scrim-rgb), alpha)
 */
function pickScrimBase(textColorStr) {
  const withBlack = contrastRatio(textColorStr, "#000000");
  const withWhite = contrastRatio(textColorStr, "#ffffff");
  return withWhite >= withBlack ? "255,255,255" : "0,0,0";
}

/**
 * Ghi các CSS custom properties của theme lên phần tử gốc (thường là <html>
 * hoặc <body> của omhN.html / iframe preview trong admin).
 * @param {HTMLElement} rootEl
 * @param {object} theme - object theo schema themes/{themeId}
 */
export function applyTheme(rootEl, theme) {
  if (!rootEl || !theme) return;

  const outlineWidth =
    theme.outlineWidth === undefined || theme.outlineWidth === null
      ? 2
      : theme.outlineWidth;

  const textColor = theme.textColor || "#ffffff";
  const accent = theme.accent || "#e63946";
  const priceColor = theme.priceColor || "#ffd166";

  rootEl.style.setProperty("--bg", theme.bg || "#000000");
  rootEl.style.setProperty("--text", textColor);
  rootEl.style.setProperty("--outline", theme.outlineColor || "#000000");
  // Ghi SỐ THÔ, không đơn vị — "px ở màn 1920 CSS px" theo đúng đơn vị admin
  // đang nhập (xem numberFieldHtml("outlineWidth", ...) trong admin.js).
  // display.css tự quy đổi sang rem tại điểm dùng (--outline-w) để viền chữ
  // phóng to đúng tỉ lệ với chữ ở 4K — KHÔNG ghi "px" cứng ở đây nữa.
  rootEl.style.setProperty("--outline-w-base", String(outlineWidth));
  rootEl.style.setProperty("--accent", accent);
  rootEl.style.setProperty("--price", priceColor);
  rootEl.style.setProperty("--card-bg", theme.cardBg || "rgba(0,0,0,.35)");
  rootEl.style.setProperty("--font-heading", theme.fontHeading || "Bebas Neue");
  rootEl.style.setProperty("--font-body", theme.fontBody || "Inter");

  // 3 biến SUY RA (không do admin nhập, không nằm trong schema themes/{id})
  // — xem khối toán tương phản WCAG phía trên khối này để hiểu vì sao.
  rootEl.style.setProperty("--scrim-rgb", pickScrimBase(textColor));
  rootEl.style.setProperty("--accent-ink", pickInkForSolidBg(accent));
  rootEl.style.setProperty("--price-ink", pickInkForSolidBg(priceColor));

  // Hai biến bổ sung (không nằm trong 9 biến bắt buộc của hợp đồng, nhưng cần
  // thiết để CSS ghép `background-image: var(--overlay-image), var(--bg-gradient)`
  // hoạt động đúng) — luôn phải là giá trị CSS <image> hợp lệ hoặc từ khoá "none".
  rootEl.style.setProperty("--bg-gradient", theme.bgGradient ? theme.bgGradient : "none");
  rootEl.style.setProperty(
    "--overlay-image",
    theme.overlayImage ? `url("${theme.overlayImage}")` : "none"
  );
}

/**
 * Lấy 1 preset trong THEMES rồi ghi đè bằng dữ liệu tuỳ biến (vd admin lưu
 * trong Firestore themes/{themeId} để chỉnh tay từng màu trên preset có sẵn).
 * @param {string} presetId - khóa trong THEMES, vd "hanabi"
 * @param {object} [overrides] - các field muốn ghi đè lên preset
 * @returns {object} theme đã merge (không sửa THEMES gốc)
 */
export function mergeTheme(presetId, overrides = {}) {
  const preset = THEMES[presetId] || THEMES.hanabi;
  return { ...preset, ...(overrides || {}) };
}
