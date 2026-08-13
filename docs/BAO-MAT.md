# Bảo mật thực đơn điện tử — Hướng dẫn cho chủ quán

> Tài liệu này viết cho người **không rành kỹ thuật**. Không cần hiểu code, chỉ
> cần làm đúng theo các bước dưới đây là hệ thống an toàn.

---

## 1. `apiKey` bị lộ trong mã nguồn trang — có phải lỗ hổng không?

**Không.** Nếu bạn (hoặc ai đó) bấm chuột phải → "Xem mã nguồn trang" (View Page
Source) trên `barkinglong.pl` và thấy một chuỗi trông giống mật khẩu (`apiKey:
"AIzaSy..."`), đó **không phải là rò rỉ mật khẩu**. Google/Firebase thiết kế
`apiKey` này để công khai — nó chỉ nói cho trình duyệt biết "hãy nói chuyện với
đúng dự án Firebase nào", giống như biết địa chỉ một toà nhà. Biết địa chỉ
không có nghĩa là mở được cửa.

**Thứ thật sự bảo vệ dữ liệu của bạn là tệp `firestore.rules`** — một danh
sách quy tắc nằm trên máy chủ Firebase, quyết định *ai được đọc gì, ai được
ghi gì*, mà không ai từ bên ngoài có thể sửa được (kể cả khi họ biết
`apiKey`). Coi `firestore.rules` như ổ khoá cửa thật; `apiKey` chỉ là địa chỉ
nhà.

Sau bản vá này, quy tắc quan trọng nhất là: **chỉ những tài khoản nằm trong
một danh sách admin do chính bạn tạo trong Firebase Console mới được sửa thực
đơn** — không phải "ai đăng nhập được cũng sửa được" như trước. Mục 2 dưới
đây hướng dẫn bạn tạo chính mình vào danh sách đó.

---

## 2. Thêm chính bạn vào danh sách admin (BẮT BUỘC — làm ngay sau khi khai trương)

Nếu bạn chưa làm bước này, **trang quản trị sẽ báo lỗi mỗi khi bạn bấm Lưu**
— xem cảnh báo quan trọng ở mục 3 bên dưới.

### Bước 1 — Tạo tài khoản đăng nhập (nếu chưa có)
1. Mở `barkinglong.pl/admin/`.
2. Nếu trang chỉ hiện ô đăng nhập (email + mật khẩu) và bạn chưa có tài
   khoản: tài khoản đăng nhập được tạo trong **Firebase Console**, không tạo
   ngay trên trang admin. Vào
   [console.firebase.google.com](https://console.firebase.google.com) → chọn
   đúng dự án của quán → menu bên trái **Authentication** → tab **Users** →
   nút **Add user** → nhập email + mật khẩu của bạn → **Add user**.

### Bước 2 — Lấy UID của bạn (một chuỗi mã định danh, không phải email)
1. Vẫn ở **Authentication → Users**, tìm đúng dòng có email của bạn.
2. Cột **User UID** có một chuỗi ký tự dài kiểu
   `aB3xY9kLmN0pQrStUvWxYz12345a` — bấm vào để copy nguyên chuỗi đó
   (thường có biểu tượng copy cạnh bên). **Đây chính là "chìa khoá" bạn cần
   ở bước 3.**

### Bước 3 — Tạo tài liệu admin trong Firestore
1. Menu bên trái → **Firestore Database** → tab **Data**.
2. Nếu **chưa có collection tên `admins`**: bấm **Start collection**
   (hoặc dấu **+** cạnh danh sách collection) → ô "Collection ID" gõ đúng:
   ```
   admins
   ```
3. Firebase sẽ hỏi tạo tài liệu đầu tiên (Document ID). **Dán đúng UID bạn
   vừa copy ở Bước 2 vào ô "Document ID"** (không tự đặt tên khác, không gõ
   email — phải là đúng chuỗi UID).
4. Thêm một field bất kỳ để tài liệu không rỗng, ví dụ:
   - Field name: `addedAt`
   - Type: `string`
   - Value: `2026-08-13` (ngày hôm nay, chỉ để ghi chú — Firestore Rules
     không kiểm tra nội dung field này, có nó chỉ vì Firebase Console bắt
     buộc tài liệu phải có ít nhất 1 field)
5. Bấm **Save**.

Xong. Ngay khi tài liệu `admins/<UID-của-bạn>` tồn tại, tài khoản đó có toàn
quyền sửa thực đơn/giao diện/bố cục qua trang admin.

> **Lưu ý về đường dẫn:** tài liệu phải nằm ở đúng
> `admins/<UID>` — tức collection tên `admins`, Document ID **là** UID
> (không phải một field tên `uid` bên trong tài liệu nào khác).

---

## 3. CẢNH BÁO QUAN TRỌNG — "Sao tôi Lưu mà báo lỗi?"

Đây gần như chắc chắn là điều đầu tiên bạn gặp phải khi mới khai trương, nếu
bạn quên làm mục 2:

- Bạn đăng nhập vào `/admin/` **thành công** (đúng email/mật khẩu).
- Nhưng khi bấm **Lưu** ở tab Món ăn / Bố cục / Giao diện, hệ thống báo lỗi
  quyền truy cập (permission denied), thay đổi **không được lưu**.

**Đây không phải app bị hỏng.** Đây là vì bạn đăng nhập được (đúng mật khẩu)
nhưng UID của bạn **chưa có** trong danh sách `admins/{uid}` ở Firestore. Hệ
thống cố tình tách hai việc "đăng nhập được" và "được phép sửa" ra làm hai
lớp riêng, để nếu ai đó tự tạo tài khoản (xem mục 5), họ đăng nhập được
nhưng không sửa được gì cả.

**Cách sửa: làm đúng theo mục 2 ở trên (tạo `admins/<UID-của-bạn>`).** Sau đó
tải lại trang admin và thử Lưu lại — sẽ hoạt động bình thường, không cần chờ
đợi hay khởi động lại gì cả.

---

## 4. Thêm / gỡ admin thứ hai (ví dụ: nhân viên quản lý, người thân)

**Thêm:** lặp lại đúng mục 2 với tài khoản của người đó:
1. Authentication → Users → Add user (tạo tài khoản cho họ, hoặc để họ tự có
   một tài khoản do bạn tạo sẵn — **không dùng chức năng tự đăng ký trên
   trang admin**, vì trang admin của hệ thống này không có nút "Đăng ký").
2. Copy UID của họ.
3. Firestore Database → collection `admins` → **Add document** → Document ID
   = UID của họ → thêm field bất kỳ → Save.

**Gỡ quyền admin** (ví dụ nhân viên nghỉ việc, hoặc nghi ngờ mật khẩu bị lộ):
1. Firestore Database → collection `admins` → tìm đúng tài liệu có
   Document ID = UID của người đó.
2. Bấm vào tài liệu → menu **⋮** (ba chấm) → **Delete document**.
3. Xong — ngay lập tức người đó đăng nhập được nhưng không sửa được gì nữa.
   Muốn chặn hẳn cả việc đăng nhập, xoá luôn tài khoản của họ ở
   **Authentication → Users** (bấm vào dòng của họ → **Delete account**).

> Không có cách nào để tự thêm/gỡ admin từ trang `/admin/` — đây là **cố ý**,
> để không ai (kể cả khi chiếm được một tài khoản admin) có thể tự phong
> thêm admin khác qua app. Việc này chỉ làm được thủ công trong Firebase
> Console như trên.

---

## 5. Rủi ro còn lại (đã giảm tối đa, nhưng chưa thể triệt tiêu 100%)

1. **Bất kỳ ai vẫn có thể tự tạo một tài khoản đăng nhập** (Firebase cho phép
   tự đăng ký qua "cửa sau" kỹ thuật, dù trang admin của bạn không có nút
   đăng ký). Nhưng từ bản vá này, **tự có tài khoản không còn nghĩa là sửa
   được gì** — họ đăng nhập được nhưng mọi thao tác ghi đều bị từ chối, trừ
   khi UID của họ có mặt trong `admins/{uid}` (mà chỉ bạn kiểm soát qua
   Console). Nói cách khác: cửa vẫn có người gõ được, nhưng ổ khoá không mở
   cho họ.
2. **Heartbeat của 4 màn hình (`status/screen1..4`) vẫn phải ghi công khai,
   không đăng nhập** — vì 4 màn hình chạy tự động 24/7, không có người ngồi
   gõ mật khẩu. Bản vá đã giới hạn: chỉ 4 mã màn hình cố định
   (`screen1`..`screen4`), đúng hình dạng dữ liệu heartbeat, và giới hạn độ
   dài từng trường — nên không ai tạo ra hàng nghìn tài liệu rác hay gửi dữ
   liệu khổng lồ được nữa. **Nhưng vẫn còn một khe hở nhỏ:** kẻ xấu vẫn có
   thể gửi liên tục các heartbeat *đúng khuôn dạng* vào 4 mã màn hình đó, để
   cố tình tiêu hao **hạn mức ghi miễn phí 20.000 lần/ngày** của Firebase
   (gói Spark). Rủi ro này **thấp** (chỉ ảnh hưởng tab "Tổng quan" trong
   admin, không ảnh hưởng thực đơn hiển thị trên 4 màn hình) nhưng **không
   thể loại bỏ hoàn toàn** nếu 4 màn hình tiếp tục ghi mà không cần đăng
   nhập. Nếu muốn đóng khe hở này triệt để trong tương lai, giải pháp kỹ
   thuật là chuyển 4 màn hình sang dùng **Firebase Anonymous Auth** (mỗi màn
   tự đăng nhập ẩn danh một lần khi khởi động, không cần bạn nhập mật khẩu
   gì) — đây là việc có thể làm sau, không bắt buộc phải xong trước khi khai
   trương.

**Tóm lại:** sau bản vá, kẻ xấu đọc được `apiKey` công khai và tự tạo tài
khoản **cũng không sửa được thực đơn** — họ chỉ còn khả năng gửi rác vào một
chỗ ít quan trọng (heartbeat) với thiệt hại giới hạn ở việc tốn hạn mức miễn
phí, chứ không thể phá thực đơn hiển thị trên 4 màn hình trong quán.
