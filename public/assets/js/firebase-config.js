// =============================================================================
// firebase-config.js
// -----------------------------------------------------------------------------
// CHỈ chứa cấu hình Firebase. KHÔNG import Firebase SDK ở đây, KHÔNG thêm logic.
// data-layer.js sẽ đọc file này để quyết định chạy chế độ Firebase thật hay
// chế độ DEMO (localStorage).
//
// HƯỚNG DẪN LẤY THÔNG SỐ (dành cho người không rành kỹ thuật):
//   1. Vào https://console.firebase.google.com/ → chọn (hoặc tạo) dự án của bạn.
//   2. Bấm biểu tượng bánh răng (⚙️) cạnh "Project Overview" → "Project settings".
//   3. Cuộn xuống mục "Your apps". Nếu chưa có app web nào, bấm biểu tượng
//      "</>" (Web) để tạo mới, đặt tên tuỳ ý (vd "barkinglong-menu"), KHÔNG cần
//      tick "Firebase Hosting" trong bước này (ta sẽ deploy bằng firebase-tools).
//   4. Firebase sẽ hiện ra một đoạn code chứa object `firebaseConfig` — copy
//      từng giá trị (apiKey, authDomain, projectId, …) và dán đè vào các chuỗi
//      "PASTE_..." bên dưới. Giữ nguyên tên field, chỉ thay giá trị.
//   5. Lưu file lại. Chỉ cần làm MỘT LẦN cho toàn bộ hệ thống (4 màn hình +
//      trang admin đều dùng chung file này).
//
// LƯU Ý: apiKey của Firebase Web KHÔNG phải bí mật — nó được thiết kế để công
// khai trong mã nguồn client. An toàn thật sự nằm ở firestore.rules (ai được
// đọc/ghi), không nằm ở việc giấu apiKey. Xem thêm DEPLOY.md.
// =============================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyAD755HSZbJihMKIN0BlYTrsS-6eKncjRc",
  authDomain: "manhinh-olawa.firebaseapp.com",
  projectId: "manhinh-olawa",
  storageBucket: "manhinh-olawa.firebasestorage.app",
  messagingSenderId: "88947584570",
  appId: "1:88947584570:web:aa31285aa22b0b3e7ecf03",
};

// DEMO_MODE = true khi firebase-config.js CHƯA được điền (còn giá trị mẫu).
// Khi đó data-layer.js sẽ tự chuyển sang chạy bằng localStorage + seed-data.json,
// không cần tài khoản Firebase nào cả — dùng để xem thử / nghiệm thu trước khi
// bàn giao cho khách hàng.
export const DEMO_MODE = firebaseConfig.apiKey.includes("PASTE_");
