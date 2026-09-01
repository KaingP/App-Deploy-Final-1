export const TASK_2_DETAILS = {
  "muc_1": {
    "title": "1. Quy trình & Công cụ Thu thập Lịch rảnh",
    "steps": [
      {
        "name": "Bước 1: Thiết kế biểu mẫu khảo sát số hóa",
        "desc": "Sử dụng Google Form kết nối tự động với Google Sheets / Excel, chia khung giờ thành 5 slot cố định mỗi ngày (7h-9h, 9h-11h, 11h-13h, 13h-15h, 15h-18h) cho toàn bộ 7 ngày trong tuần."
      },
      {
        "name": "Bước 2: Phân loại đối tượng thành viên",
        "desc": "Thu thập thông tin định danh: Ban chuyên môn, Trường học/Nơi làm việc, Đối tượng (Học sinh THPT, Sinh viên, Người đi làm), Địa điểm sinh sống và Phương tiện di chuyển (xe máy, xe buýt, đưa đón)."
      },
      {
        "name": "Bước 3: Khảo sát cam kết & Đội ứng biến",
        "desc": "Yêu cầu thành viên điền ít nhất 1 khung giờ 'Cam kết chắc chắn có mặt' và đăng ký tự nguyện tham gia 'Đội ứng biến linh hoạt' (Standby Team) để trực ca thay thế khẩn cấp."
      },
      {
        "name": "Bước 4: Thời hạn chốt & Thẩm định dữ liệu",
        "desc": "Chốt lịch trước ngày bắt đầu tuần vận hành 72 giờ. Tự động hóa làm sạch và kiểm tra trùng lặp dữ liệu bằng Python script."
      }
    ]
  },
  "muc_2": {
    "title": "2. Lịch trực theo Tuần & Nguyên tắc Phân công",
    "principles": [
      "Tối ưu hóa toán học: Sử dụng thuật toán Google OR-Tools CP-SAT đảm bảo 100% ca trực không bị thiếu người.",
      "Không để phòng trống: Phòng Thanh Niên tại THPT Chuyên Hùng Vương phải luôn có ít nhất 3-5 nhân sự túc trực liên tục từ 7:00 đến 17:00.",
      "Công bằng & Cân bằng tải: Đảm bảo số ca trực trung bình giữa các thành viên đồng đều (khoảng 3-4 ca/tuần), không ai phải trực quá 2 ca trong cùng một ngày.",
      "Tôn trọng cam kết: Ưu tiên tối đa việc xếp đúng các khung giờ mà thành viên đã cam kết trong đơn đăng ký."
    ]
  },
  "muc_3": {
    "title": "3. Hệ thống Quản lý & Giám sát Nhân sự Trực phòng",
    "cases": [
      {
        "status": "Có mặt đúng giờ",
        "definition": "Thành viên có mặt trước giờ bắt đầu ca trực ít nhất 10 phút.",
        "protocol": "Điểm danh qua QR Code hoặc ký sổ trực tại bàn điều phối; nhận bàn giao quỹ tiền mặt, thiết bị và số lượng sản phẩm F&B từ ca trước.",
        "reward": "Ghi nhận 100% điểm rèn luyện & KPI chuyên cần."
      },
      {
        "status": "Đi trễ",
        "definition": "Có mặt sau giờ bắt đầu ca nhưng không quá 15 phút.",
        "protocol": "Trưởng ca nhắc nhở, lập biên bản ghi nhận lý do. Trễ >15 phút mà không báo trước coi như vắng không phép nửa ca. Phạt hỗ trợ quỹ F&B hoặc trực bù ca bổ sung.",
        "action": "Trưởng ca tạm thời điều phối nhân sự hiện có gánh tải trong 15 phút đầu."
      },
      {
        "status": "Xin nghỉ trước (Có phép)",
        "definition": "Báo trước cho Ban Nhân sự và Trưởng ca ít nhất 24 giờ do lịch học/thi hoặc việc cá nhân chính đáng.",
        "protocol": "Thành viên chủ động tìm người đổi ca (dựa trên bảng Lịch rảnh) hoặc nhờ Ban Nhân sự kích hoạt nhân sự rảnh trong pool; hoàn thành thủ tục xác nhận đổi ca trên app.",
        "action": "Cập nhật lại lịch trực chính thức trên hệ thống quản lý."
      },
      {
        "status": "Vắng đột xuất (Khẩn cấp)",
        "definition": "Nghỉ không báo trước hoặc báo gấp trong vòng dưới 2 giờ trước ca trực do sự cố bất khả kháng (tai nạn, ốm nặng).",
        "protocol": "Quy trình ứng biến nhanh 3 bước:",
        "steps": [
          "1. Trưởng ca tra cứu ngay 'Sheet Ca Vắng' trên hệ thống để lấy danh sách 'Đội ứng biến linh hoạt' rảnh trong khung giờ đó.",
          "2. Gọi điện thoại trực tiếp cho ứng viên ưu tiên số 1; nếu không bắt máy trong 3 phút, chuyển sang ứng viên số 2.",
          "3. Nhân sự ứng biến được cộng 150% điểm KPI và hưởng phụ cấp F&B đặc biệt."
        ]
      }
    ]
  },
  "muc_4": {
    "title": "4. Phân bổ Nhân sự Điểm bán ngoài & Chống Xung đột",
    "guidelines": [
      "Tách biệt độc lập: Mỗi ca trực điểm bán ngoài được cấp mã ca riêng biệt (CA036 - CA070), có danh sách nhân sự phụ trách riêng.",
      "Triệt tiêu xung đột: Thuật toán lập lịch áp dụng ràng buộc cứng tổng quát x(Trong) + x(Ngoài) <= 1 cho mỗi khung giờ của từng thành viên, loại bỏ hoàn toàn tình trạng 1 người bị xếp 2 nơi cùng lúc.",
      "Tiêu chí chọn nhân sự điểm bán ngoài: Ưu tiên thành viên có xe máy cá nhân, cư trú gần khu vực điểm bán, có kỹ năng giao tiếp và bán hàng linh hoạt.",
      "Kênh liên lạc trực tiếp: Mỗi điểm bán ngoài có 1 Trưởng điểm kết nối hotline liên tục với Phòng Thanh Niên để điều phối tiếp tế sản phẩm F&B."
    ]
  },
  "muc_5": {
    "title": "5. Bảng Dự trù Rủi ro Vận hành & Phương án Ứng phó",
    "risks": [
      {
        "id": "R01",
        "category": "Nhân sự",
        "risk_event": "Thiếu hụt nhân sự do many thành viên trùng lịch thi học kỳ hoặc ốm đột xuất",
        "probability": "Trung bình (35%)",
        "impact": "Cao (4/5)",
        "prevention": "Duy trì 'Đội ứng biến linh hoạt' chiếm ít nhất 20% tổng nhân sự (10-15 người); luôn có danh bạ dự phòng sẵn sàng gọi.",
        "mitigation": "Trưởng ca liên hệ đội ứng biến; nếu thiếu nghiêm trọng, thành viên ca trước kéo dài thêm 45 phút hỗ trợ có phụ cấp."
      },
      {
        "id": "R02",
        "category": "Chất lượng & Bảo quản",
        "risk_event": "Sự cố hư hỏng thực phẩm/nước uống F&B do nhiệt độ thời tiết hoặc bảo quản không đúng cách",
        "probability": "Thấp (15%)",
        "impact": "Nghiêm trọng (5/5)",
        "prevention": "Trang bị thùng giữ nhiệt chuyên dụng, đá gel và kiểm tra hạn sử dụng (FIFO) tại mỗi đầu ca giao nhận.",
        "mitigation": "Lập tức thu hồi lô hàng hỏng, niêm phong biên bản, chuyển sang phân phối dòng sản phẩm đồ khô/đóng gói đóng lon."
      },
      {
        "id": "R03",
        "category": "Hàng tồn & Tài chính",
        "risk_event": "Hàng tồn ứ đọng cuối ngày hoặc mất cân đối tiền lẻ thối cho khách hàng",
        "probability": "Cao (60%)",
        "impact": "Trung bình (3/5)",
        "prevention": "Mỗi ca chuẩn bị sẵn túi tiền lẻ 300.000 VNĐ (mệnh giá 5k, 10k, 20k) và mã QR ngân hàng thanh toán quét nhanh.",
        "mitigation": "Giờ chót áp dụng chương trình combo Flash Sale / Mua 2 tặng 1 để xả hết hàng thực phẩm tươi sống."
      },
      {
        "id": "R04",
        "category": "Thời tiết & Ngoại cảnh",
        "risk_event": "Mưa to hoặc thời tiết xấu ảnh hưởng đến điểm bán ngoài trời",
        "probability": "Trung bình (40%)",
        "impact": "Trung bình (3/5)",
        "prevention": "Chuẩn bị dù bạt che mưa, bọc nilon bảo quản hàng hóa và theo dõi dự báo thời tiết trước 12h.",
        "mitigation": "Rút toàn bộ nhân sự và sản phẩm về tập trung bán tại Phòng Thanh Niên trong nhà trường."
      },
      {
        "id": "R05",
        "category": "Xung đột lịch trình",
        "risk_event": "Thành viên học sinh bị phụ huynh gọi về đột xuất hoặc đổi thời khóa biểu học thêm",
        "probability": "Trung bình (30%)",
        "impact": "Thấp - Trung bình (2/5)",
        "prevention": "Tạo tính năng 'Đổi ca ngang hàng' trên hệ thống nội bộ để các thành viên tự thỏa thuận hoán đổi linh hoạt.",
        "mitigation": "Ban Nhân sự phê duyệt yêu cầu đổi ca trực tuyến trong vòng 15 phút."
      }
    ]
  }
};
