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
 * Tính danh sách trang (mỗi trang = mảng món) cho MỘT màn hình cụ thể, đúng
 * thuật toán ARCHITECTURE.md mục 3.
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
export function computeScreenPages(settings, items, screenId) {
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
