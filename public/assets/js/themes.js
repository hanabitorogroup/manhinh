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
// đọc được từ xa vài mét trên màn hình 50".
//
// ĐỔI HƯỚNG PALETTE (port thiết kế đã duyệt, xem scratchpad/revA2/pairings —
// "pairing 1"): nền SÁNG BÃO HOÀ + MỰC TỐI, không còn nền tối/đậm + chữ sáng
// như bản cũ. Lý do không chỉ là gu thẩm mỹ — đây là SỬA LỖI CHỨC NĂNG: ảnh
// món giờ dùng object-fit:contain (xem display.css .card-media img), tức
// phần thừa quanh ảnh lộ ra CHÍNH MÀU NỀN THẺ (cardBg, giờ là màu ĐẶC, không
// còn rgba mờ phủ lên ảnh cover kín thẻ như trước). Với 5/6 theme cũ (nền gần
// đen), 1 đĩa món ăn màu đen/sẫm chụp trên đĩa tối đo được chỉ ~1.01:1 tương
// phản với chính nền thẻ — đĩa/viền món COI NHƯ BIẾN MẤT, không phải lỗi nhỏ.
// Nền vàng bão hoà (bản duyệt) đo được 12.07:1 với đĩa gần đen — số đo target
// cho cả 6 theme ở đây. Bản sắc theo mùa vẫn giữ qua HUE (vàng ấm/xanh lá
// bạc hà/vàng chanh/vàng nghệ/cam bí ngô/lam ngọc) + accent + loại hạt hiệu
// ứng — không giữ qua độ tối/sáng của nền như trước (không còn cách nào giữ
// độ tối MÀ VẪN đảm bảo đĩa tối không biến mất, 2 yêu cầu loại trừ nhau).
//
// cardBg giờ là màu ĐẶC (không phải rgba mờ) — đây chính là "nền" mà đĩa món
// phải nổi lên trên, không phải lớp phủ lên ảnh nữa (xem display.css, phần
// "Thẻ món"). bg/bgGradient (nền .stage, chỉ lộ ra ở khe hở/lề ngoài lưới)
// dùng cùng tông màu với cardBg để toàn màn hình nhất quán 1 "ground" duy
// nhất, có gradient rất nhẹ cùng tông (không phải tối góc như bản cũ) cho đỡ
// phẳng tuyệt đối.
//
// Số đo tương phản CHỮ (textColor vs cardBg) và ĐĨA (cardBg vs #141414, tông
// đĩa/sản phẩm gần đen điển hình) từng theme — WCAG relative luminance,
// dùng chung công thức contrastRatio() ở dưới file này:
//   hanabi     — chữ 12.07:1  đĩa 11.99:1  (chính là số đo bản duyệt gốc)
//   christmas  — chữ  9.67:1  đĩa 12.04:1
//   newyear    — chữ 13.65:1  đĩa 13.05:1
//   easter     — chữ 10.08:1  đĩa 12.78:1
//   halloween  — chữ  8.18:1  đĩa  7.91:1
//   summer     — chữ  8.19:1  đĩa 10.28:1
// Cả 6 theme đều vượt xa cả sàn WCAG AA (4.5:1) LẪN AAA (7:1) cho chữ, và
// vượt xa mức ~1.01:1 (đĩa biến mất) đo được ở bản cũ cho phần đĩa.
// =============================================================================

export const THEMES = {
  // ---------------------------------------------------------------------
  // Mặc định — "Hanabi" (pháo hoa Nhật Bản): nền vàng ấm bão hoà (ĐÚNG màu đã
  // duyệt/đo trong bản mockup pairing 1), mực nâu-đen, đỏ torii làm accent.
  // ---------------------------------------------------------------------
  hanabi: {
    name_vi: "Mặc định (Hanabi)",
    bg: "#ffc93c",
    bgGradient: "linear-gradient(135deg, #ffd65c 0%, #ffc93c 60%, #f5b62c 100%)",
    textColor: "#1a1206",
    outlineColor: "#1a1206",
    outlineWidth: 2,
    accent: "#c0392b",
    // GIÁ TRỊ ĐÃ DUYỆT (scratchpad/revA2/pairings/build_pairings.py:
    // --price-bg:#1a1206; --price-ink:#ffc400;) — số giá GHI BẰNG GOLD trên
    // chip nền TỐI (var(--outline), xem display.css .price-tag), không phải
    // ngược lại. Trước đây field này bị đặt trùng với textColor (mực tối)
    // khiến .price-tag (nền = var(--price), chữ = var(--price-ink) suy ra
    // tương phản) render ra "chip tối + SỐ TRẮNG" — lệch hẳn bản duyệt (chip
    // tối + SỐ VÀNG GOLD). Đây là 1 trong 3 sai lệch chủ quán chỉ ra rõ ràng —
    // xem display.css phần "Giá — TO HƠN tên món" để biết vai trò 2 biến giờ
    // đã tách bạch: var(--outline) = nền chip (tối, dùng lại biến viền chữ có
    // sẵn), var(--price) = MÀU SỐ (gold, đúng field priceColor này).
    priceColor: "#ffc400",
    cardBg: "#ffc93c",
    fontHeading: "Bebas Neue",
    fontBody: "Inter",
    particles: "fireworks",
    overlayImage: "",
  },

  // ---------------------------------------------------------------------
  // Giáng sinh (Boże Narodzenie): xanh lá bạc hà tươi bão hoà (thay vì xanh
  // thông tối) + đỏ + vàng, mực xanh thông đậm, tuyết rơi.
  // ---------------------------------------------------------------------
  christmas: {
    name_vi: "Giáng sinh (Boże Narodzenie)",
    bg: "#8fe3a8",
    bgGradient: "linear-gradient(160deg, #a8edbb 0%, #8fe3a8 55%, #78d494 100%)",
    textColor: "#0b2e18",
    outlineColor: "#0b2e18",
    outlineWidth: 2,
    accent: "#c8102e",
    // Gold — cùng nguyên tắc đã ghi ở THEMES.hanabi (chip TỐI/var(--outline) +
    // SỐ VÀNG, không còn trùng textColor/SỐ TRẮNG như trước).
    priceColor: "#ffd166",
    cardBg: "#8fe3a8",
    fontHeading: "Bebas Neue",
    fontBody: "Inter",
    particles: "snow",
    overlayImage: "",
  },

  // ---------------------------------------------------------------------
  // Năm mới (Sylwester / Nowy Rok): vàng chanh bão hoà (lạnh/sáng hơn vàng ấm
  // của Hanabi để phân biệt), mực xanh navy đậm, hồng làm accent lễ hội.
  // ---------------------------------------------------------------------
  newyear: {
    name_vi: "Năm mới (Sylwester / Nowy Rok)",
    bg: "#ffd60a",
    bgGradient: "linear-gradient(135deg, #ffe14d 0%, #ffd60a 55%, #f2c400 100%)",
    textColor: "#0a0a2a",
    outlineColor: "#0a0a2a",
    outlineWidth: 2,
    accent: "#ff4d6d",
    // Gold — như trên (THEMES.hanabi).
    priceColor: "#ffe066",
    cardBg: "#ffd60a",
    fontHeading: "Bebas Neue",
    fontBody: "Inter",
    particles: "fireworks",
    overlayImage: "",
  },

  // ---------------------------------------------------------------------
  // Lễ Phục sinh (Wielkanoc): vàng trứng gà tươi bão hoà (đậm hơn bản pastel
  // cũ để đủ tương phản đĩa), mực nâu ấm — giữ nguyên tinh thần bản gốc
  // (textColor/accent/priceColor cũ), chỉ đổi cardBg từ trắng mờ sang màu đặc.
  // ---------------------------------------------------------------------
  easter: {
    name_vi: "Lễ Phục sinh (Wielkanoc)",
    bg: "#ffd166",
    bgGradient: "linear-gradient(135deg, #ffe08c 0%, #ffd166 55%, #ffc247 100%)",
    textColor: "#3a2417",
    outlineColor: "#3a2417",
    outlineWidth: 2,
    accent: "#ff6f91",
    // Trước đây là tím (#7b4fa0) — không phải bug "trùng textColor" như 4
    // theme kia, nhưng vẫn LỆCH bản duyệt (chip tối/var(--outline) + SỐ
    // VÀNG GOLD, xem THEMES.hanabi) nên đổi luôn cho nhất quán cả 6 theme.
    priceColor: "#ffcf5c",
    cardBg: "#ffd166",
    fontHeading: "Poppins",
    fontBody: "Nunito",
    particles: "petals",
    overlayImage: "",
  },

  // ---------------------------------------------------------------------
  // Halloween / Wszystkich Świętych: cam bí ngô bão hoà (thay vì cam-đen),
  // mực nâu gần đen, tím phù thuỷ làm accent, than hồng bay.
  // ---------------------------------------------------------------------
  halloween: {
    name_vi: "Halloween / Wszystkich Świętych",
    bg: "#ff8c1a",
    bgGradient: "linear-gradient(160deg, #ffa64d 0%, #ff8c1a 55%, #f07800 100%)",
    textColor: "#1a0d02",
    outlineColor: "#1a0d02",
    outlineWidth: 2,
    accent: "#6a1b9a",
    // Gold (cam-vàng) — như THEMES.hanabi.
    priceColor: "#ffb347",
    cardBg: "#ff8c1a",
    fontHeading: "Bebas Neue",
    fontBody: "Inter",
    particles: "embers",
    overlayImage: "",
  },

  // ---------------------------------------------------------------------
  // Mùa hè (Lato / Grill): lam ngọc (turquoise) bão hoà thay cho xanh biển
  // đậm, mực navy (giữ nguyên tông navy cũ nhưng đổi vai trò sang MỰC thay vì
  // NỀN), cam vàng rực làm accent/giá, bong bóng nhẹ.
  // ---------------------------------------------------------------------
  summer: {
    name_vi: "Mùa hè (Lato / Grill)",
    bg: "#31d6d6",
    bgGradient: "linear-gradient(135deg, #5fe3e3 0%, #31d6d6 55%, #20bcbc 100%)",
    textColor: "#012a4a",
    outlineColor: "#012a4a",
    outlineWidth: 2,
    accent: "#ffb703",
    // Trước đây "#fb8500" (cam) không trùng textColor nhưng vẫn LỆCH bản
    // duyệt — đổi sang gold nắng hè, cùng nguyên tắc với 5 theme kia.
    priceColor: "#ffd447",
    cardBg: "#31d6d6",
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
 * Ghép 1 tên font (admin nhập, có thể đã kèm sẵn dự phòng riêng — vd chuỗi có
 * dấu phẩy) thành 1 font-family stack CÓ DỰ PHÒNG, không bao giờ để trình
 * duyệt rơi thẳng về font mặc định của chính nó khi tên font không cài được
 * (xem ghi chú tại nơi gọi, applyTheme()).
 * @param {string|undefined} name - theme.fontHeading/fontBody, có thể rỗng
 * @param {string} defaultName - tên font mặc định nếu `name` rỗng
 * @param {string} fallback - phần dự phòng nối vào cuối (đã đúng cú pháp CSS)
 */
function fontStack(name, defaultName, fallback) {
  const primary = (typeof name === "string" && name.trim()) || defaultName;
  // Nếu admin đã tự nhập cả 1 stack đầy đủ (có dấu phẩy) thì tôn trọng nguyên
  // văn — không tự ý nối thêm, tránh trùng lặp/ghi đè ý định của admin.
  if (primary.includes(",")) return primary;
  const quoted = /\s/.test(primary) && !/^['"]/.test(primary) ? `'${primary}'` : primary;
  return `${quoted}, ${fallback}`;
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
  // BUG PHÁT HIỆN LÚC TỰ HOST FONT (kiểm bằng Playwright, xem báo cáo kèm
  // code review): setProperty() ghi ĐÚNG 1 tên font trần (vd "Bebas Neue"),
  // GHI ĐÈ luôn chuỗi dự phòng "Bebas Neue, Arial Narrow, sans-serif" đã đặt
  // sẵn trong khối mặc định #app { --font-heading: ... } ở display.css. Vì
  // Bebas Neue KHÔNG được tự host (ngoài phạm vi lần port này — chỉ tự host
  // Oswald 300 + Nunito 800 cho thẻ món, xem --font-name/--font-option) và
  // "Arial Narrow" không phải tên font generic (không đảm bảo máy nào cũng
  // có), trình duyệt không khớp được TÊN NÀO trong 1 mục duy nhất này nên rơi
  // thẳng về font mặc định của chính trình duyệt — trên nhiều Chromium/
  // WebView đó là 1 font CÓ CHÂN (serif), không phải sans-serif như thiết kế
  // — đo được thật trên .idle-logo/.menu-header (dùng --font-heading), xem
  // ảnh chụp kèm báo cáo. Sửa bằng cách LUÔN nối thêm chuỗi dự phòng khi ghi
  // biến — không tự host thêm font nào cả, chỉ khôi phục đúng hành vi "dự
  // phòng" mà file này vốn đã tài liệu hoá nhưng applyTheme() làm mất đi.
  rootEl.style.setProperty("--font-heading", fontStack(theme.fontHeading, "Bebas Neue", "'Arial Narrow', sans-serif"));
  rootEl.style.setProperty("--font-body", fontStack(theme.fontBody, "Inter", "'Segoe UI', 'Noto Sans', sans-serif"));

  // 3 biến SUY RA (không do admin nhập, không nằm trong schema themes/{id})
  // — xem khối toán tương phản WCAG phía trên khối này để hiểu vì sao.
  rootEl.style.setProperty("--scrim-rgb", pickScrimBase(textColor));
  rootEl.style.setProperty("--accent-ink", pickInkForSolidBg(accent));
  rootEl.style.setProperty("--price-ink", pickInkForSolidBg(priceColor));

  // --outline-ink (SUY RA, MỚI): mực đọc được đặt trên 1 nền ĐẶC màu
  // var(--outline) — dùng cho chữ PHỤ (không phải số giá vàng chính) đứng
  // trên cùng 1 chip tối, vd nhãn trục biến thể trên "flag-tag" của trang
  // nổi bật 1 món (xem display.css, khối "Trang nổi bật"). Cùng công thức
  // pickInkForSolidBg() với --accent-ink/--price-ink — không giả định
  // var(--outline) luôn tối (dù thực tế cả 6 theme đều đặt outlineColor =
  // textColor, luôn tối), để vẫn đúng nếu admin tự tuỳ biến outlineColor
  // sáng cho theme riêng.
  const outlineColor = theme.outlineColor || "#000000";
  rootEl.style.setProperty("--outline-ink", pickInkForSolidBg(outlineColor));

  // --line (SUY RA, MỚI): màu hairline phân cách các ô thẻ món trên nền
  // MÀU ĐẶC bão hoà (thiết kế đã duyệt — xem display.css khối "Thẻ món":
  // "flat colour field chạy sát mép, các ô chỉ phân cách bằng hairline",
  // KHÔNG còn box riêng/bo góc/khoảng gap). Lấy đúng công thức bản mockup
  // gốc đã duyệt (scratchpad/revA2/pairings/build_pairings.py:
  // "--line:rgba(26,18,6,.16)" — 26,18,6 chính là RGB của outlineColor
  // #1a1206 theme hanabi) — tức "màu mực của theme, mờ 16%", suy ra TỰ ĐỘNG
  // từ outlineColor cho ĐÚNG cả 6 theme (không hardcode 1 màu cứng, không
  // yêu cầu admin nhập thêm field mới nào trong schema themes/{id}).
  const outlineRgb = parseColorToRgb(outlineColor) || [0, 0, 0];
  rootEl.style.setProperty("--line", `rgba(${outlineRgb[0]}, ${outlineRgb[1]}, ${outlineRgb[2]}, 0.16)`);

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
