// =============================================================================
// seed-data.js
// -----------------------------------------------------------------------------
// Dữ liệu mẫu cho CHẾ ĐỘ DEMO (localStorage) — chỉ dùng khi firebase-config.js
// chưa được cấu hình thật (DEMO_MODE = true). data-layer.js import module này
// trực tiếp (thay vì fetch file JSON) để nạp lần đầu vào localStorage.
//
// Vì sao là module JS chứ không phải file JSON nằm ngoài public/:
//   Firebase Hosting chỉ deploy nội dung trong thư mục public/ — nếu seed nằm
//   ngoài public/ (vd seed/seed-data.json ở gốc repo) thì sau khi deploy thật,
//   đường dẫn đó sẽ trả về 404. Đưa dữ liệu vào ngay trong public/assets/js/
//   dưới dạng `export const` loại bỏ hoàn toàn nhu cầu fetch một file riêng,
//   không còn phụ thuộc đường dẫn tương đối hay việc phải chạy qua local
//   server chỉ để xem DEMO — mở qua bất kỳ cách nào ES module chạy được là
//   seed đã có sẵn trong bộ nhớ, không cần request mạng nào cả.
//
// THỰC ĐƠN THẬT (thay cho 72 món Nhật giả định trước đây — sai cả về ẩm thực
// lẫn thương hiệu cho quán này): port từ scratchpad/menu-data.js (thực đơn
// Oława đang chạy thật), giữ nguyên tên món/giá/nhóm tiếng Ba Lan gốc.
// 27 món, 98 "lựa chọn" (variant) nguồn — trong đó 88 lựa chọn rơi vào 17 món
// CÓ THẬT SỰ NHIỀU HƠN 1 lựa chọn (biểu diễn bằng variantAxes/variants bên
// dưới), còn 10 món chỉ có ĐÚNG 1 lựa chọn (Kid-Box ×2, Dodatki ×8) — theo
// đúng quy ước "không có variants (hoặc chỉ 1 lựa chọn) -> giá đơn" của
// display.js, 10 món này dùng thẳng field `price` phẳng thay vì 1 mảng
// variants chỉ có 1 phần tử (không có ý nghĩa gì thêm để bọc thành mảng).
// 27 món / 6 món/trang -> 5 trang -> KHÔNG chia đều 4 màn hình (perScreen =
// ceil(5/4) = 2 -> màn 1-2 nhận 2 trang, màn 3 nhận 1 trang, màn 4 KHÔNG có
// trang nào -> hiện màn hình chờ). Đây là hệ quả tự nhiên của thực đơn thật
// (không đủ món để lấp 4 màn ở 6 món/trang), không phải lỗi phân trang — chủ
// quán có thể hạ itemsPerPage xuống 4 hoặc thêm món nếu muốn lấp cả 4 màn.
//
// variantAxes/variants/spicy/vege/best là phần MỞ RỘNG mô hình dữ liệu so với
// menu/{itemId} mô tả trong docs/ARCHITECTURE.md mục 2 (tài liệu do người
// phụ trách kiến trúc duy trì, KHÔNG tự sửa ở đây) — xem ghi chú đầy đủ về
// shape này trong display.js (priceAndCaptionFor() và các hàm xung quanh).
// =============================================================================

export const SEED_DATA = {
  settings: {
    themeId: "hanabi",
    rotationSeconds: 10,
    itemsPerPage: 6,
    transition: "fade",
    distribution: "auto",
    // Thiết kế đã duyệt (scratchpad/revA2/pairings, pairing 1) KHÔNG hiện hậu
    // tố tiền tệ trên thẻ món — chuỗi rỗng là cách CHÍNH THỨC để tắt (xem
    // currencySuffix() trong display.js — trước đây có bug coi "" là "thiếu"
    // rồi tự ép về "zł", khiến không cách nào tắt được; đã sửa cùng lúc với
    // seed này). Admin vẫn có thể gõ lại "zł" (hoặc bất kỳ ký hiệu nào) trong
    // tab Bố cục bất cứ lúc nào nếu muốn bật lại.
    currency: "",
    // Mặc định TẮT — xem lý do trong DEFAULT_SETTINGS ở data-layer.js.
    showHeader: false,
    headerText_pl: "MENU",
    effectsLevel: "full",
    // ---- Bố cục: 2 lựa chọn (xem pagination.js computeScreenPages()) -------
    // "grid": 1 trang lưới / màn hình (nhiều trang nếu dư món) — MẶC ĐỊNH.
    // "grid+featured": THÊM 1 trang "nổi bật" (1 món chiếm toàn panel) vào
    // CUỐI vòng xoay của MỖI màn hình — xem featuredByScreen/featuredPosition.
    layout: "grid",
    // distribution:"manual" + screenLock theo DANH MỤC (không phải "auto" +
    // chunk tuần tự theo `order`) — LÝ DO: thực đơn thật 27 món / 6 món mỗi
    // trang → 5 trang → perScreen = ceil(5/4) = 2 → màn 1-2 nhận 2 trang, màn
    // 3 nhận 1 trang, MÀN 4 KHÔNG NHẬN TRANG NÀO (hiện màn hình chờ) — đúng
    // lỗi chủ quán phản ánh ("Six per screen leaves three dishes homeless and
    // screen 4 idle"). Với itemsPerPage giữ nguyên 6 (đúng mật độ bản mockup
    // đã duyệt, xem docs kèm display.css), CÁCH DUY NHẤT lấp đủ cả 4
    // màn mà không dùng itemsPerPage=4 (giải pháp "đơn giản nhưng thô": xén
    // mọi trang xuống 4 món, làm trang cuối màn hình 4 chỉ còn lẻ 3 món) là
    // GHIM món theo NHÓM DANH MỤC — mỗi màn hình 1 chủ đề trọn vẹn, KHÔNG cắt
    // ngang giữa 1 danh mục:
    //   Màn 1 (6 món, 1 trang): Zupy (4) + Sajgonki (1) + Kurczak chrupiący
    //     (bestseller, 1) — "khai vị & súp".
    //   Màn 2 (6 món, 1 trang): TOÀN BỘ Dania główne (Tofu/Kurczak/
    //     Wieprzowina/Wołowina/Krewetki chrupiące/Kaczka) — ĐÚNG 6 món, ĐÚNG
    //     nội dung ảnh mockup đã duyệt (scratchpad/revA2/pairings/shots/
    //     p1-oswald-nunito-4k.png) — "món chính".
    //   Màn 3 (5 món, 1 trang, lưới 5-up đã có sẵn CSS — data-count="5"):
    //     TOÀN BỘ Makarony i ryż (Chiński/Ryż smażony/Pad Thai/Sojowy/Udon) —
    //     "mì & cơm".
    //   Màn 4 (10 món, 2 trang 6+4): Kid-Box (2) + Dodatki (8) — "phần thêm &
    //     trẻ em", trang duy nhất còn lại XOAY thay vì đứng yên như 3 màn
    //     kia (6+4, đúng ceil(10/6)=2 trang) — không lãng phí, không lẻ món.
    // Tổng 6+6+5+10 = 27, khớp đúng số món thật, KHÔNG món nào bị bỏ sót hay
    // trùng màn hình (mỗi id chỉ xuất hiện ở ĐÚNG 1 screenLock). Đây là
    // "Option 1 — one page per screen, filled" nói trong brief thiết kế lại,
    // chọn hướng "per-category assignment" (rõ nghĩa hơn với khách, mỗi màn
    // 1 chủ đề) thay vì "denser grid on some screens" (hạ itemsPerPage toàn
    // cục xuống 4 — vẫn lấp đủ 4 màn về mặt toán học nhưng xé lẻ danh mục
    // ngẫu nhiên theo `order`, và hạ mật độ khỏi giá trị 6-up đã duyệt).
    // Chủ quán vẫn có thể đổi distribution về "auto" hoặc tự ghim lại từng
    // món khác ở tab "Món ăn" bất cứ lúc nào — đây chỉ là GIÁ TRỊ MẶC ĐỊNH
    // khi mở demo lần đầu, không khoá cứng.
    distribution: "manual",
    // Option 2 (grid+featured): mặc định TẮT (layout:"grid" ở trên) nhưng
    // vẫn điền sẵn 1 lựa chọn hợp lý cho MỖI màn hình — ưu tiên món ĐÃ CÓ ảnh
    // thật (xem public/assets/img/dishes/, wiring imageUrl bên dưới) để chủ
    // quán bật thử là thấy ngay kết quả đầy đủ, không phải trang trống ảnh
    // rồi lại phải tự chọn lại. Chủ quán đổi bất cứ lúc nào ở tab Bố cục.
    featuredByScreen: {
      1: "pad-thai",
      2: "kurczak",
      3: "makaron-chinski",
      4: "kidbox-2",
    },
    // Trang nổi bật hiện SAU khối trang lưới trong vòng xoay (khách xem hết
    // menu bình thường trước, món được đẩy mạnh xuất hiện cuối — logic
    // "closer" giống mẫu quảng cáo/upsell thông thường). "before" đảo lại
    // (nổi bật hiện trước) — đây là "sắp xếp lại trang" DUY NHẤT admin có
    // toàn quyền, xem pagination.js computeScreenPages().
    featuredPosition: "after",
    // Giờ tự tải lại trang 1 lần/ngày (xem ARCHITECTURE.md mục 9(d) và
    // DEFAULT_SETTINGS trong data-layer.js) — thiếu field này trong SEED_DATA
    // từng khiến settings/global ghi qua seedSampleData() không có reloadHour,
    // dù mọi nơi khác trong hệ thống (data-layer.js, display.js, admin.js) đều
    // coi nó là 1 trong các field bắt buộc của settings/global.
    reloadHour: 4,
    revision: 1,
    updatedAt: null,
  },

  themes: {},

  // Ảnh món: 5 file cắt nền thật (chụp món thật, xử lý xoá nền + chuẩn hoá
  // khung/tỉ lệ, xem quy trình normalize trong scratchpad) — nén WebP, đặt ở
  // public/assets/img/dishes/ (nằm TRONG public/, tuân đúng lý do "seed data
  // phải là module JS import tĩnh, không fetch ngoài public/" ở đầu file
  // này — ảnh cũng vậy, http://.../assets/img/... chỉ tồn tại sau khi deploy
  // nếu file nằm trong public/). Khớp NỘI DUNG THẬT của từng ảnh với đúng
  // món (không đoán theo tên file gốc _DSCxxxx vô nghĩa với món ăn):
  //   kurczak.webp          — gà xào sốt cam kèm cơm nắm (chụp DSC8603)
  //   pad-thai.webp          — pad thai, đậu phộng, chanh (chụp DSC8615)
  //   makaron-chinski.webp   — mì trứng xào, hành phi (chụp DSC8588)
  //   udon.webp              — mì trứng xào, góc chụp khác (chụp DSC8607) —
  //                             cùng "họ" mì trứng xào với makaron-chinski,
  //                             2 ảnh gốc không phân biệt được món nào khác
  //                             món nào ngoài tên slug, nên gán cho 2 món mì
  //                             trứng CÒN LẠI (không phải makaron-sojowy —
  //                             mì SỢI THUỶ TINH/TRONG thường khác hẳn về
  //                             hình dạng mì trứng vàng đục trong ảnh, gán
  //                             nhầm sẽ sai "khớp theo nội dung thật" mà
  //                             brief yêu cầu).
  //   kidbox-2.webp          — 4 tôm chiên xù + khoai tây chiên (chụp
  //                             DSC8618) — khớp Y HỆT mô tả "Frytki + 4
  //                             krewetki chrupiące" của Kid-Box 2, khớp hơn
  //                             hẳn món "Krewetki chrupiące" (dania, không
  //                             có frytki trong tên/mô tả).
  // 1 ảnh thứ 6 (IMG_9298, phương pháp cắt nền "bbox_fallback", độ tin cậy
  // thấp — 0.255, bị cắt xén — "clipped":true, xem norm_out_v2/report.json)
  // KHÔNG nằm trong 5 ảnh brief liệt kê ("chicken-in-sauce with rice, pad
  // thai, two stir-fried noodle plates, crispy shrimp with fries" = đúng 5
  // món) — CHỦ ĐÍCH bỏ qua, không dùng ảnh chất lượng thấp.
  // 22 món còn lại KHÔNG có ảnh thật (imageUrl rỗng) — hiện placeholder
  // glyph SVG theo danh mục (glyphFor() trong display.js), đúng yêu cầu
  // "leave the rest without photos" thay vì tự chế ảnh giả cho món chưa
  // chụp thật.
  menu: [
    // ---- Zupy (4) --------------------------------------------------------
    {
      id: "pho",
      name_pl: "Pho",
      desc_pl: "Wietnamski rosół z makaronem ryżowym.",
      price: 17,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "zupy",
      badge: "",
      order: 10,
      visible: true,
      screenLock: 1,
      variantAxes: ["Białko", "Wielkość"],
      variants: [
        { axis: ["Z kurczakiem", "Duża"], price: 19 },
        { axis: ["Z kurczakiem", "Mała"], price: 17 },
        { axis: ["Z wołowiną", "Duża"], price: 22 },
        { axis: ["Z wołowiną", "Mała"], price: 19 },
        { axis: ["MIX kurczak + wołowina", "Duża"], price: 23 },
        { axis: ["MIX kurczak + wołowina", "Mała"], price: 20 },
      ],
    },
    {
      id: "zupa-tajska",
      name_pl: "Zupa Tajska",
      desc_pl: "Pikantna zupa tajska.",
      price: 17,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "zupy",
      badge: "",
      order: 20,
      visible: true,
      screenLock: 1,
      spicy: true,
      variantAxes: ["Białko", "Wielkość"],
      variants: [
        { axis: ["Z kurczakiem", "Duża"], price: 19 },
        { axis: ["Z kurczakiem", "Mała"], price: 17 },
        { axis: ["Z wołowiną", "Duża"], price: 22 },
        { axis: ["Z wołowiną", "Mała"], price: 19 },
        { axis: ["Z krewetkami", "Duża"], price: 24 },
        { axis: ["Z krewetkami", "Mała"], price: 21 },
      ],
    },
    {
      id: "wonton",
      name_pl: "Wonton",
      desc_pl: "Po wietnamsku, pierożki z krewetką.",
      price: 20,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "zupy",
      badge: "",
      order: 30,
      visible: true,
      screenLock: 1,
      variantAxes: ["Wielkość"],
      variants: [
        { axis: ["Duża"], price: 23 },
        { axis: ["Mała"], price: 20 },
      ],
    },
    {
      id: "tom-yum",
      name_pl: "Tom Yum",
      desc_pl: "Pikantna, kwaśno-ostra.",
      price: 17,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "zupy",
      badge: "",
      order: 40,
      visible: true,
      screenLock: 1,
      spicy: true,
      variantAxes: ["Białko", "Wielkość"],
      variants: [
        { axis: ["Z kurczakiem", "Duża"], price: 19 },
        { axis: ["Z kurczakiem", "Mała"], price: 17 },
        { axis: ["Z krewetkami (2-3 szt.)", "Duża"], price: 24 },
        { axis: ["Z krewetkami (2-3 szt.)", "Mała"], price: 21 },
      ],
    },

    // ---- Sajgonki (1) ------------------------------------------------------
    {
      id: "sajgonki",
      name_pl: "Sajgonki",
      desc_pl: "Smażone sajgonki (wieprzowina mielona).",
      price: 22,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "sajgonki",
      badge: "",
      order: 50,
      visible: true,
      screenLock: 1,
      variantAxes: ["Smak", "Ilość"],
      variants: [
        { axis: ["Standardowe", "3 szt."], price: 22 },
        { axis: ["Standardowe", "5 szt."], price: 26 },
        { axis: ["Pikantne", "3 szt."], price: 27 },
        { axis: ["Pikantne", "5 szt."], price: 30 },
        { axis: ["Słodko-kwaśne", "3 szt."], price: 27 },
        { axis: ["Słodko-kwaśne", "5 szt."], price: 30 },
        { axis: ["5 smaków", "3 szt."], price: 27 },
        { axis: ["5 smaków", "5 szt."], price: 30 },
      ],
    },

    // ---- Kurczak chrupiący (1, bestseller) ---------------------------------
    {
      id: "kurczak-chrupiacy",
      name_pl: "Kurczak chrupiący",
      desc_pl: "Nasz bestseller!",
      price: 24,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "kurczak-ch",
      badge: "",
      order: 60,
      visible: true,
      screenLock: 1,
      best: true,
      variantAxes: ["Smak", "Ilość"],
      variants: [
        { axis: ["Standardowy", "4 szt."], price: 24 },
        { axis: ["Standardowy", "6 szt."], price: 28 },
        { axis: ["Pikantny", "4 szt."], price: 27 },
        { axis: ["Pikantny", "6 szt."], price: 31 },
        { axis: ["Słodko-kwaśny", "4 szt."], price: 27 },
        { axis: ["Słodko-kwaśny", "6 szt."], price: 31 },
        { axis: ["5 smaków", "4 szt."], price: 27 },
        { axis: ["5 smaków", "6 szt."], price: 31 },
      ],
    },

    // ---- Dania główne (6) — 1 trục "Smak", giá jednolita w obrębie dania ---
    {
      id: "tofu",
      name_pl: "Tofu",
      desc_pl: "",
      price: 28,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "dania",
      badge: "",
      order: 70,
      visible: true,
      screenLock: 2,
      vege: true,
      variantAxes: ["Smak"],
      variants: [
        { axis: ["Słodko-kwaśne"], price: 28 },
        { axis: ["5 smaków"], price: 28 },
        { axis: ["Po chińsku"], price: 28 },
        { axis: ["Po tajsku"], price: 28 },
      ],
    },
    {
      id: "kurczak",
      name_pl: "Kurczak",
      desc_pl: "",
      price: 28,
      priceSuffix: "",
      imageUrl: "/assets/img/dishes/kurczak.webp",
      mediaId: "",
      category: "dania",
      badge: "",
      order: 80,
      visible: true,
      screenLock: 2,
      variantAxes: ["Smak"],
      variants: [
        { axis: ["Słodko-kwaśny"], price: 28 },
        { axis: ["Po wietnamsku"], price: 28 },
        { axis: ["5 smaków"], price: 28 },
        { axis: ["Po naszemu"], price: 28 },
        { axis: ["Po tajsku"], price: 28 },
      ],
    },
    {
      id: "wieprzowina",
      name_pl: "Wieprzowina",
      desc_pl: "",
      price: 30,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "dania",
      badge: "",
      order: 90,
      visible: true,
      screenLock: 2,
      variantAxes: ["Smak"],
      variants: [
        { axis: ["Słodko-kwaśna"], price: 30 },
        { axis: ["Po wietnamsku"], price: 30 },
        { axis: ["5 smaków"], price: 30 },
        { axis: ["Po chińsku"], price: 30 },
        { axis: ["Po tajsku"], price: 30 },
      ],
    },
    {
      id: "wolowina",
      name_pl: "Wołowina",
      desc_pl: "",
      price: 33,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "dania",
      badge: "",
      order: 100,
      visible: true,
      screenLock: 2,
      variantAxes: ["Smak"],
      variants: [
        { axis: ["Słodko-kwaśna"], price: 33 },
        { axis: ["Po wietnamsku"], price: 33 },
        { axis: ["5 smaków"], price: 33 },
        { axis: ["Po naszemu"], price: 33 },
        { axis: ["Po tajsku"], price: 33 },
      ],
    },
    {
      id: "krewetki-chrupiace",
      name_pl: "Krewetki chrupiące",
      desc_pl: "",
      price: 38,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "dania",
      badge: "",
      order: 110,
      visible: true,
      screenLock: 2,
      variantAxes: ["Smak"],
      variants: [
        { axis: ["Słodko-kwaśna"], price: 38 },
        { axis: ["Po wietnamsku"], price: 38 },
        { axis: ["5 smaków"], price: 38 },
        { axis: ["Po chińsku"], price: 38 },
        { axis: ["Po tajsku"], price: 38 },
      ],
    },
    {
      id: "kaczka",
      name_pl: "Kaczka",
      desc_pl: "",
      price: 38,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "dania",
      badge: "",
      order: 120,
      visible: true,
      screenLock: 2,
      variantAxes: ["Smak"],
      variants: [
        { axis: ["Słodko-kwaśna"], price: 38 },
        { axis: ["Po wietnamsku"], price: 38 },
        { axis: ["5 smaków"], price: 38 },
        { axis: ["Po chińsku"], price: 38 },
        { axis: ["Po tajsku"], price: 38 },
      ],
    },

    // ---- Makarony i ryż (5) — 1 trục "Dodatek", giá RÓŻNE per dodatek -----
    {
      id: "makaron-chinski",
      name_pl: "Makaron chiński",
      desc_pl: "",
      price: 24,
      priceSuffix: "",
      imageUrl: "/assets/img/dishes/makaron-chinski.webp",
      mediaId: "",
      category: "makarony",
      badge: "",
      order: 130,
      visible: true,
      screenLock: 3,
      variantAxes: ["Dodatek"],
      variants: [
        { axis: ["Z warzywami"], price: 24 },
        { axis: ["Z kurczakiem"], price: 29 },
        { axis: ["Z wołowiną"], price: 33 },
        { axis: ["Z wieprzowiną"], price: 32 },
        { axis: ["Z krewetkami"], price: 36 },
      ],
    },
    {
      id: "ryz-smazony",
      name_pl: "Ryż smażony",
      desc_pl: "",
      price: 24,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "makarony",
      badge: "",
      order: 140,
      visible: true,
      screenLock: 3,
      variantAxes: ["Dodatek"],
      variants: [
        { axis: ["Z warzywami"], price: 24 },
        { axis: ["Z kurczakiem"], price: 29 },
        { axis: ["Z wołowiną"], price: 33 },
        { axis: ["Z wieprzowiną"], price: 32 },
        { axis: ["Z krewetkami"], price: 36 },
      ],
    },
    {
      id: "pad-thai",
      name_pl: "Pad Thai",
      // Duy nhất món này đổ desc_pl thật (thay vì "" như đa số món trong
      // seed) — đây là món mặc định của settings.featuredByScreen[1] (xem
      // trên) VÀ chính là món trong ảnh tham chiếu chủ quán đưa ("MAMA'S
      // WOK / PAD THAI"). Trang nổi bật (display.css khối "Trang nổi bật",
      // .feature-desc) render desc_pl khi có — bản mockup gốc CÓ mô tả, nên
      // demo mặc định cần có nội dung thật để thấy đúng bố cục đã duyệt,
      // không phải khoảng trống nơi lẽ ra là mô tả.
      desc_pl: "Sos tamaryndowy, jajko, kiełki fasoli i orzeszki ziemne.",
      price: 29,
      priceSuffix: "",
      imageUrl: "/assets/img/dishes/pad-thai.webp",
      mediaId: "",
      category: "makarony",
      badge: "",
      order: 150,
      visible: true,
      screenLock: 3,
      variantAxes: ["Dodatek"],
      variants: [
        { axis: ["Z tofu"], price: 29 },
        { axis: ["Z kurczakiem"], price: 30 },
        { axis: ["Z wieprzowiną"], price: 32 },
        { axis: ["Z wołowiną"], price: 33 },
        { axis: ["Z krewetkami"], price: 37 },
      ],
    },
    {
      id: "makaron-sojowy",
      name_pl: "Makaron sojowy",
      desc_pl: "",
      price: 24,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "makarony",
      badge: "",
      order: 160,
      visible: true,
      screenLock: 3,
      variantAxes: ["Dodatek"],
      variants: [
        { axis: ["Z warzywami"], price: 24 },
        { axis: ["Z kurczakiem"], price: 30 },
        { axis: ["Z wołowiną"], price: 33 },
        { axis: ["Z wieprzowiną"], price: 32 },
        { axis: ["Z krewetkami"], price: 36 },
      ],
    },
    {
      id: "udon",
      name_pl: "Udon",
      desc_pl: "",
      price: 25,
      priceSuffix: "",
      imageUrl: "/assets/img/dishes/udon.webp",
      mediaId: "",
      category: "makarony",
      badge: "",
      order: 170,
      visible: true,
      screenLock: 3,
      variantAxes: ["Dodatek"],
      variants: [
        { axis: ["Z warzywami"], price: 25 },
        { axis: ["Z kurczakiem"], price: 30 },
        { axis: ["Z wołowiną"], price: 34 },
        { axis: ["Z wieprzowiną"], price: 33 },
        { axis: ["Z krewetkami"], price: 37 },
      ],
    },

    // ---- Kid-Box (2) — 1 lựa chọn duy nhất -> giá phẳng, không có variants ---
    {
      id: "kidbox-1",
      name_pl: "Kid-Box 1",
      desc_pl: "Frytki + 4 kurczaki chrupiące.",
      price: 22,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "kidbox",
      badge: "",
      order: 180,
      visible: true,
      screenLock: 4,
    },
    {
      id: "kidbox-2",
      name_pl: "Kid-Box 2",
      desc_pl: "Frytki + 4 krewetki chrupiące.",
      price: 28,
      priceSuffix: "",
      imageUrl: "/assets/img/dishes/kidbox-2.webp",
      mediaId: "",
      category: "kidbox",
      badge: "",
      order: 190,
      visible: true,
      screenLock: 4,
    },

    // ---- Dodatki (8) — mỗi món 1 lựa chọn duy nhất -> giá phẳng -----------
    {
      id: "kurczak-chrupiacy-dodatek",
      name_pl: "Kurczak chrupiący",
      desc_pl: "Dodatek.",
      price: 4,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "dodatki",
      badge: "",
      order: 200,
      visible: true,
      screenLock: 4,
    },
    {
      id: "sajgonka-dodatek",
      name_pl: "Sajgonka",
      desc_pl: "Dodatek.",
      price: 4.5,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "dodatki",
      badge: "",
      order: 210,
      visible: true,
      screenLock: 4,
    },
    {
      id: "krewetki-chrupiace-dodatek",
      name_pl: "Krewetki chrupiące",
      desc_pl: "Dodatek.",
      price: 6,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "dodatki",
      badge: "",
      order: 220,
      visible: true,
      screenLock: 4,
    },
    {
      id: "surowka",
      name_pl: "Surówka",
      desc_pl: "Dodatek.",
      price: 5,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "dodatki",
      badge: "",
      order: 230,
      visible: true,
      screenLock: 4,
    },
    {
      id: "ryz-bialy",
      name_pl: "Ryż biały",
      desc_pl: "Dodatek.",
      price: 9,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "dodatki",
      badge: "",
      order: 240,
      visible: true,
      screenLock: 4,
    },
    {
      id: "goracy-polmisek",
      name_pl: "Gorący półmisek",
      desc_pl: "Opcja.",
      price: 5,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "dodatki",
      badge: "",
      order: 250,
      visible: true,
      screenLock: 4,
    },
    {
      id: "opakowanie-na-wynos",
      name_pl: "Opakowanie na wynos",
      desc_pl: "Opcja.",
      price: 1,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "dodatki",
      badge: "",
      order: 260,
      visible: true,
      screenLock: 4,
    },
    {
      id: "torba-papierowa",
      name_pl: "Torba papierowa",
      desc_pl: "Opcja.",
      price: 1,
      priceSuffix: "",
      imageUrl: "",
      mediaId: "",
      category: "dodatki",
      badge: "",
      order: 270,
      visible: true,
      screenLock: 4,
    },
  ],
};

// =============================================================================
// ẢNH DEMO TẠM THỜI — CÔNG CỤ XEM TRƯỚC, KHÔNG PHẢI DỮ LIỆU THẬT =============
// -----------------------------------------------------------------------------
// Yêu cầu của chủ quán: "put demo images in for every dish so he can judge the
// design now; he will replace them with real photography later." Ở khối
// `menu` phía trên, CHỈ 5/27 món có ảnh cắt nền THẬT (xem chú thích "Ảnh món"
// đầu file) — 22 món còn lại `imageUrl: ""` nên hiện placeholder glyph, khiến
// chủ quán KHÔNG thấy được hình hài thật của bảng món khi đầy đủ ảnh (thứ ông
// ấy cần soát ngay bây giờ).
//
// Khối này gán TẠM 1 trong 5 ảnh có sẵn cho MỌI món còn thiếu ảnh — chọn ảnh
// "ít sai nhất" theo nhóm món (bảng bên dưới). ĐÂY LÀ ẢNH GIẢ — vd món Kaczka
// (vịt) có thể hiện ảnh gà, món Surówka (salad) có thể hiện ảnh không liên
// quan — SAI về nội dung món, ĐÚNG chủ đích (chỉ để lấp card cho mục đích xem
// bố cục/mật độ, không phải mô tả đúng món). KHÔNG được để lẫn vào dữ liệu
// thật lâu dài — xem "CÁCH GỠ BỎ" ngay dưới đây.
//
// CÁCH GỠ BỎ (khi chủ quán đã có ảnh thật, hoặc muốn tắt ảnh demo ngay lập tức):
//   1. Đổi hằng số DEMO_PHOTO_FILL_ENABLED ngay dưới đây thành `false` (hoặc
//      xoá nguyên khối `if (DEMO_PHOTO_FILL_ENABLED) {...}` bên dưới nó) rồi
//      triển khai lại (deploy) trang. Từ lúc này, seed-data.js KHÔNG còn gán
//      ảnh demo cho món nào nữa — 22 món chưa có ảnh thật trở lại rỗng.
//   2. Chỉ sửa file này KHÔNG tự đổi dữ liệu đang chạy thật trong Firestore —
//      Firestore đã được nhập 1 lần rồi, độc lập với file này từ đó về sau.
//      Để ảnh demo (hoặc việc gỡ ảnh demo) thật sự lên 4 màn hình, vào trang
//      Admin (barkinglong.pl/admin/) → mục "Thiết lập & dữ liệu mẫu" → bấm nút
//      có sẵn "📥 Nhập thực đơn (27 món)" → chọn "Thêm vào" (KHÔNG chọn "Xoá
//      hết rồi nhập lại" trừ khi thật sự muốn xoá món chủ quán tự thêm ngoài
//      27 món seed). Nút này đã có sẵn trong admin — chủ quán không cần biết
//      gì về code, chỉ cần bấm ĐÚNG NÚT NÀY LẦN NỮA sau khi bước 1 đã tắt cờ
//      (hoặc admin/dev đã redeploy) là ảnh demo biến mất khỏi 4 màn hình trong
//      ~1 giây, không cần tải lại trang.
//   LƯU Ý AN TOÀN: nếu chủ quán đã tự tải ảnh THẬT cho đúng 1 trong 22 món
//   đang dùng ảnh demo (qua tab "Món ăn", cùng id với seed) TRƯỚC KHI bấm lại
//   nút "Nhập thực đơn" ở bước 2, ảnh thật đó SẼ BỊ GHI ĐÈ về rỗng (vì cùng id
//   với seed-data.js, chế độ "Thêm vào" ghi đè theo id) — vì vậy nên tắt ảnh
//   demo NGAY khi có ảnh thật đầu tiên, đừng để 2 nguồn ảnh lẫn lộn cho cùng 1
//   món. Ảnh thật của đúng 5 món đã có sẵn ở trên (pad-thai, kurczak,
//   makaron-chinski, udon, kidbox-2) không bao giờ bị đụng tới — seed-data.js
//   của 5 món đó vẫn giữ y nguyên ảnh thật dù cờ trên bật hay tắt.
// =============================================================================
const DEMO_PHOTO_FILL_ENABLED = true; // <-- ĐỔI THÀNH false RỒI DEPLOY LẠI + BẤM "NHẬP THỰC ĐƠN" TRONG ADMIN ĐỂ GỠ ẢNH DEMO

// Ảnh "ít sai nhất" theo NHÓM danh mục (category) — dùng khi món không có
// lựa chọn riêng khớp hơn trong DEMO_PHOTO_BY_ID bên dưới. 5 ảnh thật + nội
// dung từng ảnh xem chú thích đầy đủ ở khối "Ảnh món" phía trên.
const DEMO_PHOTO_BY_CATEGORY = {
  // Không có ảnh nào trong 5 ảnh là canh/súp thật — ảnh có sốt/nước sốt đậm
  // (kurczak.webp) là proxy gần nhất trong số 5 ảnh khô/chiên còn lại.
  zupy: "/assets/img/dishes/kurczak.webp",
  // "Sajgonki" (nem rán) — món chiên giòn, dùng ảnh đồ chiên có sẵn.
  sajgonki: "/assets/img/dishes/kidbox-2.webp",
  // "Kurczak chrupiący" = gà CHIÊN GIÒN — cùng lý do đồ chiên như trên.
  "kurczak-ch": "/assets/img/dishes/kidbox-2.webp",
  // Dania główne (món chính có sốt) — cùng "họ" với chính ảnh kurczak.webp
  // gốc (vốn cũng là 1 món trong nhóm dania).
  dania: "/assets/img/dishes/kurczak.webp",
  // Makarony i ryż (mì/cơm xào) — mặc định dùng ảnh mì xào có sẵn.
  makarony: "/assets/img/dishes/makaron-chinski.webp",
  kidbox: "/assets/img/dishes/kidbox-2.webp",
  // Dodatki (phần thêm/đóng gói) — nhóm hỗn hợp (cơm, salad, túi giấy...),
  // không món nào trong 5 ảnh khớp thật sự — dùng ảnh trung tính nhất làm mặc
  // định, các món "chrupiący"/tôm trong nhóm này có override riêng bên dưới.
  dodatki: "/assets/img/dishes/kurczak.webp",
};

// Ghi đè TỪNG MÓN khi ảnh theo category ở trên không phải lựa chọn tốt nhất
// (khớp nội dung ảnh rõ hơn, hoặc tránh lặp y hệt ảnh category mặc định với
// món ngay cạnh nó trong cùng danh mục).
const DEMO_PHOTO_BY_ID = {
  // Đúng ảnh có tôm chiên (kidbox-2.webp) — khớp nội dung tốt hơn hẳn ảnh
  // category mặc định của "dania"/"dodatki".
  "krewetki-chrupiace": "/assets/img/dishes/kidbox-2.webp",
  "krewetki-chrupiace-dodatek": "/assets/img/dishes/kidbox-2.webp",
  // 2 món "phần thêm" còn lại vốn CHIÊN GIÒN (gà chiên/nem rán) — dùng ảnh đồ
  // chiên (kidbox-2.webp) thay vì ảnh category mặc định "dodatki" (dùng cho
  // các phần thêm KHÔNG chiên như cơm/salad/túi giấy), cùng lý do đã áp dụng
  // cho "sajgonki"/"kurczak-ch" ở bảng category phía trên.
  "kurczak-chrupiacy-dodatek": "/assets/img/dishes/kidbox-2.webp",
  "sajgonka-dodatek": "/assets/img/dishes/kidbox-2.webp",
  // Cơm chiên — cùng kiểu chế biến (xào/chiên trong chảo) với ảnh mì xào.
  "ryz-smazony": "/assets/img/dishes/makaron-chinski.webp",
  // Mì khác — dùng ảnh mì còn lại (udon.webp) để KHÔNG trùng y hệt ảnh
  // makaron-chinski.webp vừa gán cho "ryz-smazony" ở trên (2 món mì/cơm nằm
  // cạnh nhau cùng trang không nên hiện đúng 1 tấm ảnh giống hệt).
  "makaron-sojowy": "/assets/img/dishes/udon.webp",
  // Cùng hộp Kid-Box, khác đạm — ảnh gần nhất có sẵn (kidbox-2.webp, vốn là
  // ảnh CHÍNH XÁC của Kid-Box 2 cạnh nó).
  "kidbox-1": "/assets/img/dishes/kidbox-2.webp",
};

if (DEMO_PHOTO_FILL_ENABLED) {
  SEED_DATA.menu.forEach((item) => {
    if (item.imageUrl) return; // đã có ảnh THẬT — không đụng vào, giữ nguyên
    const demoUrl = DEMO_PHOTO_BY_ID[item.id] || DEMO_PHOTO_BY_CATEGORY[item.category];
    if (demoUrl) item.imageUrl = demoUrl;
  });
}
