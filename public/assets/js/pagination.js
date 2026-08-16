// =============================================================================
// pagination.js — Thuật toán phân trang DÙNG CHUNG (ARCHITECTURE.md mục 3)
// -----------------------------------------------------------------------------
// NGUỒN DUY NHẤT của thuật toán "món nào lên trang nào, trang nào lên màn hình
// nào". Trước đây display.js (màn hình thật) và admin.js (sơ đồ "Bố cục") mỗi
// nơi cài một bản riêng và chúng LỆCH NHAU ở chế độ thủ công (admin dùng
// round-robin theo màn ít trang nhất, display.js chia khối theo mục 3) — khiến
// sơ đồ admin cho chủ quán xem không khớp với 4 màn hình thật. Từ giờ CẢ HAI
// import đúng module này, không ai được tự cài lại thuật toán.
//
// Nếu cần sửa cách phân trang, sửa DUY NHẤT ở đây rồi kiểm tra cả display.js
// lẫn admin.js (tab Tổng quan + Bố cục) vẫn khớp nhau.
// =============================================================================

export function numOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Sắp xếp theo (order asc, name_pl asc) — thứ tự toàn cục chuẩn mục 3. */
export function sortItems(items) {
  return items.slice().sort((a, b) => {
    const oa = numOr(a.order, 0);
    const ob = numOr(b.order, 0);
    if (oa !== ob) return oa - ob;
    return String(a.name_pl || "").localeCompare(String(b.name_pl || ""), "pl");
  });
}

export function chunk(arr, size) {
  const n = Math.max(1, Number(size) || 1);
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Tính danh sách TRANG LƯỚI (mỗi trang = mảng món, hiển thị dạng lưới nhiều
 * ô) cho MỘT màn hình cụ thể, đúng thuật toán ARCHITECTURE.md mục 3. Đây là
 * phần thuật toán GỐC (chưa tính trang nổi bật) — computeScreenPages() bên
 * dưới mới là hàm CÔNG KHAI (bọc thêm trang nổi bật khi settings.layout =
 * "grid+featured", xem JSDoc ở đó).
 *
 * Chế độ "auto": chia đều toàn bộ số trang cho 4 màn hình theo thứ tự
 * (perScreen = ceil(pages.length/4), cắt theo screenId).
 *
 * Chế độ "manual": món screenLock = 1..4 được GHIM vào đúng màn đó — các
 * trang ghim hiển thị TRƯỚC. Món còn lại (screenLock = 0, thiếu, hoặc ngoài
 * phạm vi 1..4 — "trôi nổi") KHÔNG được phép biến mất khỏi cả 4 màn hình: nhóm
 * này dùng ĐÚNG thuật toán khối của chế độ tự động (sort toàn cục → chunk →
 * ceil(len/4) trang mỗi màn, cắt theo screenId) rồi nối vào SAU các trang ghim,
 * để không phụ thuộc trạng thái riêng của từng màn (không tranh chấp trang).
 *
 * @param {object} settings - { itemsPerPage, distribution }
 * @param {array} items - toàn bộ menu (chưa lọc visible)
 * @param {number} screenId - 1..4
 * @returns {array[]} mảng các trang, mỗi trang là mảng món
 */
function computeGridPages(settings, items, screenId) {
  if (!settings) return [];
  const itemsPerPage = settings.itemsPerPage;
  const visible = (items || []).filter((i) => i && i.visible !== false);

  if (settings.distribution === "manual") {
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

  const sorted = sortItems(visible);
  const pages = chunk(sorted, itemsPerPage);
  const perScreen = Math.ceil(pages.length / 4) || 0;
  const start = (screenId - 1) * perScreen;
  return pages.slice(start, start + perScreen);
}

/**
 * Tính danh sách trang CUỐI CÙNG cho 1 màn hình — trang lưới (computeGridPages,
 * KHÔNG đổi thuật toán mục 3) CỘNG THÊM 1 "trang nổi bật" (1 món duy nhất,
 * chiếm toàn panel) khi settings.layout === "grid+featured" (Option 2, xem
 * display.css khối "Trang nổi bật" + display.js buildFeaturedArticle()).
 *
 * Mô hình "trang" CHỦ ĐỘNG GIỮ ĐƠN GIẢN theo đúng yêu cầu "không phát minh 1
 * page-builder nặng": KHÔNG có danh sách trang tuỳ ý admin sắp xếp tự do —
 * chỉ có ĐÚNG 2 khối trang mỗi màn hình (khối trang lưới, do thứ tự món +
 * itemsPerPage + distribution quyết định — admin đổi thứ tự bằng kéo-thả ở
 * tab "Món ăn", ĐÃ có sẵn; và 0-hoặc-1 trang nổi bật) và ĐÚNG 1 chỗ có thể
 * "sắp xếp lại": settings.featuredPosition ("before" | "after") quyết định
 * trang nổi bật hiện TRƯỚC hay SAU khối trang lưới trong vòng xoay của màn
 * hình đó — admin KHÔNG thể chen trang nổi bật vào GIỮA 2 trang lưới, và
 * KHÔNG thể đổi thứ tự CÁC trang lưới với nhau độc lập với thứ tự món (xem
 * README/JSDoc admin.js phần renderFeaturedControls() để biết đúng những gì
 * admin làm được/không làm được).
 *
 * Nếu layout="grid+featured" nhưng màn hình N CHƯA được chủ quán chọn món
 * nổi bật (settings.featuredByScreen[N] thiếu/rỗng, hoặc trỏ tới 1 id không
 * còn tồn tại/không còn visible) → rơi về ĐÚNG trang lưới như layout="grid",
 * KHÔNG BAO GIỜ để màn hình trống hay vỡ vì thiếu lựa chọn — cùng nguyên tắc
 * phòng thủ "không bao giờ để màn hình trống" xuyên suốt hệ thống này.
 *
 * @param {object} settings - { itemsPerPage, distribution, layout,
 *   featuredByScreen, featuredPosition }
 * @param {array} items - toàn bộ menu (chưa lọc visible)
 * @param {number} screenId - 1..4
 * @returns {array[]} mảng các trang; trang nổi bật là 1 mảng [item] có thêm
 *   thuộc tính `.featured = true` (đọc bằng Array.isArray(page) && page.featured)
 *   để display.js/admin.js phân biệt với trang lưới thường mà KHÔNG cần đổi
 *   shape (vẫn là 1 mảng món, tương thích ngược với mọi chỗ đang lặp `.items`).
 */
export function computeScreenPages(settings, items, screenId) {
  const gridPages = computeGridPages(settings, items, screenId);
  if (!settings || settings.layout !== "grid+featured") return gridPages;

  const visible = (items || []).filter((i) => i && i.visible !== false);
  const featuredMap = settings.featuredByScreen && typeof settings.featuredByScreen === "object"
    ? settings.featuredByScreen
    : {};
  const featuredId = featuredMap[screenId];
  const featuredItem = featuredId ? visible.find((i) => i && i.id === featuredId) : null;
  if (!featuredItem) return gridPages;

  const featuredPage = [featuredItem];
  featuredPage.featured = true;
  return settings.featuredPosition === "before"
    ? [featuredPage, ...gridPages]
    : [...gridPages, featuredPage];
}

/**
 * Tiện ích cho admin: tính bố cục cả 4 màn hình cùng lúc (tab Tổng quan + Bố
 * cục). Gọi computeScreenPages() 4 lần — KHÔNG cài lại thuật toán ở đây.
 * pageNo đánh số CỤC BỘ trong từng màn hình (1, 2, 3…) vì ở chế độ thủ công,
 * trang ghim và trang trôi nổi không có một "số trang toàn cục" chung có ý
 * nghĩa để hiển thị — đánh số cục bộ luôn dễ hiểu và nhất quán giữa 2 chế độ.
 *
 * @returns {{screens: {1:Array,2:Array,3:Array,4:Array}, totalPages: number, itemsPerPage: number}}
 */
export function computeAllScreensLayout(items, settings) {
  const itemsPerPage = Math.min(6, Math.max(4, numOr(settings.itemsPerPage, 6)));
  const normalized = { ...settings, itemsPerPage };
  const screens = { 1: [], 2: [], 3: [], 4: [] };
  let totalPages = 0;
  for (let n = 1; n <= 4; n++) {
    const pages = computeScreenPages(normalized, items, n);
    screens[n] = pages.map((pageItems, idx) => ({ pageNo: idx + 1, items: pageItems }));
    totalPages += pages.length;
  }
  return { screens, totalPages, itemsPerPage };
}
