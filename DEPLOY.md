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
   (vd `barkinglong-menu-a1b2c`) — **ghi nhớ ID này**, sẽ cần ở Bước 5.
4. Ở bước hỏi Google Analytics: có thể bấm **"Tắt"** (không bắt buộc cho dự án
   này) để tạo nhanh hơn.
5. Bấm **"Create project"** và chờ vài giây.

## Bước 2 — Bật Cloud Firestore (cơ sở dữ liệu)

1. Trong menu bên trái, chọn **"Build" → "Firestore Database"**.
2. Bấm **"Create database"**.
3. Chọn chế độ **"Start in production mode"** (rules bảo mật đã có sẵn trong
   dự án này, sẽ deploy ở Bước 6 — không cần chọn "test mode").
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

## Bước 4 — Lấy cấu hình Firebase và dán vào code

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

## Bước 5 — Cài công cụ dòng lệnh Firebase

Mở terminal, gõ lần lượt:

```bash
npm install -g firebase-tools
firebase login
```

Lệnh `firebase login` sẽ mở trình duyệt để bạn đăng nhập bằng đúng tài khoản
Google đã tạo dự án ở Bước 1.

## Bước 6 — Điền Project ID và deploy

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

## Bước 7 — Nhập thực đơn mẫu (tuỳ chọn)

File `public/assets/js/seed-data.js` chứa 72 món mẫu (chỉ dùng để tự động nạp
vào **chế độ DEMO** — localStorage của trình duyệt — khi chưa cấu hình
Firebase; đây là 1 module JS được `data-layer.js` import thẳng, không phải
file tải qua mạng, nên luôn có sẵn kể cả sau khi deploy thật).
Với Firebase thật, dữ liệu **không tự nạp** — bạn có 2 cách:

- **Cách dễ nhất (khuyên dùng):** mở trang `/admin` → tab **"Món ăn"** → thêm
  từng món bằng tay, lấy tên/mô tả/giá tham khảo trong
  `public/assets/js/seed-data.js`. Với 72 món việc này mất khoảng 1-1.5 giờ —
  có thể chỉ nhập trước một phần thực đơn thật rồi bổ sung dần, không cần làm
  hết trong 1 lần.
- **Cách nhanh cho người rành kỹ thuật:** dùng Firebase Console → Firestore
  Database → tạo thủ công collection `menu`, hoặc viết 1 script nhỏ dùng
  Firebase Admin SDK để import dữ liệu từ `public/assets/js/seed-data.js`
  (không có sẵn trong dự án này để giữ đúng nguyên tắc "không cần npm, không
  build step").

## Bước 8 — Kết nối tên miền barkinglong.pl

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

## Bước 9 — Trỏ 4 màn hình vào đúng URL

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

**Trang vẫn hiện dữ liệu DEMO (món ăn mẫu) dù đã điền `firebase-config.js`**
→ Kiểm tra lại: apiKey không được chứa chữ `"PASTE_"` nữa (dù chỉ 1 ký tự sai
cũng khiến hệ thống tưởng chưa cấu hình). Mở lại file, so từng ký tự với đoạn
code Firebase đưa ra ở Bước 4. Nhớ lưu file trước khi deploy lại.

**Đăng nhập `/admin` báo lỗi "permission denied" khi lưu món ăn**
→ Chưa deploy `firestore.rules`, hoặc chưa đăng nhập đúng tài khoản đã tạo ở
Bước 3. Chạy lại `firebase deploy --only firestore:rules`. Nếu vẫn lỗi, kiểm
tra tab "Users" trong Authentication xem tài khoản còn tồn tại không.

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
