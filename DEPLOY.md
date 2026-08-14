# Hướng dẫn triển khai — Menu điện tử Hanabi & Toro

> Tài liệu này viết cho người **không rành kỹ thuật**. Cứ làm theo từng bước
> theo đúng thứ tự, đừng bỏ bước nào. Nếu kẹt ở đâu, xem mục "Khắc phục sự cố"
> ở cuối trang.

Toàn bộ hệ thống chạy **miễn phí 100%** trên gói Spark của Firebase (không cần
thẻ tín dụng), miễn là bạn dùng đúng theo hướng dẫn này.

---

## Chuẩn bị

- 1 tài khoản Google (Gmail) để tạo dự án Firebase.
- Máy tính có cài trình duyệt (Chrome khuyến nghị) và có thể mở terminal /
  command line (trên Windows là "Command Prompt" hoặc "PowerShell", trên Mac
  là "Terminal").
- Đã cài [Node.js](https://nodejs.org) (bản LTS) — cần để chạy lệnh `npm` và
  `firebase` ở các bước sau. Cài xong, mở terminal gõ `node -v` để kiểm tra.
- Toàn bộ mã nguồn dự án này (thư mục chứa file `firebase.json`) đã tải về máy.

---

## Bước 1 — Tạo dự án Firebase

1. Vào https://console.firebase.google.com/ , đăng nhập bằng Gmail.
2. Bấm **"Add project" / "Tạo dự án"**.
3. Đặt tên dự án, ví dụ `barkinglong-menu`. Firebase sẽ tự sinh ra 1 Project ID
   (vd `barkinglong-menu-a1b2c`) — **ghi nhớ ID này**, sẽ cần ở Bước 7.
4. Ở bước hỏi Google Analytics: có thể bấm **"Tắt"** (không bắt buộc cho dự án
   này) để tạo nhanh hơn.
5. Bấm **"Create project"** và chờ vài giây.

## Bước 2 — Bật Cloud Firestore (cơ sở dữ liệu)

1. Trong menu bên trái, chọn **"Build" → "Firestore Database"**.
2. Bấm **"Create database"**.
3. Chọn chế độ **"Start in production mode"** (rules bảo mật đã có sẵn trong
   dự án này, sẽ deploy ở Bước 7 — không cần chọn "test mode").
4. Chọn khu vực (location) gần Ba Lan nhất có sẵn, ví dụ `europe-west` hoặc
   `eur3`. **Không đổi được sau khi tạo**, nên chọn kỹ ở bước này.
5. Bấm **"Enable"**.

## Bước 3 — Bật đăng nhập Email/Mật khẩu + tạo tài khoản admin

1. Menu bên trái → **"Build" → "Authentication"** → bấm **"Get started"**.
2. Tab **"Sign-in method"** → chọn **"Email/Password"** → bật công tắc
   **"Enable"** ở dòng đầu tiên → **"Save"**.
3. Sang tab **"Users"** → bấm **"Add user"**.
4. Nhập email và mật khẩu cho chủ quán (hoặc người quản trị) — đây chính là
   tài khoản sẽ dùng để đăng nhập trang `/admin`. Có thể tạo nhiều tài khoản
   nếu muốn nhiều người cùng quản trị được.
5. Bấm **"Add user"**.

> Ghi nhớ email + mật khẩu này lại — không có màn "quên mật khẩu" tự động
> trong bản này, nếu quên phải vào lại đây để đổi.

## Bước 4 — Thêm chính bạn vào danh sách admin (BẮT BUỘC)

Đăng nhập được ở trang `/admin` **chưa đủ** để lưu bất kỳ thứ gì (món ăn,
giao diện, bố cục) — hệ thống chỉ cho phép ghi dữ liệu với tài khoản nằm
trong 1 "danh sách trắng" admin riêng, tách biệt khỏi việc đăng nhập được hay
không (xem đầy đủ lý do kỹ thuật ở `docs/BAO-MAT.md`). Bỏ qua bước này, mọi
lần bấm "Lưu" — kể cả nút nhập dữ liệu mẫu ở Bước 8 — sẽ báo lỗi "permission
denied".

1. Vẫn ở tab **Authentication → Users** (Bước 3), tìm đúng dòng email vừa tạo
   → copy cột **User UID** (chuỗi ký tự dài, không phải email).
2. Menu bên trái → **"Build" → "Firestore Database"** → tab **"Data"**.
3. Bấm **"Start collection"** → Collection ID gõ đúng: `admins`.
4. Ở ô **Document ID**, dán đúng UID vừa copy ở bước 1 (không tự đặt tên
   khác, không gõ email).
5. Thêm 1 field bất kỳ để tài liệu không rỗng (Firebase Console bắt buộc),
   ví dụ field `addedAt`, kiểu `string`, giá trị `2026-08-13` — Firestore
   Rules không kiểm tra nội dung field này.
6. Bấm **"Save"**.

> Muốn thêm người quản trị thứ hai (nhân viên, người thân), hoặc muốn hiểu
> rõ vì sao thiết kế tách "đăng nhập được" và "được phép sửa" ra 2 lớp, xem
> `docs/BAO-MAT.md` mục 2 và 4.

## Bước 5 — Lấy cấu hình Firebase và dán vào code

1. Bấm biểu tượng bánh răng (⚙️) cạnh "Project Overview" (góc trên bên trái)
   → **"Project settings"**.
2. Cuộn xuống mục **"Your apps"**. Bấm biểu tượng **"</>"" (Web)** để tạo app
   web mới.
3. Đặt tên app tuỳ ý (vd `barkinglong-menu-web`). **KHÔNG** cần tick vào ô
   "Also set up Firebase Hosting" (ta sẽ làm bằng dòng lệnh ở bước sau).
4. Bấm **"Register app"**. Firebase hiện ra đoạn code chứa object
   `firebaseConfig` — copy các giá trị này.
5. Mở file `public/assets/js/firebase-config.js` trong dự án bằng trình soạn
   thảo bất kỳ (Notepad, VS Code, ...). Dán đè từng giá trị vào đúng chỗ chữ
   `"PASTE_..."`, ví dụ:

   ```js
   export const firebaseConfig = {
     apiKey: "AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
     authDomain: "barkinglong-menu-a1b2c.firebaseapp.com",
     projectId: "barkinglong-menu-a1b2c",
     storageBucket: "barkinglong-menu-a1b2c.appspot.com",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abcdef1234567890",
   };
   ```

6. Lưu file lại. Khi apiKey không còn chứa chữ `"PASTE_"` nữa, hệ thống sẽ tự
   động chuyển từ **chế độ DEMO** sang **chế độ Firebase thật**
   (`DEMO_MODE = false` — xem đầu file `firebase-config.js`).

## Bước 6 — Cài công cụ dòng lệnh Firebase

Mở terminal, gõ lần lượt:

```bash
npm install -g firebase-tools
firebase login
```

Lệnh `firebase login` sẽ mở trình duyệt để bạn đăng nhập bằng đúng tài khoản
Google đã tạo dự án ở Bước 1.

## Bước 7 — Điền Project ID và deploy

1. Mở file `.firebaserc`, thay `"PASTE_YOUR_FIREBASE_PROJECT_ID"` bằng Project
   ID thật (đã ghi nhớ ở Bước 1), ví dụ `"barkinglong-menu-a1b2c"`. Lưu lại.
2. Trong terminal, `cd` vào thư mục dự án (thư mục chứa `firebase.json`), rồi
   chạy:

   ```bash
   firebase deploy
   ```

   Lệnh này sẽ đồng thời deploy: trang web (thư mục `public/`) lên Firebase
   Hosting, và bộ quy tắc bảo mật `firestore.rules` lên Firestore.

3. Sau khi chạy xong, terminal in ra 1 địa chỉ dạng
   `https://<project-id>.web.app` — mở thử địa chỉ đó, thêm `/admin` ở cuối để
   vào trang quản trị, đăng nhập bằng tài khoản đã tạo ở Bước 3.

## Bước 8 — Nhập dữ liệu mẫu để thử nghiệm ngay (khuyên dùng)

Ngay sau khi deploy xong (Bước 7), Firestore của bạn **hoàn toàn trống** —
chưa có món ăn nào, cả 4 màn hình sẽ chỉ hiện màn hình chờ (logo, không có
món). Đây là chuyện bình thường: chế độ DEMO tự nạp 72 món mẫu vào bộ nhớ
trình duyệt, nhưng Firebase thật thì không tự nạp gì cả. Bạn **không cần gõ
tay 72 món** để thử hệ thống — trang quản trị có sẵn nút nhập nhanh:

1. Mở `https://<project-id>.web.app/admin` (địa chỉ terminal vừa in ra ở Bước
   7), đăng nhập bằng tài khoản đã tạo ở Bước 3 — tài khoản đó phải đã được
   thêm vào danh sách admin ở Bước 4, nếu không nút nhập dữ liệu mẫu sẽ báo
   lỗi "permission denied" khi bấm.
2. Ở tab **"Tổng quan"**, vì `menu` đang trống, bạn sẽ thấy ngay khung màu
   vàng **"Firestore chưa có món ăn nào"** với nút **"📥 Nhập 72 món ăn
   mẫu"**.
3. Bấm nút đó. Một hộp thoại tiếng Việt sẽ xác nhận rõ những gì sắp xảy ra:
   ghi 72 món ăn mẫu vào Firestore (collection `menu`), cộng thêm cấu hình
   mặc định `settings/global` nếu chưa có. Bấm **"Nhập 72 món mẫu"** để tiếp
   tục.
4. Chờ vài giây — hệ thống ghi dữ liệu theo từng đợt (batch), có thanh tiến
   trình ngay trong hộp thoại. Xong sẽ có thông báo "Đã nhập dữ liệu mẫu
   thành công".
5. Mở tab **"Xem trước"** (hoặc trực tiếp `omh1.html`..`omh4.html`) để thấy
   72 món chia đều cho 4 màn hình, tự xoay trang — đúng những gì khách sẽ
   thấy khi màn hình signage thật lên sóng.

> **An toàn dữ liệu:** nút này sẽ KHÔNG bao giờ âm thầm ghi đè dữ liệu có
> sẵn. Nếu `menu` đã có món (vd bạn bấm lại lần 2, hoặc đã nhập vài món thật
> tay trước đó), hệ thống sẽ hỏi bạn chọn rõ ràng giữa **"Thêm vào"** (giữ
> nguyên món hiện có, chỉ thêm/ghi đè lại đúng 72 món mẫu) hoặc **"Xoá hết
> rồi nhập lại"** (xoá sạch toàn bộ rồi nhập lại từ đầu — có thêm 1 bước xác
> nhận riêng vì hành động này không thể hoàn tác).

**Sau khi thử nghiệm xong, trước khi nhập thực đơn thật của quán:** quay lại
tab "Tổng quan" → mục **"🛠️ Công cụ dữ liệu mẫu (nâng cao)"** (tự thu gọn lại
khi đã có dữ liệu, để không ai lỡ tay bấm nhầm) → bấm **"🗑️ Xoá toàn bộ dữ
liệu mẫu"** để dọn sạch 72 món mẫu (có xác nhận tương tự), rồi bắt đầu nhập
từng món ăn thật ở tab **"Món ăn"**.

Muốn xem trước tên/mô tả/giá của 72 món mẫu trước khi nhập, mở file
`public/assets/js/seed-data.js` bằng trình soạn thảo bất kỳ — đây cũng chính
là dữ liệu tự nạp vào chế độ DEMO (localStorage) khi chưa cấu hình Firebase,
nên nội dung luôn khớp giữa 2 chế độ.

> Cách làm cũ (gõ tay từng món, hoặc tự viết script Admin SDK) vẫn hoạt động
> nếu bạn muốn — nhưng với 72 món, nút nhập nhanh ở trên tiết kiệm khoảng
> 1-1.5 giờ so với gõ tay, mà vẫn không cần cài thêm npm hay viết code nào.

## Bước 9 — Kết nối tên miền barkinglong.pl

1. Firebase Console → **"Hosting"** → **"Add custom domain"**.
2. Nhập `barkinglong.pl` → **"Continue"**.
3. Firebase hiện ra 1-2 bản ghi DNS (thường là `A` record trỏ tới IP, hoặc
   `TXT` record để xác minh quyền sở hữu). Đăng nhập vào nơi quản lý tên miền
   (nhà cung cấp domain `barkinglong.pl`) → phần quản lý DNS → thêm đúng các
   bản ghi Firebase yêu cầu.
4. Quay lại Firebase Console, bấm **"Verify"**. Việc lan truyền DNS có thể mất
   từ vài phút đến 24-48 giờ.
5. Sau khi xác minh xong, Firebase tự cấp chứng chỉ SSL (https) miễn phí —
   không cần làm gì thêm.

## Bước 10 — Trỏ 4 màn hình vào đúng URL

Sau khi domain hoạt động, mở trên mỗi màn hình (trình duyệt full-screen /
kiosk mode) đúng 1 địa chỉ:

| Màn hình | Địa chỉ |
|---|---|
| Màn hình 1 | `https://barkinglong.pl/omh1.html` |
| Màn hình 2 | `https://barkinglong.pl/omh2.html` |
| Màn hình 3 | `https://barkinglong.pl/omh3.html` |
| Màn hình 4 | `https://barkinglong.pl/omh4.html` |

Mẹo: dùng Chrome kiosk mode để ẩn thanh địa chỉ, vd trên Windows tạo shortcut
với đích:
`"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk https://barkinglong.pl/omh1.html`

Nếu 1 màn hình khởi động lại (mất điện, treo máy...), chỉ cần mở lại đúng
URL — nhờ cơ chế đồng hồ tuyệt đối (xem `docs/ARCHITECTURE.md` mục 3), màn
hình sẽ tự đồng bộ lại đúng trang đang chiếu trên các màn còn lại, không cần
canh giờ thủ công.

---

## Cài đặt màn hình vật lý (IIYAMA 49.5" 4K, chạy iiSignage)

Phần này dành riêng cho việc setup **4 màn hình signage thật** — IIYAMA
LH5060UHS-B1AG 49.5", 4K UHD 3840×2160, Android SoC tích hợp, chạy nội dung
qua ứng dụng **iiSignage** cài sẵn trên máy. Đây là loại màn hình "chạy 24/7,
không ai đứng canh" — làm đúng các bước dưới đây một lần rồi quên đi.

### Bước A — Trỏ iiSignage vào đúng URL từng màn hình

1. Mở ứng dụng **iiSignage** trên màn hình (thường có sẵn trên màn hình chờ
   Android hoặc trong danh sách ứng dụng).
2. Chọn chế độ nguồn nội dung là **"URL / Website / Trình duyệt"** (tuỳ bản
   iiSignage, tên mục có thể khác đôi chút — tìm mục cho phép nhập 1 địa chỉ
   web để hiển thị toàn màn hình).
3. Nhập đúng URL của **đúng 1 màn hình** — không được trỏ nhầm 2 màn vào cùng
   1 URL, vì đó là lý do khiến món ăn bị trùng lặp giữa các màn hình:

   | Màn hình vật lý | URL nhập vào iiSignage |
   |---|---|
   | Màn hình 1 | `https://barkinglong.pl/omh1.html` |
   | Màn hình 2 | `https://barkinglong.pl/omh2.html` |
   | Màn hình 3 | `https://barkinglong.pl/omh3.html` |
   | Màn hình 4 | `https://barkinglong.pl/omh4.html` |

4. Đặt chế độ hiển thị là **toàn màn hình / kiosk** (ẩn thanh địa chỉ, ẩn
   thanh điều hướng Android) nếu iiSignage có tuỳ chọn này.
5. Lưu cấu hình, khởi động lại ứng dụng iiSignage (hoặc khởi động lại màn
   hình) để xác nhận nó tự mở đúng URL sau khi bật nguồn — quan trọng vì màn
   hình signage thường mất điện đột ngột (dọn dẹp cuối ngày, cúp điện...) và
   phải tự phục hồi không cần ai bấm gì.

### Bước B — Bật NTP / giờ tự động (BẮT BUỘC)

Hệ thống dùng "đồng hồ tuyệt đối" (mục 3 `ARCHITECTURE.md`) để 4 màn hình lật
trang cùng lúc, và tính năng tự tải lại ban đêm (`reloadHour`, mặc định
04:00) cũng dựa vào giờ hệ thống của chính màn hình. Nếu giờ máy sai, cả 2 sẽ
sai theo — ưu tiên cao:

1. Vào **Cài đặt Android** (Settings) trên màn hình → **Ngày & giờ** (Date &
   time).
2. Bật **"Ngày giờ tự động" / "Automatic date & time"** (dùng NTP qua mạng)
   — KHÔNG đặt tay.
3. Bật **"Múi giờ tự động" / "Automatic time zone"**, hoặc nếu màn hình không
   có GPS/định vị, đặt tay múi giờ **Europe/Warsaw (UTC+1, UTC+2 giờ mùa
   hè)** — đúng múi giờ Ba Lan.
4. Xác nhận màn hình có kết nối mạng ổn định (WiFi hoặc dây LAN) — NTP cần
   mạng để đồng bộ, và tất nhiên cả hệ thống cũng cần mạng để tải menu.

### Bước C — Tắt màn hình chờ / chế độ ngủ (BẮT BUỘC)

Màn hình phải sáng liên tục 24/7 (hoặc theo giờ mở cửa quán) — nếu Android
tự tắt màn hình hoặc bật screensaver, khách sẽ nhìn thấy màn hình đen/logo
Android thay vì menu:

1. **Cài đặt Android** → **Màn hình** (Display) → **Chế độ chờ / Sleep** →
   đặt **"Không bao giờ" / "Never"** (hoặc giá trị dài nhất có).
2. Nếu máy có mục **"Screen saver" / "Daydream"** riêng → **Tắt hẳn**.
3. Nếu iiSignage có tuỳ chọn "giữ màn hình sáng" (Keep screen on / Wake
   lock) riêng trong app → bật tuỳ chọn đó thêm cho chắc (2 lớp bảo vệ).
4. Nếu quán muốn màn hình tắt ngoài giờ mở cửa để tiết kiệm điện, dùng lịch
   **bật/tắt của chính bảng IIYAMA** (đa số dòng signage LH có lịch bật/tắt
   phần cứng riêng trong menu OSD của màn hình, độc lập với Android) — KHÔNG
   dùng chế độ ngủ của Android cho việc này, vì nó dễ treo ứng dụng khi màn
   hình "ngủ nửa vời".

### Bước D — Việc màn hình tự làm, bạn không cần làm

Hệ thống đã có sẵn các cơ chế tự phục hồi cho phần cứng chạy 24/7 (xem thêm
`docs/ARCHITECTURE.md`), không cần can thiệp thủ công:

- **Tự tải lại ban đêm**: mỗi ngày, đúng 1 lần vào giờ đặt ở admin (tab
  **Bố cục** → "Giờ tự tải lại màn hình", mặc định 04:00), màn hình tự
  `reload` để dọn bộ nhớ trình duyệt tích tụ — không cần ai bấm F5.
- **Watchdog**: nếu vòng lặp hiển thị bị treo (WebView bị hệ điều hành
  throttle, hoặc lỗi JS lạ) trong khoảng 90 giây, màn hình tự tải lại.
- **Đồng bộ lại đồng hồ mỗi giờ**: bù trôi đồng hồ hệ điều hành qua nhiều
  tuần chạy liên tục, để 4 màn hình không bị lệch nhịp lật trang dần theo
  thời gian.
- **Cỡ chữ tự thích ứng độ phân giải**: dù iiSignage/WebView có tôn trọng
  đúng viewport 1920 khai báo hay không (một số WebView cũ trên SoC yếu bỏ
  qua), chữ và bố cục vẫn hiển thị đúng tỉ lệ ở 4K.

### Kiểm tra khi 1 màn hình bị "đen" hoặc trắng trơn

Theo thứ tự, dễ kiểm tra trước:

1. **Màn hình đen hoàn toàn (không có gì, kể cả không có ánh sáng nền)** →
   kiểm tra nguồn điện, cáp HDMI/nguồn của bảng IIYAMA, và xem màn hình có bị
   lịch bật/tắt phần cứng (OSD) tắt nhầm giờ không (Bước C.4).
2. **Màn hình sáng nhưng chỉ thấy màn hình chờ Android / launcher** →
   iiSignage bị thoát hoặc chưa tự khởi động lại — mở lại app, kiểm tra mục
   "tự khởi động cùng hệ thống" (auto-start on boot) của iiSignage trong cài
   đặt Android (Apps → iiSignage → cho phép chạy nền / tự khởi động).
3. **Màn hình trắng trơn, không có chữ gì** → nhiều khả năng nhất là WebView
   quá cũ (xem mục "Problem 3" — thiết kế đã có "lưới an toàn" sẽ hiện thông
   báo tiếng Ba Lan kèm phiên bản Chrome phát hiện được thay vì trắng hoàn
   toàn; nếu vẫn trắng tuyệt đối, WebView có thể quá cũ đến mức không chạy cả
   script ES5 nền — cần cập nhật WebView qua Google Play Store trên máy, hoặc
   liên hệ IIYAMA về firmware Android mới hơn).
4. **Menu hiện đúng nhưng đứng yên, không lật trang** → dùng `?screen=N` để
   xác nhận đúng số màn hình, sau đó xem watchdog có tự phục hồi sau ~90 giây
   không; nếu quá lâu vẫn đứng yên, thử tải lại bằng tay 1 lần (khởi động lại
   iiSignage) rồi theo dõi tiếp — nếu lặp lại thường xuyên, có thể mạng
   không ổn định (mất kết nối tới Firestore) hoặc WebView bị lỗi ngầm, cân
   nhắc cập nhật WebView.
5. **Món ăn bị trùng ở 2 màn hình, hoặc thiếu món** → gần như chắc chắn do
   nhập nhầm URL ở Bước A (2 màn cùng trỏ 1 `omhN.html`) — kiểm tra lại cấu
   hình iiSignage của từng màn.

---

## Giới hạn gói miễn phí (Spark) và vì sao thiết kế nằm trong hạn mức

| Hạn mức Spark (miễn phí) | Dự án này dùng khoảng bao nhiêu |
|---|---|
| Firestore: 50.000 lượt đọc / ngày | 4 màn hình dùng realtime listener (`onSnapshot`) — chỉ tính 1 lượt đọc mỗi khi **dữ liệu thật sự thay đổi**, không đọc lặp lại theo chu kỳ. Với quán ăn đổi thực đơn vài lần/ngày, con số này chỉ vài trăm lượt đọc/ngày. |
| Firestore: 20.000 lượt ghi / ngày | Heartbeat 4 màn hình × 1 lần/60 giây = 4 × 1440 = **5.760 lượt ghi/ngày** (xem mục 2 `ARCHITECTURE.md`) — dưới 30% hạn mức, còn nhiều dư địa cho admin chỉnh sửa món ăn. |
| Firestore: 1GB lưu trữ | Ảnh món ăn giới hạn cứng 700KB/ảnh (nén WebP client-side trước khi ghi) — 1GB chứa được hơn 1.400 ảnh, thừa cho một thực đơn vài chục món. |
| Hosting: 10GB truyền tải / tháng, 360MB/ngày | Không dùng framework/build step, file rất nhẹ (vài trăm KB mỗi lần tải trang), 4 màn hình mở liên tục cả tháng vẫn nằm sâu trong hạn mức. |
| Authentication: không giới hạn số lượt đăng nhập cho gói Email/Password | Chỉ admin đăng nhập, tần suất thấp. |

Nói ngắn gọn: thiết kế **cố tình tránh polling** (không dùng `setInterval` gọi
API liên tục) mà dùng `onSnapshot` (chỉ báo khi có thay đổi thật) + heartbeat
thưa (60 giây/lần) — đây là lý do hệ thống chạy 24/7 trên 4 màn hình mà vẫn
nằm gọn trong gói miễn phí, không bao giờ phát sinh chi phí ngoài ý muốn.

---

## Khắc phục sự cố

> **Mẹo:** khi chạy với Firebase thật (không phải DEMO), trang `/admin` tự
> kiểm tra cấu hình ngay khi tải trang — kể cả TRƯỚC khi đăng nhập — và hiện
> 1 banner ở đầu trang báo chính xác bằng tiếng Việt nếu thiếu bước nào
> (config còn để giá trị mẫu, Firestore chưa bật/không đọc được, rules chưa
> deploy, hay Email/Password chưa bật), kèm luôn cách khắc phục. Nếu gặp bất
> kỳ lỗi nào bên dưới, hãy xem banner đó trước — thường nó đã chỉ đúng nguyên
> nhân, đỡ phải dò từng mục thủ công.

**Trang vẫn hiện dữ liệu DEMO (món ăn mẫu) dù đã điền `firebase-config.js`**
→ Kiểm tra lại: apiKey không được chứa chữ `"PASTE_"` nữa (dù chỉ 1 ký tự sai
cũng khiến hệ thống tưởng chưa cấu hình). Mở lại file, so từng ký tự với đoạn
code Firebase đưa ra ở Bước 5. Nhớ lưu file trước khi deploy lại.

**Đăng nhập `/admin` thành công nhưng báo lỗi "permission denied" khi lưu món ăn**
→ Gần như chắc chắn là bạn CHƯA làm Bước 4 ("Thêm chính bạn vào danh sách
admin"). Hệ thống cố tình tách "đăng nhập được" và "được phép sửa" ra 2 lớp
riêng — đăng nhập đúng mật khẩu không có nghĩa là được phép ghi dữ liệu; cần
có thêm tài liệu `admins/<UID-của-bạn>` trong Firestore. Quay lại Bước 4 làm
đúng theo từng bước (hoặc xem `docs/BAO-MAT.md` mục 2-3 để hiểu kỹ hơn), tải
lại trang admin rồi thử lưu lại. Nếu đã có `admins/<UID>` mà vẫn lỗi, có thể
`firestore.rules` chưa được deploy đúng bản mới nhất — chạy lại
`firebase deploy --only firestore:rules`.

**Vừa vào `/admin` (chưa kịp đăng nhập) đã thấy banner đỏ báo lỗi cấu hình**
→ Đây là tính năng tự kiểm tra (preflight), không phải lỗi phát sinh — đọc kỹ
dòng "👉" trong banner, nó chỉ đúng bước nào trong Bước 2/3/5/7 ở trên đang
thiếu hoặc sai (preflight kiểm tra cấu hình/Firestore/Auth — KHÔNG kiểm tra
được Bước 4 admin allowlist trước khi đăng nhập; lỗi "permission denied" sau
khi đăng nhập thành công thuộc về mục ngay phía trên). Sửa xong, tải lại
trang để banner tự kiểm tra lại.

**Tải ảnh món ăn báo lỗi "Ảnh sau khi nén vẫn quá lớn"**
→ Ảnh gốc quá chi tiết/độ phân giải quá cao khiến sau khi nén WebP vẫn vượt
700KB. Chọn ảnh khác, hoặc dùng công cụ resize ảnh xuống khoảng 1200px chiều
rộng trước khi tải lên.

**4 màn hình không đổi trang cùng lúc / lệch nhau vài giây**
→ Bình thường nếu lệch dưới 1 giây (do độ trễ tính `serverOffsetMs`). Nếu lệch
nhiều, kiểm tra đồng hồ hệ điều hành của máy chạy màn hình có đúng múi giờ
không — dù hệ thống đã bù trừ qua server, đồng hồ máy sai quá nhiều (nhiều
phút) vẫn có thể gây lệch nhẹ do sai số làm tròn.

**Đổi giao diện/theme trong admin nhưng màn hình không cập nhật**
→ Đợi khoảng 1-2 giây (realtime qua Firestore). Nếu vẫn không thấy, kiểm tra
màn hình có đang mất mạng không (xem tab "Tổng quan" trong admin — mục
"Mất kết nối"). Refresh thủ công (F5) màn hình đó nếu cần.

**Vừa deploy code mới (sửa file .js) nhưng màn hình vẫn chạy code cũ**
→ File JS trong `public/assets/js/` được cache tối đa 1 ngày (xem
`firebase.json`). Refresh cứng (Ctrl+Shift+R / Cmd+Shift+R) trên máy chạy màn
hình đó để lấy bản mới ngay lập tức, hoặc đợi tối đa 24 giờ để cache tự hết
hạn.

**Không kết nối được domain `barkinglong.pl`**
→ Kiểm tra lại bản ghi DNS đã thêm đúng chưa (mục Hosting → domain đó trong
Firebase Console sẽ báo rõ trạng thái "Needs setup / Pending / Connected").
DNS có thể mất tới 48 giờ để lan truyền hoàn toàn trên toàn cầu — nếu mới thêm
vài giờ thì cứ chờ thêm.

**Muốn quay lại chế độ DEMO để test mà không ảnh hưởng dữ liệu thật**
→ Mở `public/assets/js/firebase-config.js`, tạm đổi `apiKey` về chứa lại chữ
`"PASTE_"` (vd thêm tiền tố `"PASTE_TEST_"`), lưu, chạy thử trên máy local —
không cần deploy. Nhớ đổi lại đúng giá trị thật trước khi deploy lần sau.
