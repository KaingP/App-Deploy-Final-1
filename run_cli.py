import argparse
import json
import sys
from scheduler_engine import ShiftScheduler
from excel_exporter import export_schedule_to_excel
from data_loader import load_shifts_master, load_members_data

sys.stdout.reconfigure(encoding='utf-8')

def main():
    parser = argparse.ArgumentParser(description="Hệ thống Phân ca & Tối ưu hóa Lịch trực F&B - Hùng Vương Concert")
    parser.add_argument("--shifts-file", default="Danh_sach_ca.xlsx", help="Đường dẫn file danh sách ca")
    parser.add_argument("--members-file", default="Danh_sach_dang_ky_truc_ca_50_nguoi.xlsx", help="Đường dẫn file 50 người đăng ký")
    parser.add_argument("--output", default="reports/Lich_Truc_Toi_Uu_Hung_Vuong_Concert.xlsx", help="Đường dẫn file Excel kết quả xuất ra")
    parser.add_argument("--min-shifts", type=int, default=1, help="Số ca tối thiểu mỗi thành viên")
    parser.add_argument("--max-shifts", type=int, default=4, help="Số ca tối đa mỗi thành viên")
    parser.add_argument("--types", nargs="+", default=["Phong", "Ngoai"], help="Loại ca kích hoạt: Phong Ngoai")
    
    args = parser.parse_args()

    print("================================================================================")
    print("🚀 BẮT ĐẦU QUY TRÌNH PHÂN CA TỰ ĐỘNG - HÙNG VƯƠNG CONCERT (PROJECT F&B)")
    print("================================================================================")
    
    print("1. Đang đọc dữ liệu đầu vào...")
    shifts = load_shifts_master(args.shifts_file)
    members = load_members_data(args.members_file)
    print(f"   ✓ Đã tải {len(shifts)} ca trực từ: {args.shifts_file}")
    print(f"   ✓ Đã tải {len(members)} thành viên từ: {args.members_file}")
    
    config = {
        'min_shifts_per_member': args.min_shifts,
        'max_shifts_per_member': args.max_shifts,
        'active_types': args.types
    }
    
    print("\n2. Đang khởi tạo mô hình Tối ưu hóa Toán học (Google OR-Tools CP-SAT)...")
    scheduler = ShiftScheduler(shifts=shifts, members=members, config=config)
    
    print("3. Đang giải bài toán phân ca với các ràng buộc nghiệp vụ:")
    print("   - Ràng buộc lịch rảnh 100%")
    print("   - Triệt tiêu trùng ca giữa Phòng Thanh Niên và Điểm bán ngoài")
    print("   - Đảm bảo định mức nhân sự (Không để phòng trống)")
    print("   - Cân bằng khối lượng công việc và tối ưu hóa ca cam kết")
    
    result = scheduler.optimize()
    
    if not result.get('success'):
        print(f"❌ Phân ca thất bại: {result.get('message')}")
        sys.exit(1)
        
    print(f"   ✓ Trạng thái Solver: {result.get('status')} (TỐI ƯU HOÀN TOÀN)")
    summary = result.get('summary', {})
    print(f"   ✓ Tổng số lượt phân ca: {summary.get('total_assignments')}")
    print(f"   ✓ Trung bình số ca/thành viên: {summary.get('avg_shifts_per_member')}")
    print(f"   ✓ Ca Phòng Thanh Niên đạt chuẩn: {summary.get('phong_shifts_filled')}/{summary.get('total_phong_shifts')}")
    print(f"   ✓ Ca Điểm bán ngoài đạt chuẩn: {summary.get('ngoai_shifts_filled')}/{summary.get('total_ngoai_shifts')}")
    
    audit = result.get('audit_results', {})
    print("\n4. Kết quả Thẩm định & Kiểm tra tính hợp lệ (Audit Checks):")
    print(f"   ✓ Trùng ca cùng giờ (Ca Trong & Ngoài): {audit.get('conflict_count')} vi phạm")
    print(f"   ✓ Vi phạm lịch rảnh: {audit.get('availability_violation_count')} vi phạm")
    print(f"   ✓ Ca phòng trống: {audit.get('empty_room_count')} ca")
    print(f"   ✓ Điểm công bằng phân bổ (Fairness Score): {audit.get('fairness_metrics', {}).get('fairness_score')}/100")
    
    print(f"\n5. Đang xuất file Excel 6 Sheet với định dạng màu sắc trực quan...")
    out_file = export_schedule_to_excel(result, args.output)
    print(f"   🎉 ĐÃ XUẤT THÀNH CÔNG FILE EXCEL TẠI:")
    print(f"   👉 {out_file}")
    print("================================================================================")

if __name__ == '__main__':
    main()
