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

  rootEl.style.setProperty("--bg", theme.bg || "#000000");
  rootEl.style.setProperty("--text", theme.textColor || "#ffffff");
  rootEl.style.setProperty("--outline", theme.outlineColor || "#000000");
  rootEl.style.setProperty("--outline-w", `${outlineWidth}px`);
  rootEl.style.setProperty("--accent", theme.accent || "#e63946");
  rootEl.style.setProperty("--price", theme.priceColor || "#ffd166");
  rootEl.style.setProperty("--card-bg", theme.cardBg || "rgba(0,0,0,.35)");
  rootEl.style.setProperty("--font-heading", theme.fontHeading || "Bebas Neue");
  rootEl.style.setProperty("--font-body", theme.fontBody || "Inter");

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
