# Menu điện tử — Hanabi & Toro

Hệ thống biển báo kỹ thuật số cho 4 màn hình 50", chạy trên tên miền **barkinglong.pl**.
Nội dung hiển thị bằng **tiếng Ba Lan**, trang quản trị bằng **tiếng Việt**.

- **Chi phí vận hành: 0 đồng** — Firebase gói Spark miễn phí, không cần thẻ tín dụng.
- **Không cần build** — không npm, không webpack. Deploy là copy thư mục `public/`.

---

## Xem thử ngay (không cần Firebase)

```bash
cd public && python3 -m http.server 8080
```

Rồi mở:

| Địa chỉ | Nội dung |
|---|---|
| http://localhost:8080/omh1.html | Màn hình 1 |
| http://localhost:8080/omh2.html | Màn hình 2 |
| http://localhost:8080/omh3.html | Màn hình 3 |
| http://localhost:8080/omh4.html | Màn hình 4 |
| http://localhost:8080/admin/ | Trang quản trị |

Khi chưa cấu hình Firebase, hệ thống tự chạy **chế độ THỬ NGHIỆM**: dữ liệu lưu trong
trình duyệt, có sẵn 72 món mẫu. Sửa trong trang quản trị → 4 màn hình đổi ngay. Đây là
chế độ để nghiệm thu trước khi bàn giao.

> Phải chạy qua HTTP server như trên. Mở thẳng file bằng `file://` sẽ không chạy được
> vì trình duyệt chặn ES module.

## Đưa lên mạng

Xem **[DEPLOY.md](DEPLOY.md)** — hướng dẫn từng bước bằng tiếng Việt cho người không
biết lập trình: tạo dự án Firebase, tạo tài khoản admin, deploy, nối tên miền
barkinglong.pl, và trỏ 4 màn hình vào đúng địa chỉ.

---

## Cấu trúc

```
public/
  omh1..4.html            4 màn hình — mỗi file chỉ khác nhau đúng 1 con số
  admin/                  Trang quản trị (tiếng Việt)
  assets/js/
    pagination.js         Thuật toán chia trang — DÙNG CHUNG cho màn hình + quản trị
    display.js            Engine hiển thị: chia trang, xoay vòng, vẽ thẻ món
    data-layer.js         Lớp dữ liệu duy nhất (Firebase, hoặc localStorage khi thử nghiệm)
    themes.js             6 giao diện theo mùa
    effects.js            Hiệu ứng hạt trên canvas
    seed-data.js          72 món mẫu tiếng Ba Lan
docs/ARCHITECTURE.md      Hợp đồng kỹ thuật giữa các module — ĐỌC TRƯỚC KHI SỬA CODE
firestore.rules           Phân quyền: ai cũng đọc được, chỉ admin ghi được
```

## Hai điểm thiết kế cần biết trước khi sửa code

**1. Bốn màn hình lật trang cùng nhịp nhờ đồng hồ tuyệt đối.** Không màn nào đếm giờ
riêng — nếu đếm riêng thì sau vài giờ chúng lệch nhau. Mỗi màn tính:

```js
tick = floor((Date.now() + serverOffset) / (rotationSeconds * 1000))
```

Nhờ vậy một màn hình bị cúp điện, khởi động lại lúc nào cũng nhảy vào đúng nhịp với
3 màn còn lại. **Đừng thay bằng `setInterval`.**

**2. Thuật toán chia trang chỉ được viết ở một nơi:** `pagination.js`. Trang quản trị và
màn hình thật đều import từ đó. Trước kia mỗi bên tự cài một bản, hai bên tính ra kết quả
khác nhau, làm sơ đồ xem trước hiện sai so với màn hình thật. **Đừng chép lại thuật toán
này sang chỗ khác.**

## Ảnh món ăn

Firebase Storage đã **không còn miễn phí** (bắt buộc thẻ tín dụng từ 10/2024), nên hệ
thống không dùng Storage. Hai cách thêm ảnh, cả hai đều miễn phí:

- **Tải ảnh lên** trong trang quản trị — trình duyệt tự thu nhỏ về 900px và nén WebP
  (giới hạn 700KB/ảnh) rồi lưu thẳng vào Firestore.
- **Dán link ảnh** có sẵn trên mạng.

Nếu điền cả hai thì **link dán được ưu tiên**.

## Đã kiểm tra

Chạy thật bằng Chromium với bộ 72 món mẫu:

- 4 màn hình tải không lỗi, hiển thị đúng dấu tiếng Ba Lan
- Mỗi màn đúng 3 trang; **70 món chia cho 4 màn, không món nào trùng giữa 2 màn**
- Chuyển trang hoạt động; 2 màn mở cách nhau vài giây vẫn hiện cùng một trang
- Trang quản trị: đủ 5 tab, không lỗi console, sơ đồ chia trang khớp từng món với
  màn hình thật (kiểm ở cả chế độ tự động và thủ công)
