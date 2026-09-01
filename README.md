# 📅 F&B Shift Scheduler - Hệ Thống Xếp Lịch & Điều Phối Nhân Sự F&B Thông Minh (Version 2)

**F&B Shift Scheduler** là giải pháp quản lý lịch làm việc, điểm danh thời gian thực và xử lý sự cố nhân sự khẩn cấp dành riêng cho các mô hình vận hành nhà hàng, quán cà phê và dịch vụ F&B. Hệ thống kết hợp thuật toán xếp ca tự động tối ưu (Heuristics) cùng bộ công cụ xử lý ca vắng đột xuất và tích hợp cổng bán hàng POS giả lập giúp tối ưu hiệu suất nhân sự vượt trội.

---

## ✨ Các Tính Năng Cốt Lõi

### 1. ⚙️ Xếp Lịch Tự Động Thông Minh (Auto-Scheduler)
* **Tự động hóa hoàn toàn**: Phân bổ ca trực tự động chỉ với 1-click dựa trên các điều kiện ràng buộc nâng cao (Lịch rảnh của nhân sự, số lượng ca tối đa mỗi tuần, vai trò tối thiểu trong ca).
* **Quản lý cấu hình linh hoạt**: Định cấu hình thời gian ca, phân chia rõ ràng giữa nhóm **Nhân sự chính (Core)** và **Nhân sự dự phòng (Standby)**, chỉ định Leader cho từng ca trực.
* **Audit & Phát hiện xung đột**: Tự động rà soát lịch để cảnh báo tức thì các vi phạm (Trùng lịch, vượt quá ca làm quy định, thiếu Leader ca).

### 2. 🚨 Quản Lý Ca Vắng & Phương Án Dự Phòng Khẩn Cấp (Contingency & Live Attendance)
* **Điểm danh Real-time**: Điểm danh nhanh trạng thái chuyên cần trực tiếp ngay tại ca đang diễn ra (Có mặt, Đi trễ, Vắng đột xuất).
* **Nhóm Standby thông minh**: Phân tách rõ rệt nhân sự dự phòng, tự động ẩn điểm danh chuẩn và chỉ kích hoạt khi nhấn báo ⚠️ *Có bất thường*.
* **Đề xuất Backup tự động**: Khi có nhân sự vắng, thuật toán tự động lọc và đề xuất danh sách người thay thế tốt nhất từ Đội ứng biến và những người rảnh lịch theo thời gian thực (sắp xếp theo điểm ưu tiên và độ tương thích).
* **Lưu trữ & Xác nhận tập trung**: Cơ chế lưu nháp trạng thái điểm danh và xác nhận hàng loạt qua nút bấm **"Lưu Điểm Danh & Gọi Backup"** cố định dưới góc màn hình nhằm tối ưu hóa trải nghiệm điều phối.

### 3. 🛍️ Giả Lập Bán Hàng & Đo Lường Doanh Thu (Live POS & Sales Analytics)
* **Đồng bộ hóa bán hàng**: Tích hợp module bán hàng POS trực tiếp liên kết với ca trực đang chạy. Ghi nhận hóa đơn dựa trên nhân sự đang trực tiếp bán hàng.
* **Đo lường hiệu suất**: Tính toán doanh thu thực tế đóng góp của từng nhân viên để phục vụ đánh giá xếp hạng KPIs cuối tháng.

### 4. 📊 Báo Cáo Chuyên Cần & Xuất Excel Chuyên Nghiệp (Compliance & Reports)
* **Thống kê chuyên sâu**: Ghi nhận chi tiết lịch sử sự cố (Đi muộn, vắng không phép, vắng khẩn cấp, người thay thế).
* **Xuất Excel nhanh chóng**: Xuất toàn bộ báo cáo phân tích ca vắng, phương án dự phòng và nhật ký sự cố ra file Excel (`.xlsx`) chuẩn hóa để phục vụ công tác tính lương HR.

---

## 🛠️ Công Nghệ Sử Dụng

* **Frontend**: HTML5, CSS3 (Tailwind CSS, FontAwesome Icons), Vanilla JavaScript (ES6+), thư viện vẽ biểu đồ Recharts/D3.
* **Backend**: Node.js, Express.js, TypeScript (`ts-node`).
* **Xuất báo cáo**: Thư viện `exceljs` để khởi tạo báo cáo định dạng bảng biểu Excel chất lượng cao.

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Yêu cầu hệ thống
* Đã cài đặt **Node.js** (Phiên bản v18 trở lên được khuyến nghị).
* Quản lý gói bằng **npm** (đi kèm sẵn trong Node.js).

### 2. Cài đặt các gói phụ thuộc
Mở terminal tại thư mục gốc của dự án và chạy lệnh sau để tải các thư viện cần thiết:
```bash
npm install
```

### 3. Khởi chạy ở chế độ phát triển (Development)
Sử dụng script có sẵn để chạy dev server trên cổng mặc định (máy chủ sẽ tự động lắng nghe thay đổi và tải lại):
```bash
npm run dev
```
Truy cập ứng dụng tại địa chỉ: `http://localhost:3000`

### 4. Biên dịch và Đóng gói (Production Build)
Để biên dịch dự án sang mã Javascript tối ưu phục vụ triển khai thực tế:
```bash
npm run build
npm start
```

---

## 📂 Sơ Đồ Cấu Trúc Thư Mục Chính

```text
├── src/
│   └── types/             # Định nghĩa cấu trúc kiểu dữ liệu TypeScript
├── templates/
│   └── index.html         # Giao diện ứng dụng chính (Single-page Dashboard)
├── static/
│   ├── css/               # Các tùy chỉnh giao diện và cấu hình Tailwind CSS
│   └── js/
│       └── app.js         # Toàn bộ logic tương tác phía Frontend, POS và Điểm danh
├── server.ts              # Máy chủ API chính điều khiển xếp lịch, chấm điểm Backup & POS
├── package.json           # Danh sách thư viện và cấu hình các script khởi chạy
└── README.md              # Tài liệu hướng dẫn sử dụng (File này)
```

---

## 📝 Quy Trình Điểm Danh & Điều Phối Đạt Chuẩn
1. Chọn ca đang hoạt động tại thanh chọn **Ca trực Live**.
2. Rà soát danh sách nhân sự chính. Nếu có người vắng, bấm **Vắng mặt** 🚨.
3. Dropdown đề xuất danh sách Đội ứng biến sẽ hiện ra, lựa chọn nhân sự thay thế tối ưu nhất.
4. Rà soát lại tất cả các nhân sự khác rồi bấm **"Lưu Điểm Danh & Gọi Backup"** để lưu trạng thái và kích hoạt điều phối.
5. Kiểm tra lịch sử sự cố được cập nhật tức thì tại tab **Báo cáo Ca Vắng & Backup** và tải file Excel báo cáo khi cần thiết.
