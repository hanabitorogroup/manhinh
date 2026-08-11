# Hanabi & Toro — Digital Menu / Architecture Contract

> Tài liệu này là **hợp đồng kỹ thuật** giữa các module. Mọi file code phải tuân thủ
> đúng tên collection, tên field và chữ ký hàm mô tả ở đây.

Domain: **barkinglong.pl** · Hosting: Firebase Hosting (Spark/free) · DB: Cloud Firestore (Spark/free)

---

## 1. Bản đồ URL

| URL | File | Mục đích | Ngôn ngữ |
|---|---|---|---|
| `barkinglong.pl/omh1.html` | `public/omh1.html` | Màn hình 1 | Tiếng Ba Lan |
| `barkinglong.pl/omh2.html` | `public/omh2.html` | Màn hình 2 | Tiếng Ba Lan |
| `barkinglong.pl/omh3.html` | `public/omh3.html` | Màn hình 3 | Tiếng Ba Lan |
| `barkinglong.pl/omh4.html` | `public/omh4.html` | Màn hình 4 | Tiếng Ba Lan |
| `barkinglong.pl/ohm4.html` | redirect 301 → `/omh4.html` | Chống gõ nhầm | — |
| `barkinglong.pl/admin/` | `public/admin/index.html` | Trang quản trị | Tiếng Việt |

Mỗi file `omhN.html` chỉ khác nhau **một hằng số** `SCREEN_ID = N`. Toàn bộ logic nằm
trong module dùng chung — không copy-paste logic vào 4 file.

Query param hỗ trợ debug: `?screen=2` (ghi đè SCREEN_ID), `?preview=1` (tắt heartbeat),
`?safe=1` (tắt hiệu ứng hạt để test máy yếu).

---

## 2. Mô hình dữ liệu Firestore

### `settings/global` (1 document)
```js
{
  themeId: "hanabi",          // string, khóa trong themes.js hoặc doc themes/{id}
  rotationSeconds: 10,        // number, 5..60 — thời gian mỗi trang
  itemsPerPage: 6,            // number, 4..6
  transition: "fade",         // "fade" | "slide" | "flip" | "curtain"
  distribution: "auto",       // "auto" (chia khối tự động) | "manual"
  currency: "zł",
  showHeader: true,
  headerText_pl: "MENU",
  effectsLevel: "full",       // "full" | "lite" | "off"
  revision: 17,               // tăng 1 mỗi lần lưu — màn hình dùng để ép reload
  updatedAt: <serverTimestamp>
}
```

### `menu/{itemId}` (mỗi món 1 document)
```js
{
  name_pl: "Ramen Tonkotsu",     // string, bắt buộc
  desc_pl: "Bulion wieprzowy…",  // string, có thể rỗng
  price: 39.90,                  // number
  priceSuffix: "",               // string, vd "/100g"
  imageUrl: "",                  // https URL hoặc "" nếu dùng mediaId
  mediaId: "",                   // id trong collection media/ (ảnh base64), hoặc ""
  category: "ramen",             // string slug
  badge: "",                     // "" | "NOWOŚĆ" | "HIT" | "PROMOCJA" | tự do
  order: 10,                     // number — thứ tự sắp xếp toàn cục (tăng dần)
  visible: true,                 // boolean — false thì không lên màn hình
  screenLock: 0,                 // 0 = tự động; 1..4 = ghim vào màn hình cụ thể (mode manual)
  updatedAt: <serverTimestamp>
}
```

### `media/{mediaId}` (ảnh nhúng — giải pháp miễn phí, không cần Firebase Storage)
```js
{ dataUrl: "data:image/webp;base64,…", w: 800, h: 600, bytes: 210345, createdAt: <ts> }
```
Giới hạn cứng: **≤ 700 KB** sau khi nén (Firestore tối đa 1 MB/doc). Admin phải resize
về chiều rộng tối đa 900px, encode WebP quality 0.82 trước khi ghi, và báo lỗi nếu vượt.

### `themes/{themeId}` (tùy biến màu — ghi đè preset trong `themes.js`)
```js
{
  name_vi: "Giáng sinh",
  bg: "#0b1d16", bgGradient: "linear-gradient(…)",
  textColor: "#ffffff", outlineColor: "#0a0a0a", outlineWidth: 2,
  accent: "#e63946", priceColor: "#ffd166", cardBg: "rgba(0,0,0,.35)",
  fontHeading: "Bebas Neue", fontBody: "Inter",
  particles: "snow",       // "none" | "snow" | "petals" | "embers" | "fireworks" | "leaves" | "bubbles"
  overlayImage: ""          // URL ảnh trang trí phủ (tùy chọn)
}
```

### `status/screen{N}` (heartbeat — admin theo dõi màn hình sống/chết)
```js
{ lastSeen: <serverTimestamp>, revision: 17, page: 2, ua: "…", res: "1920x1080" }
```
Ghi mỗi **60 giây** (4 màn × 1440 = 5.760 writes/ngày, dưới hạn 20.000/ngày của Spark).

---

## 3. Thuật toán phân trang (không trùng lặp giữa 4 màn hình)

```
items    = menu[] lọc visible=true, sắp xếp theo (order asc, name_pl asc)
pages    = chunk(items, itemsPerPage)              // vd 24 món / 6 = 4 trang… 
perScreen= ceil(pages.length / 4)
screen N = pages.slice((N-1)*perScreen, N*perScreen)
```
Ví dụ 72 món, 6 món/trang → 12 trang → mỗi màn 3 trang: MH1 = trang 1-3, MH2 = trang 4-6,
MH3 = 7-9, MH4 = 10-12. Đúng yêu cầu, không món nào xuất hiện ở 2 màn hình.

Nếu `distribution: "manual"`: món có `screenLock = 1..4` được **ghim** vào đúng màn hình
đó. Món còn lại — `screenLock = 0` (mặc định "Tự động"), thiếu, hoặc giá trị ngoài phạm
vi 1..4 — được coi là **trôi nổi** và KHÔNG được phép biến mất khỏi cả 4 màn hình (nếu
không, bật "thủ công" mà chưa ghim món nào sẽ làm trống toàn bộ thực đơn — một cái bẫy
chết người với chủ quán không rành kỹ thuật).

Xử lý cụ thể cho từng màn hình N:
```
locked   = items.filter(screenLock == N)                     // đã sort theo (order, name_pl)
lockedPages   = chunk(locked, itemsPerPage)

floating = items.filter(screenLock == 0 || ngoài phạm vi 1..4)  // đã sort toàn cục
floatingPages = chunk(floating, itemsPerPage)
perScreen     = ceil(floatingPages.length / 4)
floatingForN  = floatingPages.slice((N-1)*perScreen, N*perScreen)

pages(N) = lockedPages ++ floatingForN     // trang đã ghim hiển thị trước, trang trôi nổi nối sau
```
Nhóm trôi nổi dùng đúng thuật toán khối của chế độ tự động (sort toàn cục → chunk →
`ceil(len/4)` trang mỗi màn, cắt theo N) nên phép chia không phụ thuộc trạng thái riêng
của từng màn hình — 4 màn hình luôn đồng thuận trang nào thuộc màn nào, không tranh chấp
và thứ tự trang luôn ổn định.

Nếu một màn hình không có trang nào → hiển thị màn hình chờ (logo + hiệu ứng nền).

### Đồng bộ thời gian giữa 4 màn hình
Không dùng `setInterval` độc lập (sẽ lệch dần). Dùng **đồng hồ tuyệt đối**:

```js
const now  = Date.now() + serverOffsetMs;          // offset lấy 1 lần từ serverTimestamp
const tick = Math.floor(now / (rotationSeconds*1000));
const pageIndex = tick % pagesOfThisScreen.length;
```
4 màn hình lật trang cùng một khoảnh khắc, kể cả sau khi 1 màn hình khởi động lại.
`requestAnimationFrame` kiểm tra `tick` đổi thì mới chuyển trang.

---

## 4. Module dùng chung (`public/assets/js/`)

| File | Xuất ra | Trách nhiệm |
|---|---|---|
| `firebase-config.js` | `firebaseConfig`, `DEMO_MODE` | Chỉ chứa cấu hình. Nếu `apiKey` còn là placeholder → `DEMO_MODE = true` |
| `data-layer.js` | xem bên dưới | Lớp truy cập duy nhất tới Firestore + fallback localStorage |
| `themes.js` | `THEMES`, `applyTheme(el, theme)` | 6 preset + hàm ghi CSS variables |
| `effects.js` | `startParticles(canvas, type, level)`, `stopParticles()` | Canvas hạt, tự dừng khi tab ẩn |
| `display.js` | `bootDisplay(screenId)` | Vòng đời màn hình: subscribe → phân trang → render → xoay vòng |

### `data-layer.js` — API bắt buộc
```js
export function initData();                       // -> Promise<void>, tính serverOffsetMs
export function onSettings(cb);                   // cb(settings)      -> unsubscribe()
export function onMenu(cb);                       // cb(items[])       -> unsubscribe()
export function onThemes(cb);                     // cb({id: theme})   -> unsubscribe()
export function onStatus(cb);                     // cb({1:{},…})      -> unsubscribe() (admin)
export async function saveSettings(patch);
export async function saveItem(item);             // upsert, tự set updatedAt
export async function deleteItem(id);
export async function saveTheme(id, theme);
export async function uploadMedia(file);          // -> mediaId, tự resize+nén WebP
export async function heartbeat(screenId, info);
export function getServerOffsetMs();
export const DEMO;                                // true nếu chạy không có Firebase
```

**DEMO_MODE**: khi chưa cấu hình Firebase, `data-layer.js` đọc/ghi `localStorage` với dữ
liệu mẫu import tĩnh từ `public/assets/js/seed-data.js` (72 món → 12 trang → đúng 3 trang
mỗi màn hình, đủ để thấy hiệu ứng chuyển trang hoạt động). Nhờ vậy chạy được ngay, không
cần tài khoản. Đây là chế độ để nghiệm thu trước khi bàn giao.

> Dữ liệu mẫu phải nằm **trong** `public/` và được `import` như một ES module, không đặt
> ngoài thư mục gốc rồi `fetch`: Firebase Hosting lấy `public/` làm gốc website, nên file
> để ngoài sẽ 404 sau khi deploy.

Firebase SDK dùng **modular v10 qua CDN ESM** (`https://www.gstatic.com/firebasejs/10.12.2/…`).
Không dùng npm, không build step — deploy là copy thư mục `public/`.

---

## 5. Bố cục màn hình (`omhN.html`)

- Thiết kế gốc **1920×1080 landscape**, dùng `clamp()` + `vw/vh` để tự co giãn.
- Lưới `2 hàng × 3 cột`. Khi trang có 4 hoặc 5 món, ô còn lại được các món chia đều
  (`grid-auto-flow` + span) để không bị lỗ hổng xấu.
- Mỗi thẻ món: ảnh (Ken Burns zoom chậm 12s), tên món (viền chữ theo `outlineColor`),
  mô tả, giá (badge nổi bật), nhãn `badge` nếu có.
- Chỉ animate `transform` và `opacity` (GPU). Không animate `width/height/top/left`.
- Có `<canvas id="fx">` phủ toàn màn cho hiệu ứng hạt theo mùa, `pointer-events:none`.
- Ẩn con trỏ chuột (`cursor:none`), chặn scroll, chống burn-in bằng cách dịch layout
  ±4px rất chậm (chu kỳ 15 phút).
- Khi `settings.revision` thay đổi → cập nhật mượt tại chỗ, KHÔNG reload trang.

---

## 6. Trang quản trị (`public/admin/`) — tiếng Việt

Tab | Nội dung
---|---
**Tổng quan** | Trạng thái 4 màn hình (Đang chạy / Mất kết nối, thời điểm liên lạc cuối, trang đang hiển thị), tổng số món, số trang mỗi màn, nút "Đẩy cập nhật"
**Món ăn** | Bảng CRUD: ảnh, tên (PL), mô tả (PL), giá, danh mục, nhãn, ẩn/hiện, ghim màn hình. Kéo–thả đổi thứ tự. Tìm kiếm + lọc theo danh mục. Nhân bản món.
**Bố cục** | Số món/trang (4–6), thời gian chuyển trang (giây), kiểu chuyển cảnh, chế độ phân trang (tự động/thủ công), sơ đồ cho thấy trang nào rơi vào màn hình nào
**Giao diện** | Chọn 1 trong 6 theme mùa → áp dụng tức thì cho cả 4 màn. Tùy chỉnh: màu nền, màu chữ, màu viền chữ + độ dày, màu giá, font, kiểu hiệu ứng hạt, mức hiệu ứng
**Xem trước** | 4 iframe thu nhỏ chạy `omh1..4.html?preview=1` — thấy đúng những gì khách thấy, ngay khi chỉnh

- Đăng nhập bằng Firebase Auth (email/mật khẩu). Chưa đăng nhập → chỉ thấy form login.
- Mọi thay đổi lưu → tăng `settings.revision` → 4 màn hình cập nhật trong ~1 giây.
- Responsive: dùng được trên điện thoại (chủ quán đổi giá tại quầy).

---

## 7. Bảo mật (`firestore.rules`)

```
match /{col}/{doc} {
  allow read: if true;                    // màn hình đọc công khai, không cần đăng nhập
  allow write: if request.auth != null;   // chỉ admin đã đăng nhập mới ghi
}
match /status/{doc} {
  allow read, write: if true;             // heartbeat từ màn hình (không có tài khoản)
}
```
API key của Firebase là công khai theo thiết kế — an toàn nằm ở rules ở trên.

---

## 8. Theme theo mùa (Ba Lan)

| id | Tên hiển thị (admin) | Dịp | Hạt |
|---|---|---|---|
| `hanabi` | Mặc định (Hanabi) | Quanh năm | fireworks |
| `christmas` | Giáng sinh (Boże Narodzenie) | 1–26/12 | snow |
| `newyear` | Năm mới (Sylwester / Nowy Rok) | 27/12–6/1 | fireworks |
| `easter` | Lễ Phục sinh (Wielkanoc) | tháng 3–4 | petals |
| `halloween` | Halloween / Wszystkich Świętych | 24/10–2/11 | embers |
| `summer` | Mùa hè (Lato / Grill) | 6–8 | bubbles |

Admin chọn thủ công (không tự đổi theo ngày) — chủ quán toàn quyền quyết định.
