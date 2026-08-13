# Deploy tự động bằng GitHub Actions

> Tài liệu này dành cho người **chưa từng dùng GitHub Actions, chưa từng mở terminal**.
> Làm theo đúng thứ tự, từng bước một. Chỉ cần làm phần "Thiết lập ban đầu" **một lần**
> — sau đó mỗi lần thay đổi gì trên GitHub (kể cả sửa trực tiếp trên web GitHub), trang
> web sẽ **tự động cập nhật** trong vài phút, không cần làm gì thêm.

Có sẵn workflow tại `.github/workflows/firebase-deploy.yml`. Mỗi khi có thay đổi được
đưa lên nhánh `main` (hoặc nhánh làm việc hiện tại), GitHub sẽ tự chạy:

1. Kiểm tra file cấu hình Firebase đã điền đủ chưa (chặn lại nếu chưa, xem mục 5).
2. Đẩy (deploy) toàn bộ trang web (`public/`) lên **Firebase Hosting**.
3. Đẩy luôn **quy tắc bảo mật Firestore** (`firestore.rules`) — bước này rất dễ bị quên
   nếu deploy tay, và nếu quên thì trang quản trị sẽ báo lỗi "permission-denied" mà
   không rõ lý do.

---

## 1. Thiết lập ban đầu (chỉ làm một lần)

### Bước 1.1 — Tạo "chìa khóa" cho GitHub (service account key)

Đây là một file `.json` cho phép GitHub tự động đăng nhập vào dự án Firebase để deploy
thay bạn — giống như đưa cho GitHub một chiếc chìa khóa riêng, không phải mật khẩu tài
khoản Google của bạn.

1. Mở https://console.firebase.google.com/ → chọn đúng dự án (project) của Hanabi & Toro.
2. Bấm biểu tượng bánh răng ⚙️ ở góc trên bên trái, cạnh "Project Overview" → chọn
   **Project settings**.
3. Chọn tab **Service accounts** (Tài khoản dịch vụ) ở thanh ngang phía trên.
4. Bấm nút **Generate new private key** (Tạo khóa riêng tư mới).
5. Một hộp thoại cảnh báo hiện ra → bấm **Generate key** (Tạo khóa) để xác nhận.
6. Trình duyệt sẽ **tự tải về một file `.json`**, tên dạng
   `ten-du-an-firebase-adminsdk-xxxxx.json`. Đây chính là "chìa khóa" — **giữ kỹ, không
   chia sẻ cho ai** (xem cảnh báo bảo mật ở mục 4 bên dưới).
7. Cũng trong **Project settings** → tab **General**, ghi lại giá trị **Project ID**
   (không phải "Project name" — hai cái khác nhau). Ví dụ: `barkinglong-menu-a1b2c`.

### Bước 1.2 — Thêm "chìa khóa" đó vào GitHub

1. Mở repo trên GitHub (trang `github.com/.../manhinh`).
2. Bấm tab **Settings** (Cài đặt) — nằm ngang hàng với "Code", "Issues", "Pull requests"...
   Nếu không thấy tab này, tài khoản bạn chưa có quyền Admin trên repo — nhờ người quản
   trị GitHub của tổ chức cấp quyền hoặc thực hiện giúp bước này.
3. Ở menu bên trái, chọn **Secrets and variables** → **Actions**.
4. Ở tab **Secrets**, bấm nút xanh **New repository secret**.
5. Điền:
   - **Name**: `FIREBASE_SERVICE_ACCOUNT` (gõ đúng chữ hoa/thường và dấu gạch dưới)
   - **Secret**: mở file `.json` đã tải ở Bước 1.1 bằng Notepad (hoặc TextEdit trên Mac),
     bấm **chọn toàn bộ nội dung** (Ctrl+A / Cmd+A), copy, rồi **dán nguyên văn** vào ô
     Secret. Dán TOÀN BỘ nội dung file, kể cả dấu `{` và `}` ở đầu/cuối — không xóa,
     không sửa gì cả.
   - Bấm **Add secret**.
6. Bấm **New repository secret** lần nữa, thêm secret thứ hai:
   - **Name**: `FIREBASE_PROJECT_ID`
   - **Secret**: dán đúng **Project ID** đã ghi lại ở Bước 1.1 (ví dụ `barkinglong-menu-a1b2c`)
   - Bấm **Add secret**.

Sau bước này, trong danh sách secrets phải thấy đúng 2 dòng: `FIREBASE_SERVICE_ACCOUNT`
và `FIREBASE_PROJECT_ID`. GitHub sẽ **luôn ẩn giá trị thật** của secret (kể cả với chính
bạn) — nếu dán sai, cách duy nhất là bấm **Update** và dán lại từ đầu.

### Bước 1.3 — Cấp quyền cho "chìa khóa" trên Google Cloud

File `.json` ở trên tự nó **chưa có quyền làm gì cả** — cần cấp quyền (IAM roles) cho
nó trên Google Cloud Console. Đây là bước hay bị bỏ sót nhất.

1. Mở https://console.cloud.google.com/iam-admin/iam và chọn đúng project (góc trên,
   cùng project ID đã ghi ở Bước 1.1).
2. Tìm dòng có email dạng
   `firebase-adminsdk-xxxxx@ten-du-an.iam.gserviceaccount.com` (đây chính là "chủ nhân"
   của file `.json` bạn vừa tải — email này cũng nằm trong file `.json` ở field
   `client_email` nếu cần đối chiếu).
3. Bấm biểu tượng bút chì ✏️ ở cuối dòng đó → **Add another role** → thêm lần lượt
   **3 vai trò** sau (gõ tên vào ô tìm kiếm, không cần nhớ mã `roles/...`):
   - **Firebase Hosting Admin** — để deploy được trang web (Hosting)
   - **Firebase Rules Admin** — để deploy được `firestore.rules`
   - **API Keys Viewer** — Firebase CLI cần quyền này để chạy lệnh deploy, kể cả khi
     chỉ deploy Hosting + rules
4. Bấm **Save**.

> **Vì sao không cấp quyền "Owner" cho tiện?** Vai trò Owner cho phép xóa toàn bộ dự án,
> đổi thanh toán, xóa dữ liệu khách hàng... — nếu file `.json` này lỡ bị lộ, thiệt hại sẽ
> rất lớn. Ba vai trò ở trên chỉ đủ để deploy Hosting + rules, không hơn — đúng nguyên
> tắc "cấp quyền tối thiểu cần thiết".

Xong 3 bước trên là xong phần thiết lập — **không cần lặp lại** trừ khi đổi dự án
Firebase hoặc "chìa khóa" bị lộ (xem mục 4).

---

## 2. Điền cấu hình Firebase vào code (nếu chưa làm ở DEPLOY.md)

Workflow sẽ **từ chối deploy** nếu 2 file sau vẫn còn giá trị mẫu:

- `public/assets/js/firebase-config.js` — 6 giá trị `apiKey`, `authDomain`,
  `projectId`, `storageBucket`, `messagingSenderId`, `appId`. Hướng dẫn lấy các giá trị
  này nằm ngay trong comment đầu file đó, và trong `DEPLOY.md`.
- `.firebaserc` — giá trị `default` phải là Project ID thật (giống Project ID đã dùng
  ở Bước 1.1 và Bước 1.2), không còn chữ `PASTE_YOUR_FIREBASE_PROJECT_ID`.

Nếu bạn đã làm theo `DEPLOY.md` và deploy tay thành công ít nhất một lần rồi, hai file
này chắc chắn đã điền đúng — bỏ qua mục này.

---

## 3. Cách chạy deploy

Deploy chạy **tự động**, không cần bấm gì, mỗi khi:

- Có commit mới được đưa lên nhánh `main` (cách thông thường nhất — kể cả khi bạn sửa
  trực tiếp một file ngay trên giao diện web GitHub và bấm "Commit changes").
- Có commit mới trên nhánh làm việc `claude/digital-menu-hanabi-toro-2xozaq`.

**Chạy tay khi cần** (ví dụ muốn deploy lại mà không sửa gì):

1. Vào repo trên GitHub → tab **Actions**.
2. Ở cột bên trái, chọn workflow **Deploy to Firebase**.
3. Bấm nút **Run workflow** (góc phải) → chọn nhánh → bấm nút xanh **Run workflow**.

### Theo dõi tiến trình

1. Tab **Actions** → sẽ thấy một dòng chạy có biểu tượng:
   - 🟡 chấm tròn vàng đang xoay = đang chạy
   - ✅ dấu tích xanh = deploy **thành công**, trang web đã cập nhật
   - ❌ dấu X đỏ = deploy **thất bại**, trang web CHƯA thay đổi gì (deploy lỗi thì
     Firebase Hosting vẫn giữ nguyên bản cũ đang chạy — khách không thấy gì bất thường)
2. Bấm vào dòng đó để xem chi tiết. Bấm tiếp vào job **Deploy Hosting + Firestore
   rules** để xem từng bước.
3. Bước nào có dấu ❌ thì bấm mở rộng bước đó — dòng chữ đỏ bắt đầu bằng nội dung dễ đọc
   sẽ giải thích chính xác vấn đề là gì và cách sửa (xem thêm bảng tra ở mục 5).

---

## 4. CẢNH BÁO BẢO MẬT — file `.json` service account

- File `firebase-config.js` (chứa `apiKey` công khai) **AN TOÀN khi lộ ra** — Firebase
  thiết kế để nó công khai trong code, an toàn thật sự nằm ở `firestore.rules`.
- File `.json` ở Bước 1.1 (service account key) thì **ngược lại — là bí mật thật sự**,
  giống như mật khẩu. Bất kỳ ai có file này đều deploy được lên trang web thay bạn.
  - **KHÔNG** commit file này vào Git (kể cả bằng cách kéo-thả vào GitHub).
  - **KHÔNG** dán vào email, Zalo, Messenger, hay bất kỳ cửa sổ chat nào (kể cả chat
    với Claude/ChatGPT) — chỉ dán đúng một lần vào ô **Secret** ở Bước 1.2.
  - Sau khi đã dán vào GitHub Secret thành công, **nên xóa file `.json` khỏi máy tính
    / thùng rác / email tải xuống** — GitHub đã lưu an toàn rồi, không cần giữ thêm bản
    nào khác.

**Nếu nghi ngờ file `.json` này đã bị lộ** (gửi nhầm, máy tính bị virus...), thu hồi
ngay:

1. Mở https://console.cloud.google.com/iam-admin/serviceaccounts và chọn đúng project.
2. Tìm tài khoản dịch vụ `firebase-adminsdk-xxxxx@...` (client_email trong file json).
3. Bấm vào tài khoản đó → tab **Keys** (Khóa) → tìm đúng khóa đang dùng (theo Key ID
   hoặc ngày tạo) → bấm **Delete** (Xóa). Chìa khóa cũ lập tức mất tác dụng.
4. Quay lại Bước 1.1 để tạo khóa mới, rồi Bước 1.2 để **cập nhật lại** secret
   `FIREBASE_SERVICE_ACCOUNT` trên GitHub (bấm **Update** trên secret cũ, dán nội dung
   file `.json` mới vào).

---

## 5. Khắc phục sự cố

| Thông báo lỗi (rút gọn) trong log Actions | Nguyên nhân | Cách sửa |
|---|---|---|
| `CHƯA CẤU HÌNH FIREBASE: file public/assets/js/firebase-config.js vẫn còn ít nhất một giá trị mẫu 'PASTE_...'` | Chưa điền (hoặc điền thiếu) 6 giá trị Firebase Web App vào `firebase-config.js` | Mở file đó, dán đủ 6 giá trị theo hướng dẫn trong comment đầu file, hoặc theo `DEPLOY.md`. Commit lại. |
| `CHƯA CẤU HÌNH FIREBASE: file .firebaserc vẫn còn giá trị mẫu 'PASTE_YOUR_FIREBASE_PROJECT_ID'` | Chưa điền Project ID thật vào `.firebaserc` | Mở `.firebaserc`, thay `PASTE_YOUR_FIREBASE_PROJECT_ID` bằng Project ID thật (Project settings → General). Commit lại. |
| `Thiếu secret FIREBASE_SERVICE_ACCOUNT` | Chưa tạo secret này trên GitHub, hoặc gõ sai tên (phân biệt hoa/thường) | Làm lại Bước 1.2, kiểm tra tên secret gõ đúng y hệt `FIREBASE_SERVICE_ACCOUNT`. |
| `Secret FIREBASE_SERVICE_ACCOUNT không phải JSON hợp lệ` | Khi dán vào ô Secret, nội dung bị cắt bớt, dán thiếu dấu `{`/`}`, hoặc lỡ dán nhầm nội dung khác (không phải file `.json`) | Mở lại file `.json` gốc, chọn toàn bộ (Ctrl+A) và copy lại từ đầu, dán đè vào secret (bấm **Update** trên secret cũ). |
| `Không xác định được Firebase Project ID` | Thiếu secret `FIREBASE_PROJECT_ID` **và** file `.json` trong `FIREBASE_SERVICE_ACCOUNT` cũng không đọc được `project_id` | Thêm secret `FIREBASE_PROJECT_ID` theo Bước 1.2 (cách chắc ăn nhất), hoặc dán lại đúng file `.json` gốc chưa chỉnh sửa. |
| Bước "Deploy Hosting + Firestore rules" báo lỗi có chữ `403`, `PERMISSION_DENIED`, hoặc `caller does not have permission` | "Chìa khóa" (service account) chưa được cấp đủ quyền trên Google Cloud | Làm lại Bước 1.3 — kiểm tra đã thêm đủ 3 vai trò: **Firebase Hosting Admin**, **Firebase Rules Admin**, **API Keys Viewer**, đúng project. |
| Lỗi có chữ `invalid_grant`, `invalid JWT`, hoặc `Getting metadata from plugin failed` | Khóa `.json` đã bị **thu hồi** (revoke) hoặc **hết hạn** — thường do đã làm lại Bước 4 (thu hồi khóa cũ) nhưng quên cập nhật secret mới | Tạo khóa mới (Bước 1.1) và cập nhật lại secret `FIREBASE_SERVICE_ACCOUNT` (Bước 1.2). |
| Lỗi có chữ `Failed to get Firebase project` hoặc `404` kèm tên project | `FIREBASE_PROJECT_ID` bị gõ sai chính tả, hoặc dự án Firebase đó không tồn tại/đã bị xoá | Vào Firebase Console → Project settings → General, copy chính xác **Project ID** (không phải Project name), cập nhật lại secret. |
| Chạy thành công (✅) nhưng trang web vẫn hiển thị dữ liệu mẫu / không có ảnh món thật | Trình duyệt hoặc màn hình signage đang cache bản cũ | Đợi khoảng 1 phút rồi tải lại trang (Ctrl+F5). Nếu vẫn còn, kiểm tra lại `firebase-config.js` có trỏ đúng **project đang xem trên Firebase Console** không — đổi nhầm project là lỗi rất dễ gặp. |

Nếu gặp lỗi không có trong bảng trên: mở rộng đúng bước bị dấu ❌ trong tab Actions, đọc
kỹ vài dòng cuối cùng (thường là dòng giải thích rõ nhất), rồi tra theo từ khóa đó.

---

## 6. Vì sao workflow deploy cả Hosting lẫn Firestore rules

Rất nhiều hướng dẫn GitHub Actions cho Firebase trên mạng chỉ deploy **Hosting**
(dùng action có sẵn của Firebase). Repo này **cố ý không dùng cách đó** — vì `firestore.rules`
là nơi quyết định ai được ghi dữ liệu (mục 7, `docs/ARCHITECTURE.md`). Nếu chỉ deploy
Hosting mà quên deploy rules, hai kịch bản xấu có thể xảy ra:

- Sửa `firestore.rules` trong code nhưng rules thật trên Firebase không đổi → tưởng đã
  siết chặt bảo mật nhưng thực ra chưa.
- Rules trên Firebase bị lệch so với những gì `data-layer.js` mong đợi → trang quản trị
  báo lỗi **permission-denied** khi lưu, mà nhìn vào code lại thấy mọi thứ "đúng" — rất
  mất thời gian để phát hiện ra nguyên nhân thật là rules chưa deploy.

Vì vậy workflow này dùng thẳng `firebase-tools` (`firebase deploy --only hosting,firestore:rules`)
để **luôn deploy cả hai cùng lúc, trong cùng một lần chạy**.
