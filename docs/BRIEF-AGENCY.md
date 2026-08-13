# YÊU CẦU KỸ THUẬT — Hệ thống Menu Kỹ thuật số
### Hanabi & Toro Group · barkinglong.pl

---

## 0. Hiện trạng — đọc trước khi báo giá

**Một hệ thống chạy được đã tồn tại và đã được kiểm thử tự động trên trình duyệt.**
Đây không phải dự án làm từ số không. Vui lòng báo giá theo **phần việc còn thiếu ở mục 7**,
không báo giá xây lại từ đầu.

Đã có và đã chạy được:

- 4 trang hiển thị `omh1–4.html` + trang quản trị, không cần build, không phụ thuộc thư viện
- Firebase Firestore (gói miễn phí) — sửa dữ liệu, 4 màn cập nhật trong ~1 giây
- Phân trang không trùng lặp giữa 4 màn hình (đã kiểm chứng: 70 món, giao của 4 tập = rỗng)
- 4 màn lật trang **cùng nhịp** kể cả khi khởi động lệch giờ nhau
- 6 giao diện theo mùa, tùy biến màu nền / màu chữ / màu viền chữ / màu giá / font
- Đã thích ứng phần cứng 4K: cỡ chữ độc lập độ phân giải, canvas giới hạn, tự phục hồi 24/7

---

## 1. Mục tiêu

Menu kỹ thuật số chạy trên trình duyệt, hiển thị trên 4 màn hình 4K.
**Tách rời giao diện và dữ liệu** — đổi giá chỉ sửa dữ liệu, không xuất lại video, không sửa code.

## 2. Phần cứng đích (ràng buộc bắt buộc)

| Hạng mục | Thông số |
|---|---|
| Màn hình | IIYAMA 49.5" LH5060UHS-B1AG × 4 |
| Độ phân giải | 4K UHD 3840 × 2160 |
| Máy phát | **SoC Android tích hợp trong màn hình** (không có PC rời) |
| Phần mềm | iiSignage, chế độ URL |
| Kết nối | Wifi tích hợp |
| Vận hành | 24/7, không người trực |

> **Lưu ý quan trọng cho agency:** đây **không phải trình duyệt máy tính**. SoC tích hợp
> thuộc lớp Cortex-A55, GPU yếu, WebView thường cũ hơn Chrome desktop vài phiên bản.
> Mọi giải pháp phải được kiểm thử trên đúng thiết bị này, không chỉ trên máy tính.

## 3. Công nghệ

- HTML5 / CSS3 / JavaScript thuần, ES module, **không cần bước build**
- Dữ liệu: Firebase Firestore (gói Spark miễn phí)
- Hosting: Firebase Hosting, tên miền `barkinglong.pl`
- **GSAP: tùy chọn, không bắt buộc.** Nếu dùng thì phải **tự host** (không gọi CDN ngoài,
  màn hình có thể mất mạng). Hiện hiệu ứng đang chạy bằng CSS `transform`/`opacity` thuần
  — nhẹ hơn GSAP trên SoC yếu và đã đạt yêu cầu. Chỉ đưa GSAP vào nếu chứng minh được
  hiệu ứng phức tạp hơn mà CSS không làm được.

## 4. Bố cục và trình chiếu

- Lưới **2 hàng × 3 cột**, 4–6 món mỗi trang (cấu hình được)
- Mỗi trang hiển thị **10–15 giây**, cấu hình được trong trang quản trị
- Tự động chuyển trang, vòng lặp vô hạn
- **Nội dung chia riêng giữa 4 màn, tuyệt đối không trùng món** (MH1 = trang 1–3,
  MH2 = trang 4–6, …). Thứ tự hiển thị điều khiển được từ trang quản trị.
- 4 màn hình phải lật trang **đồng thời**. Không dùng bộ đếm riêng từng máy — sau vài giờ
  sẽ lệch. Phải tính theo đồng hồ tuyệt đối có hiệu chỉnh lệch giờ từ server.

## 5. Hiệu ứng

**Được dùng:** fade, slide, parallax nhẹ, Ken Burns (phóng chậm ảnh món), thẻ xuất hiện
lệch pha nhau.
**Không dùng:** xoay, nhấp nháy, hiệu ứng giật cục hoặc gây rối mắt.
Mục tiêu: kích thích vị giác, giữ ánh nhìn — không làm khách chóng mặt.

## 6. Hiệu năng

- Chuyển cảnh **60 FPS**, chỉ animate `transform` và `opacity` (chạy trên GPU)
- **Preload ảnh của trang kế tiếp trước khi chuyển cảnh** — không được để lóe ảnh trắng
- Tối ưu bộ nhớ cho vận hành liên tục nhiều tuần: không rò rỉ listener, không phình DOM
- Tự phục hồi: tự tải lại mỗi ngày lúc vắng khách, watchdog khi treo, đồng bộ lại đồng hồ

> **Ngoại lệ đã chốt:** lớp hiệu ứng hạt nền (tuyết, pháo hoa…) chạy **30 FPS** và vẽ ở
> khung nền tối đa 1920×1080 rồi phóng to. Vẽ hạt ở 3840×2160 @60fps liên tục 24/7 sẽ làm
> SoC nóng và giật. Nội dung menu vẫn chuyển cảnh ở 60 FPS. Đây là đánh đổi có chủ đích,
> **không phải lỗi cần "sửa"**.

## 7. PHẦN VIỆC CẦN AGENCY LÀM

### 7.1 Ảnh món ăn — hạng mục lớn nhất

Hiện hệ thống nén ảnh xuống **900px chiều ngang** để lách giới hạn miễn phí của Firestore.
**Mức này không đủ cho màn 4K** — mỗi thẻ món rộng khoảng 1200px vật lý, ảnh 900px sẽ mềm nhòe.

Cần agency:

- **Chụp/chuẩn bị ảnh món độ phân giải cao**, tối thiểu **1600px chiều ngang**, màu chuẩn,
  nền nhất quán, cùng tông ánh sáng
- Xuất **WebP + JPEG dự phòng**, có phiên bản 1x/2x (`srcset`) cho Retina/4K
- **Đề xuất nơi lưu ảnh.** Firebase Storage đã không còn miễn phí (bắt buộc thẻ tín dụng
  từ 10/2024). Hai hướng khả thi giữ chi phí bằng 0:
  - **Khuyến nghị:** ảnh chất lượng cao đóng gói cùng website, phát qua Firebase Hosting
    (miễn phí 10GB lưu trữ, 360MB/ngày băng thông — thừa cho 4 màn nhờ cache trình duyệt)
  - Ảnh chủ quán tự tải lên trong trang quản trị: giữ cơ chế nén hiện tại cho tiện, chấp
    nhận chất lượng thấp hơn
  - Agency cần chốt và triển khai một quy trình rõ ràng cho cả hai luồng

### 7.2 Preload ảnh
Nạp sẵn ảnh trang kế tiếp (kể cả `img.decode()`) trước khi kích hoạt chuyển cảnh. **Chưa có.**

### 7.3 Thiết kế
Phong cách **hiện đại, tối giản, nhiều khoảng trắng, hình ảnh lớn, màu nổi bật nhưng tinh tế** —
tham chiếu chuẩn mực trình bày của các chuỗi lớn (McDonald's, v.v.) nhưng **giữ bản sắc riêng
của Hanabi & Toro**, không sao chép nhận diện của họ. Font phải sắc nét ở 4K, đọc được từ 3–5 mét.

### 7.4 Kiểm thử trên thiết bị thật
Nghiệm thu **trên chính màn hình IIYAMA**, không chỉ trên máy tính. Cần đo: FPS khi chuyển
cảnh, mức RAM sau 72 giờ chạy liên tục, và ghi lại phiên bản WebView của máy.

## 8. Trang quản trị

Đã có, tiếng Việt, 5 tab: Tổng quan (trạng thái 4 màn) · Món ăn (thêm/sửa/xóa/ẩn/hiện, kéo thả
đổi thứ tự, đổi ảnh) · Bố cục · Giao diện · Xem trước. Sửa giá, thêm món, đổi ảnh, bật tắt món
**không cần đụng tới code**. Dùng được trên điện thoại.

## 9. Mở rộng về sau (không nằm trong giai đoạn này)

Kiến trúc phải để ngỏ cho: video nền · đa ngôn ngữ (hiện dữ liệu đã tách theo hậu tố `_pl`,
thêm ngôn ngữ là thêm trường) · mở rộng quá 4 màn hình · **đồng bộ giá từ hệ thống POS**.

## 10. Bàn giao

Mã nguồn đầy đủ · tài liệu kiến trúc · hướng dẫn triển khai tiếng Việt · bộ ảnh gốc chưa nén ·
biên bản nghiệm thu trên thiết bị thật.
