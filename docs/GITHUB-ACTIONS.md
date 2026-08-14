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

Workflow hỗ trợ **hai cách xác thực** để GitHub được phép deploy thay bạn — làm **một
trong hai**, không cần cả hai:

- **Cách 1 — service account** (mục "Bước 1.1" bên dưới): **khuyến nghị**, quyền giới
  hạn, tách biệt khỏi tài khoản Google cá nhân. Dùng cách này nếu bấm "Generate new
  private key" trên Firebase Console không báo lỗi.
- **Cách 2 — token cá nhân** (mục "Cách 2" bên dưới, dùng `firebase login:ci`): chỉ dùng
  khi Cách 1 không thực hiện được vì chính sách tổ chức chặn tạo service account key
  (`constraints/iam.disableServiceAccountKeyCreation`). Đây là phương án tạm, kém an
  toàn hơn — đọc kỹ cảnh báo trong mục đó trước khi dùng.

---

## 1. Thiết lập ban đầu (chỉ làm một lần)

### Bước 1.1 — Tạo "chìa khóa" cho GitHub (service account key)

> Đây là phương án **được khuyến nghị** — chìa khóa chỉ có đúng 3 quyền cần thiết (mục
> 1.3), không gắn với tài khoản Google cá nhân của ai, thu hồi được bất cứ lúc nào mà
> không ảnh hưởng gì khác. **Nếu dự án Firebase của bạn bật chính sách tổ chức
> `constraints/iam.disableServiceAccountKeyCreation`** (thường gặp ở tài khoản Google
> Workspace/doanh nghiệp), nút "Generate new private key" ở Bước 1.1.4 sẽ báo lỗi ngay
> lập tức và không tạo được file `.json` — trường hợp đó, **bỏ qua các bước 1.1–1.3**,
> chuyển thẳng xuống mục **"Cách 2 — xác thực bằng token cá nhân (`firebase login:ci`)"**
> ở cuối phần này.

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
6. (Tuỳ chọn — thường **không cần**) Bấm **New repository secret** lần nữa, thêm secret
   `FIREBASE_PROJECT_ID` nếu muốn. **Ở Cách 1, secret này không bắt buộc**: file `.json`
   đã tự chứa sẵn Project ID (field `project_id`), workflow tự đọc ra từ đó. Ngoài ra
   workflow còn tự đọc Project ID từ file `.firebaserc` của repo nếu cần (xem mục 2) —
   chỉ cần thêm secret này khi muốn ép deploy sang một project khác với project ghi
   trong `.firebaserc`, mà không sửa file đó.

Sau bước này, trong danh sách secrets chỉ cần thấy `FIREBASE_SERVICE_ACCOUNT` là đủ.
GitHub sẽ **luôn ẩn giá trị thật** của secret (kể cả với chính bạn) — nếu dán sai, cách
duy nhất là bấm **Update** và dán lại từ đầu.

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

### Cách 2 — xác thực bằng token cá nhân (`firebase login:ci`)

> **Chỉ dùng cách này nếu Bước 1.1 báo lỗi** vì chính sách tổ chức chặn tạo service
> account key (`constraints/iam.disableServiceAccountKeyCreation`). Đây là phương án
> **thay thế tạm thời khi chưa có lựa chọn tốt hơn**, không phải cách làm lý tưởng —
> đọc kỹ phần cảnh báo dưới đây trước khi dùng.

#### Vì sao cách này kém an toàn hơn Cách 1

- Cách 1 (service account) tạo ra một "danh tính" riêng, tách biệt hoàn toàn khỏi tài
  khoản Google cá nhân, chỉ mang đúng 3 quyền cần thiết (Bước 1.3).
- Cách 2 (token cá nhân) lấy được bằng cách **đăng nhập chính tài khoản Google của chủ
  quán**. Token tạo ra **mang đúng quyền của tài khoản đó trên toàn bộ dự án Firebase**
  — không giới hạn ở 3 quyền tối thiểu như Cách 1. Ai cầm được token này thì làm được
  mọi việc tài khoản Google đó làm được trên dự án, không chỉ deploy Hosting + rules.
- Token này **sống rất lâu** (không tự hết hạn theo giờ/ngày như phiên đăng nhập
  thường) — nó tồn tại cho tới khi bị thu hồi thủ công (xem cách thu hồi bên dưới).
- Lệnh `firebase login:ci` tạo ra token này thuộc diện **có thể bị Google/Firebase gỡ bỏ
  ở một phiên bản `firebase-tools` tương lai** — đây không phải API chính thức được cam
  kết hỗ trợ lâu dài, chỉ là công cụ CLI hiện đang tồn tại. Nếu sau này lệnh này biến
  mất, phần "token" của workflow sẽ ngừng hoạt động và cần chuyển hẳn sang Cách 1 (service
  account) hoặc Workload Identity Federation (WIF, một cách xác thực không cần lưu bí mật
  nào cả — kỹ thuật hơn, ngoài phạm vi tài liệu này).

**Tóm lại: dùng Cách 2 vì chính sách tổ chức hiện chặn Cách 1, không phải vì Cách 2 tốt
hơn.** Nếu sau này chính sách được nới ra (admin Google Cloud tắt
`constraints/iam.disableServiceAccountKeyCreation`), hãy quay lại Cách 1 và xoá secret
`FIREBASE_TOKEN` (xem cách thu hồi bên dưới) — workflow tự động ưu tiên
`FIREBASE_SERVICE_ACCOUNT` nếu cả hai secret cùng tồn tại, nên không cần gấp, nhưng vẫn
nên dọn token cũ để giảm rủi ro.

#### Bước A — Cài Firebase CLI và lấy token (làm trên máy Mac của chủ quán)

1. Mở ứng dụng **Terminal** (Spotlight — nhấn `Cmd + Space`, gõ "Terminal", Enter).
2. Nếu máy chưa có Node.js, cài trước theo hướng dẫn tại https://nodejs.org (bản LTS).
3. Gõ lệnh sau rồi nhấn Enter (không cần cài `firebase-tools` trước, `npx` tự tải bản
   dùng đúng ở workflow):
   ```
   npx firebase-tools@15.26.0 login:ci
   ```
4. Trình duyệt tự mở ra trang đăng nhập Google → chọn đúng tài khoản Google **đang có
   quyền chỉnh sửa dự án Firebase** của Hanabi & Toro → cho phép (Allow) khi được hỏi.
5. Quay lại Terminal — sau vài giây sẽ thấy một dòng dạng:
   ```
   ✔  Success! Use this token to login on a CI server:

   1//0abcdEFGhiJKLmnopQRSTUVwxyz1234567890ABCdefGHIjklMNOpqrSTUvwxYZ
   ```
   Chuỗi ký tự dài bắt đầu bằng `1//` đó **chính là token cá nhân** — nó đóng vai trò
   giống hệt "chìa khóa" `.json` ở Cách 1, chỉ khác là một dòng chữ thay vì một file.
   **Copy chuỗi đó** (bôi đen, `Cmd + C`) — Terminal chỉ hiện nó **đúng một lần**, không
   có cách nào xem lại. Nếu lỡ đóng cửa sổ Terminal trước khi copy, chạy lại lệnh ở bước
   3 để tạo token mới (token cũ vẫn còn hiệu lực song song, xem cách thu hồi bên dưới
   nếu muốn dọn bớt).

#### Bước B — Thêm token vào GitHub

1. Mở repo trên GitHub → tab **Settings** → **Secrets and variables** → **Actions** →
   tab **Secrets** → **New repository secret** (giống Bước 1.2 ở Cách 1).
2. Điền:
   - **Name**: `FIREBASE_TOKEN` (gõ đúng chữ hoa/thường và dấu gạch dưới)
   - **Secret**: dán nguyên văn chuỗi token bắt đầu bằng `1//` đã copy ở Bước A.5
   - Bấm **Add secret**.
3. (Tuỳ chọn — thường **không cần**) Thêm tiếp secret `FIREBASE_PROJECT_ID` nếu muốn:
   - **Name**: `FIREBASE_PROJECT_ID`
   - **Secret**: Project ID thật của dự án (Firebase Console → ⚙️ **Project settings** →
     tab **General** → dòng **Project ID**, ví dụ `barkinglong-menu-a1b2c` — **không**
     phải "Project name")
   - Bấm **Add secret**.

   Token cá nhân (khác file `.json` ở Cách 1) **không tự chứa** Project ID, nhưng
   workflow vẫn tự đọc được Project ID từ file `.firebaserc` ngay trong repo (mục 2) —
   miễn là file đó đã điền Project ID thật, không còn `PASTE_YOUR_FIREBASE_PROJECT_ID`.
   Chỉ cần tạo thêm secret `FIREBASE_PROJECT_ID` khi muốn ép deploy sang một project
   khác với project ghi trong `.firebaserc`.
4. Sau bước này, danh sách secrets chỉ cần có `FIREBASE_TOKEN` là đủ (và **không cần**
   `FIREBASE_SERVICE_ACCOUNT` — workflow tự nhận ra chỉ có token và dùng nó). Từ lần push
   tiếp theo, deploy chạy bình thường như Cách 1, chỉ khác là log Actions sẽ hiện một
   dòng cảnh báo (màu vàng) nhắc rằng đang deploy bằng token cá nhân — dòng này **vô
   hại**, chỉ là lời nhắc, không phải lỗi.

#### Cách thu hồi (revoke) token — làm ngay nếu nghi ngờ bị lộ, hoặc khi chuyển sang Cách 1

Không giống service account key (xoá trong Google Cloud Console), token cá nhân thu hồi
bằng chính lệnh `firebase logout`:

1. Mở Terminal trên máy đã tạo token (hoặc bất kỳ máy nào có cài `firebase-tools`).
2. Gõ:
   ```
   npx firebase-tools@15.26.0 logout --token "1//0abcdEFGhiJKLmnop..."
   ```
   (thay bằng đúng chuỗi token muốn thu hồi — dán nguyên chuỗi đã lưu trong GitHub
   Secret, hoặc mở lại secret cũ trên GitHub nếu còn nhớ — **nhưng lưu ý GitHub không
   bao giờ hiện lại giá trị secret đã lưu**, nên nếu không còn lưu token ở đâu khác, xem
   cách 2 bên dưới).
3. **Cách chắc chắn hơn** (không cần nhớ đúng chuỗi token): thu hồi quyền truy cập ở cấp
   tài khoản Google, áp dụng cho **mọi** token/phiên đã cấp cho Firebase CLI cùng lúc:
   - Mở https://myaccount.google.com/permissions (hoặc **myaccount.google.com** →
     **Bảo mật** → **Ứng dụng của bên thứ ba có quyền truy cập vào tài khoản của bạn**).
   - Tìm mục **Firebase CLI** (hoặc "Google Cloud SDK" / "Firebase CLI" tuỳ tên Google
     hiển thị) → bấm vào → **Xoá quyền truy cập** (Remove Access).
   - Toàn bộ token `login:ci` đã cấp trước đó cho Firebase CLI từ tài khoản này **mất
     hiệu lực ngay lập tức** — kể cả nếu bạn không nhớ chuỗi token cụ thể.
4. Nếu vẫn cần tiếp tục deploy bằng token sau khi thu hồi: lặp lại Bước A để tạo token
   mới, rồi Bước B để **cập nhật lại** secret `FIREBASE_TOKEN` trên GitHub (bấm
   **Update** trên secret cũ).
5. Nếu thu hồi vì đã chuyển hẳn sang Cách 1 (service account đã tạo được, ví dụ do
   chính sách tổ chức được nới ra): sau khi thu hồi token, **xoá luôn** secret
   `FIREBASE_TOKEN` trên GitHub (không bắt buộc — workflow vẫn ưu tiên
   `FIREBASE_SERVICE_ACCOUNT` nếu có — nhưng xoá bớt bí mật không còn dùng luôn là thực
   hành tốt).

> **Đừng dán token vào bất cứ đâu ngoài ô Secret ở Bước B** — không email, không Zalo,
> không Messenger, không dán vào cửa sổ chat với Claude/ChatGPT (giống cảnh báo về file
> `.json` ở mục 4 bên dưới, token này còn nhạy cảm hơn vì mang quyền tài khoản cá nhân).

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

> **`.firebaserc` giờ còn đóng thêm một vai trò nữa: là nguồn Project ID cho bước
> deploy.** Workflow xác định Project ID theo thứ tự ưu tiên: (1) secret
> `FIREBASE_PROJECT_ID` nếu có đặt, (2) field `project_id` bên trong secret
> `FIREBASE_SERVICE_ACCOUNT` (chỉ khi dùng Cách 1), (3) giá trị `projects.default` đọc
> thẳng từ `.firebaserc`. Vì vậy secret `FIREBASE_PROJECT_ID` **không còn bắt buộc** ở
> cả hai cách xác thực nữa — chỉ cần `.firebaserc` đã điền Project ID thật (đúng việc
> cần làm ở mục này) là đủ để bước xác định Project ID thành công, kể cả khi dùng
> `FIREBASE_TOKEN`.

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

> Nếu bạn đang dùng **Cách 2 (token `firebase login:ci`)** thay vì file `.json` ở đây,
> mục cảnh báo bảo mật và cách thu hồi dành riêng cho token nằm trong phần "Cách thu hồi
> (revoke) token" ở mục 1 bên trên — token nhạy cảm hơn file `.json` vì mang quyền tài
> khoản Google cá nhân, không chỉ 3 quyền giới hạn.

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
| `THIẾU THÔNG TIN XÁC THỰC FIREBASE` (không có secret nào) | Chưa tạo secret `FIREBASE_SERVICE_ACCOUNT` **và** cũng chưa tạo secret `FIREBASE_TOKEN` | Làm theo Cách 1 (Bước 1.1–1.2, khuyến nghị) hoặc Cách 2 (`firebase login:ci`) ở mục 1 — chỉ cần một trong hai. |
| `Thiếu secret FIREBASE_SERVICE_ACCOUNT` | Đang ở nhánh Cách 1 nhưng chưa tạo secret này trên GitHub, hoặc gõ sai tên (phân biệt hoa/thường) | Làm lại Bước 1.2, kiểm tra tên secret gõ đúng y hệt `FIREBASE_SERVICE_ACCOUNT`. Hoặc nếu chính sách tổ chức chặn tạo service account key, chuyển sang Cách 2. |
| `Secret FIREBASE_SERVICE_ACCOUNT không phải JSON hợp lệ` | Khi dán vào ô Secret, nội dung bị cắt bớt, dán thiếu dấu `{`/`}`, hoặc lỡ dán nhầm nội dung khác (không phải file `.json`) | Mở lại file `.json` gốc, chọn toàn bộ (Ctrl+A) và copy lại từ đầu, dán đè vào secret (bấm **Update** trên secret cũ). |
| `Không xác định được Firebase Project ID: đã thử lần lượt (1) secret 'FIREBASE_PROJECT_ID', (2) field 'project_id'..., (3) giá trị 'projects.default' trong .firebaserc...` | Cả 3 nguồn đều không có giá trị hợp lệ: không có secret `FIREBASE_PROJECT_ID`, không ở chế độ service account (hoặc JSON không đọc được `project_id`), **và** `.firebaserc` bị thiếu file / JSON hỏng / vẫn còn `PASTE_YOUR_FIREBASE_PROJECT_ID` | **Cách sửa nhanh nhất, không cần secret GitHub nào**: mở `.firebaserc`, đặt `projects.default` thành Project ID thật (Firebase Console → Project settings → General → Project ID), commit lại. (Cách khác: thêm secret `FIREBASE_PROJECT_ID`.) |
| Bước "Deploy Hosting + Firestore rules" báo lỗi có chữ `403`, `PERMISSION_DENIED`, hoặc `caller does not have permission` | Cách 1: "chìa khóa" (service account) chưa được cấp đủ quyền trên Google Cloud. Cách 2: tài khoản Google đã tạo token không có đủ quyền trên dự án Firebase | Cách 1: làm lại Bước 1.3 — kiểm tra đã thêm đủ 3 vai trò: **Firebase Hosting Admin**, **Firebase Rules Admin**, **API Keys Viewer**, đúng project. Cách 2: đăng nhập bằng đúng tài khoản Google có quyền chỉnh sửa dự án Firebase khi chạy lại `firebase login:ci`. |
| Lỗi có chữ `invalid_grant`, `invalid JWT`, hoặc `Getting metadata from plugin failed` | Cách 1: khóa `.json` đã bị **thu hồi** (revoke) hoặc **hết hạn** — thường do đã làm lại mục 4 (thu hồi khóa cũ) nhưng quên cập nhật secret mới | Tạo khóa mới (Bước 1.1) và cập nhật lại secret `FIREBASE_SERVICE_ACCOUNT` (Bước 1.2). |
| Lỗi có chữ `Authentication Error`, `invalid_grant`, hoặc `Command requires authentication` ở nhánh dùng `FIREBASE_TOKEN` | Cách 2: token đã bị **thu hồi** (xem "Cách thu hồi token" ở mục 1), hết hiệu lực, hoặc mật khẩu/quyền tài khoản Google gốc đã đổi | Chạy lại `firebase login:ci` (Bước A của Cách 2) để lấy token mới, cập nhật lại secret `FIREBASE_TOKEN` (Bước B). |
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
