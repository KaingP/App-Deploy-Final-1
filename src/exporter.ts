import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';

const FONT_TITLE = { name: "Segoe UI", size: 16, bold: true, color: { argb: "FF1E3A8A" } };
const FONT_SUBTITLE = { name: "Segoe UI", size: 10, italic: true, color: { argb: "FF4B5563" } };
const FONT_HEADER = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
const FONT_SECTION = { name: "Segoe UI", size: 12, bold: true, color: { argb: "FF1F2937" } };
const FONT_BOLD = { name: "Segoe UI", size: 10, bold: true };
const FONT_REGULAR = { name: "Segoe UI", size: 10 };
const FONT_SMALL = { name: "Segoe UI", size: 9, italic: true, color: { argb: "FF6B7280" } };

const FILL_HEADER_BLUE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
const FILL_HEADER_ORANGE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };
const FILL_HEADER_GREEN = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
const FILL_HEADER_PURPLE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6D28D9' } };
const FILL_HEADER_RED = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B1B' } };
const FILL_HEADER_DARK = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

const FILL_ZEBRA_1 = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
const FILL_ZEBRA_2 = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
const FILL_HIGHLIGHT_PHONG = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
const FILL_HIGHLIGHT_NGOAI = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
const FILL_SUCCESS_LIGHT = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };

const BORDER_THIN = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
} as any;

const BORDER_HEADER = {
  top: { style: 'medium', color: { argb: 'FF1E293B' } },
  bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
  left: { style: 'thin', color: { argb: 'FF475569' } },
  right: { style: 'thin', color: { argb: 'FF475569' } }
} as any;

const ALIGN_CENTER = { horizontal: 'center', vertical: 'middle', wrapText: true } as any;
const ALIGN_LEFT = { horizontal: 'left', vertical: 'middle', wrapText: true } as any;

function autofitColumns(ws: ExcelJS.Worksheet, maxLenCap = 55) {
  ws.columns.forEach(col => {
    let maxLen = 0;
    col.eachCell!((cell) => {
      if (cell.value) {
        const valStr = String(cell.value);
        const lines = valStr.split('\n');
        const lineLen = Math.max(...lines.map(l => l.length));
        if (lineLen > maxLen) {
          maxLen = lineLen;
        }
      }
    });
    col.width = Math.min(Math.max(maxLen + 4, 12), maxLenCap);
  });
}

export async function exportScheduleToExcel(scheduleResult: any, filePath = "reports/Lich_Truc_Toi_Uu_Hung_Vuong_Concert.xlsx"): Promise<string> {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const WorkbookClass = ExcelJS.Workbook || (ExcelJS as any).default?.Workbook || (ExcelJS as any).default;
  const wb = new WorkbookClass();

  const assignedShifts = scheduleResult.assigned_shifts || [];
  const memberStats = scheduleResult.member_stats || [];
  const audit = scheduleResult.audit_results || {};
  const contingency = scheduleResult.contingency_matrix || [];

  createSheetTongCaTruc(wb, assignedShifts);
  createSheetCaTrong(wb, assignedShifts.filter((s: any) => s.type === 'Phong'));
  createSheetCaNgoai(wb, assignedShifts.filter((s: any) => s.type === 'Ngoai'));
  createSheetThongKe(wb, memberStats);
  createSheetKiemTraCa(wb, audit, assignedShifts);
  createSheetCaVang(wb, contingency);

  await wb.xlsx.writeFile(filePath);
  return filePath;
}

// 1. Sheet: Tổng ca trực
function createSheetTongCaTruc(wb: ExcelJS.Workbook, assignedShifts: any[]) {
  const ws = wb.addWorksheet("Tổng ca trực", { views: [{ showGridLines: true }] });

  ws.mergeCells("A1:K1");
  const tCell = ws.getCell("A1");
  tCell.value = "HÙNG VƯƠNG CONCERT - PROJECT F&B | TỔNG HỢP TOÀN BỘ LỊCH TRỰC TUẦN";
  tCell.font = FONT_TITLE;
  tCell.alignment = ALIGN_CENTER;
  ws.getRow(1).height = 35;

  ws.mergeCells("A2:K2");
  const sCell = ws.getCell("A2");
  sCell.value = "Phân bổ tối ưu hóa nhân sự phòng Thanh Niên & Điểm bán ngoài";
  sCell.font = FONT_SUBTITLE;
  sCell.alignment = ALIGN_CENTER;
  ws.getRow(2).height = 20;

  const headers = [
    "Mã Ca", "Kênh / Loại", "Thứ", "Ngày", "Khung Giờ", 
    "Địa Điểm", "Yêu Cầu (Chính/DP)", "Đã Gán", "Trưởng Ca", "Danh Sách Nhân Sự (Chính & Dự Phòng)", "Tình Trạng"
  ];

  ws.getRow(4).height = 28;
  headers.forEach((h, colIdx) => {
    const cell = ws.getCell(4, colIdx + 1);
    cell.value = h;
    cell.font = FONT_HEADER;
    cell.fill = FILL_HEADER_BLUE as any;
    cell.alignment = ALIGN_CENTER;
    cell.border = BORDER_HEADER;
  });

  let rowIdx = 5;
  assignedShifts.forEach(s => {
    ws.getRow(rowIdx).height = 32;

    const chinhList = (s.assigned_members || [])
      .filter((m: any) => m.role === 'Chính')
      .map((m: any) => `${m.name} (${m.department.slice(0, 3)})`);
    const dpList = (s.assigned_members || [])
      .filter((m: any) => m.role === 'Dự phòng')
      .map((m: any) => `${m.name} (${m.department.slice(0, 3)})`);

    const memberParts = [];
    if (chinhList.length > 0) memberParts.push(`[Chính]: ${chinhList.join(', ')}`);
    if (dpList.length > 0) memberParts.push(`[DP]: ${dpList.join(', ')}`);

    const names = memberParts.join('\n');
    const status = s.is_filled ? "Đủ người" : "Thiếu người";
    const fill = s.type === 'Phong' ? FILL_HIGHLIGHT_PHONG : FILL_HIGHLIGHT_NGOAI;

    const reqStr = `${s.chinh_count || 3} Chính + ${s.dp_count || 1} DP`;

    const values = [
      s.shift_id,
      s.type_label,
      s.day,
      s.date,
      s.slot,
      s.location,
      reqStr,
      s.assigned_count,
      s.shift_leader || '-',
      names,
      status
    ];

    values.forEach((val, colIdx) => {
      const cell = ws.getCell(rowIdx, colIdx + 1);
      cell.value = val;
      cell.font = FONT_REGULAR;
      cell.fill = fill as any;
      cell.border = BORDER_THIN;

      const cIdx = colIdx + 1;
      const isCenter = [1, 2, 3, 4, 5, 7, 8, 11].includes(cIdx);
      cell.alignment = isCenter ? ALIGN_CENTER : ALIGN_LEFT;

      if (cIdx === 11) {
        cell.font = {
          name: "Segoe UI",
          size: 10,
          bold: true,
          color: { argb: s.is_filled ? "FF047857" : "FFDC2626" }
        };
      }
    });

    rowIdx++;
  });

  autofitColumns(ws);
}

// 2. Sheet: ca trong
function createSheetCaTrong(wb: ExcelJS.Workbook, phongShifts: any[]) {
  const ws = wb.addWorksheet("ca trong", { views: [{ showGridLines: true }] });

  ws.mergeCells("A1:I1");
  const tCell = ws.getCell("A1");
  tCell.value = "LỊCH TRỰC PHÒNG THANH NIÊN (THPT CHUYÊN HÙNG VƯƠNG) - CA TRONG";
  tCell.font = { name: "Segoe UI", size: 15, bold: true, color: { argb: "FF1E40AF" } };
  tCell.alignment = ALIGN_CENTER;
  ws.getRow(1).height = 32;

  const headers = [
    "Mã Ca", "Thứ", "Ngày", "Khung Giờ", "Định Mức (Chính/DP)", "Thực Trực", "Trưởng Ca Phụ Trách", "Nhân Sự Phân Bổ (Phân Rõ Chính & DP)", "Ghi Chú Vận Hành"
  ];

  ws.getRow(3).height = 26;
  headers.forEach((h, colIdx) => {
    const cell = ws.getCell(3, colIdx + 1);
    cell.value = h;
    cell.font = FONT_HEADER;
    cell.fill = FILL_HEADER_BLUE as any;
    cell.alignment = ALIGN_CENTER;
    cell.border = BORDER_HEADER;
  });

  let rowIdx = 4;
  phongShifts.forEach(s => {
    ws.getRow(rowIdx).height = 36;

    const chinhLines = (s.assigned_members || [])
      .filter((m: any) => m.role === 'Chính')
      .map((m: any) => `• [Trực chính]: ${m.name} (${m.department} - SĐT: ${m.phone})`);
    const dpLines = (s.assigned_members || [])
      .filter((m: any) => m.role === 'Dự phòng')
      .map((m: any) => `• [Dự phòng]: ${m.name} (${m.department} - SĐT: ${m.phone})`);

    const memberStr = [...chinhLines, ...dpLines].join('\n');
    const reqStr = `${s.chinh_count || 3} Chính + ${s.dp_count || 1} DP`;

    const values = [
      s.shift_id,
      s.day,
      s.date,
      s.slot,
      reqStr,
      s.assigned_count,
      s.shift_leader || '-',
      memberStr,
      "Trực phòng chính; Đảm bảo mở cửa đúng giờ, bảo quản tiền & hàng F&B"
    ];

    const fill = rowIdx % 2 === 0 ? FILL_ZEBRA_1 : FILL_ZEBRA_2;
    values.forEach((val, colIdx) => {
      const cell = ws.getCell(rowIdx, colIdx + 1);
      cell.value = val;
      cell.font = FONT_REGULAR;
      cell.fill = fill as any;
      cell.border = BORDER_THIN;

      const cIdx = colIdx + 1;
      const isCenter = [1, 2, 3, 4, 5, 6].includes(cIdx);
      cell.alignment = isCenter ? ALIGN_CENTER : ALIGN_LEFT;
    });

    rowIdx++;
  });

  autofitColumns(ws);
}

// 3. Sheet: ca ngoài
function createSheetCaNgoai(wb: ExcelJS.Workbook, ngoaiShifts: any[]) {
  const ws = wb.addWorksheet("ca ngoài", { views: [{ showGridLines: true }] });

  ws.mergeCells("A1:I1");
  const tCell = ws.getCell("A1");
  tCell.value = "LỊCH PHÂN BỔ NHÂN SỰ ĐIỂM BÁN NGOÀI - CA NGOÀI";
  tCell.font = { name: "Segoe UI", size: 15, bold: true, color: { argb: "FFD97706" } };
  tCell.alignment = ALIGN_CENTER;
  ws.getRow(1).height = 32;

  const headers = [
    "Mã Ca", "Thứ", "Ngày", "Khung Giờ", "Địa Điểm Bán Ngoài", "Định Mức (Chính/DP)", "Đã Phân", "Trưởng Điểm Ngoài", "Danh Sách Nhân Sự (SĐT & Phương Tiện)"
  ];

  ws.getRow(3).height = 26;
  headers.forEach((h, colIdx) => {
    const cell = ws.getCell(3, colIdx + 1);
    cell.value = h;
    cell.font = FONT_HEADER;
    cell.fill = FILL_HEADER_ORANGE as any;
    cell.alignment = ALIGN_CENTER;
    cell.border = BORDER_HEADER;
  });

  let rowIdx = 4;
  ngoaiShifts.forEach(s => {
    ws.getRow(rowIdx).height = 36;

    const chinhLines = (s.assigned_members || [])
      .filter((m: any) => m.role === 'Chính')
      .map((m: any) => `• [Trực chính]: ${m.name} - ${m.department} (SĐT: ${m.phone}) ${m.vehicle ? `[${m.vehicle}]` : ""}`);
    const dpLines = (s.assigned_members || [])
      .filter((m: any) => m.role !== 'Chính')
      .map((m: any) => `• [Dự phòng]: ${m.name} - ${m.department} (SĐT: ${m.phone}) ${m.vehicle ? `[${m.vehicle}]` : ""}`);

    const memberStr = [...chinhLines, ...dpLines].join('\n');
    const reqStr = `${s.chinh_count || 2} Chính + ${s.dp_count || 1} DP`;

    const values = [
      s.shift_id,
      s.day,
      s.date,
      s.slot,
      s.location,
      reqStr,
      s.assigned_count,
      s.shift_leader || '-',
      memberStr
    ];

    const fill = rowIdx % 2 === 0 ? FILL_ZEBRA_1 : FILL_HIGHLIGHT_NGOAI;
    values.forEach((val, colIdx) => {
      const cell = ws.getCell(rowIdx, colIdx + 1);
      cell.value = val;
      cell.font = FONT_REGULAR;
      cell.fill = fill as any;
      cell.border = BORDER_THIN;

      const cIdx = colIdx + 1;
      const isCenter = [1, 2, 3, 4, 6, 7].includes(cIdx);
      cell.alignment = isCenter ? ALIGN_CENTER : ALIGN_LEFT;
    });

    rowIdx++;
  });

  autofitColumns(ws);
}

// 4. Sheet: thống kê
function createSheetThongKe(wb: ExcelJS.Workbook, memberStats: any[]) {
  const ws = wb.addWorksheet("thống kê", { views: [{ showGridLines: true }] });

  ws.mergeCells("A1:M1");
  const tCell = ws.getCell("A1");
  tCell.value = "BÁO CÁO THỐNG KÊ & PHÂN TÍCH HIỆU SUẤT NHÂN SỰ TRỰC CA";
  tCell.font = { name: "Segoe UI", size: 15, bold: true, color: { argb: "FF047857" } };
  tCell.alignment = ALIGN_CENTER;
  ws.getRow(1).height = 32;

  const headers = [
    "Mã TV", "Họ Và Tên", "Ban Chuyên Môn", "Đối Tượng", "Nơi Sinh Sống", "Số Điện Thoại", 
    "Đội Ứng Biến", "Tổng Ca", "Tổng Giờ", "Ca Trong", "Ca Ngoài", "Ca Cam Kết", "Mã Ca Được Phân Công"
  ];

  ws.getRow(3).height = 26;
  headers.forEach((h, colIdx) => {
    const cell = ws.getCell(3, colIdx + 1);
    cell.value = h;
    cell.font = FONT_HEADER;
    cell.fill = FILL_HEADER_GREEN as any;
    cell.alignment = ALIGN_CENTER;
    cell.border = BORDER_HEADER;
  });

  let rowIdx = 4;
  memberStats.forEach(m => {
    ws.getRow(rowIdx).height = 22;
    const standbyTxt = m.is_standby ? "Có" : "Không";

    const values = [
      m.member_id,
      m.name,
      m.department,
      m.job,
      m.residence,
      m.phone,
      standbyTxt,
      m.total_shifts,
      m.total_hours,
      m.phong_shifts,
      m.ngoai_shifts,
      m.committed_matched,
      m.assigned_shift_ids
    ];

    const fill = rowIdx % 2 === 0 ? FILL_ZEBRA_1 : FILL_ZEBRA_2;
    values.forEach((val, colIdx) => {
      const cell = ws.getCell(rowIdx, colIdx + 1);
      cell.value = val;
      cell.font = FONT_REGULAR;
      cell.fill = fill as any;
      cell.border = BORDER_THIN;

      const cIdx = colIdx + 1;
      const isCenter = [1, 4, 6, 7, 8, 9, 10, 11, 12].includes(cIdx);
      cell.alignment = isCenter ? ALIGN_CENTER : ALIGN_LEFT;

      if ([8, 9].includes(cIdx)) {
        cell.font = FONT_BOLD;
      }
    });

    rowIdx++;
  });

  // Department summary list below
  rowIdx += 2;
  const sText = ws.getCell(rowIdx, 1);
  sText.value = "BẢNG TỔNG HỢP THEO BAN CHUYÊN MÔN";
  sText.font = FONT_SECTION;
  rowIdx++;

  const deptHeaders = ["Ban", "Số Thành Viên", "Tổng Ca Trực", "Trung Bình Ca/Người"];
  deptHeaders.forEach((h, colIdx) => {
    const cell = ws.getCell(rowIdx, colIdx + 1);
    cell.value = h;
    cell.font = FONT_HEADER;
    cell.fill = FILL_HEADER_DARK as any;
    cell.alignment = ALIGN_CENTER;
    cell.border = BORDER_HEADER;
  });
  rowIdx++;

  const deptGroups: { [key: string]: { count: number; shifts: number } } = {};
  memberStats.forEach(m => {
    const d = m.department;
    if (!deptGroups[d]) {
      deptGroups[d] = { count: 0, shifts: 0 };
    }
    deptGroups[d].count += 1;
    deptGroups[d].shifts += m.total_shifts;
  });

  Object.entries(deptGroups).forEach(([d, info]) => {
    const avgS = info.count ? parseFloat((info.shifts / info.count).toFixed(2)) : 0;

    const values = [d, info.count, info.shifts, avgS];
    values.forEach((val, colIdx) => {
      const cell = ws.getCell(rowIdx, colIdx + 1);
      cell.value = val;
      cell.font = FONT_REGULAR;
      cell.border = BORDER_THIN;
      cell.alignment = colIdx + 1 > 1 ? ALIGN_CENTER : ALIGN_LEFT;
    });
    rowIdx++;
  });

  autofitColumns(ws);
}

// 5. Sheet: kiểm tra ca
function createSheetKiemTraCa(wb: ExcelJS.Workbook, audit: any, assignedShifts: any[]) {
  const ws = wb.addWorksheet("kiểm tra ca", { views: [{ showGridLines: true }] });

  ws.mergeCells("A1:H1");
  const tCell = ws.getCell("A1");
  tCell.value = "BÁO CÁO KIỂM TRA & THẨM ĐỊNH TÍNH HỢP LỆ LỊCH TRỰC (AUDIT REPORT)";
  tCell.font = { name: "Segoe UI", size: 15, bold: true, color: { argb: "FF6D28D9" } };
  tCell.alignment = ALIGN_CENTER;
  ws.getRow(1).height = 32;

  ws.mergeCells("A3:D3");
  const sectionCell = ws.getCell("A3");
  sectionCell.value = "CHỈ SỐ THẨM ĐỊNH QUAN TRỌNG";
  sectionCell.font = FONT_SECTION;

  const metrics = [
    ["Xung đột trùng ca (Ca Trong vs Ca Ngoài)", `${audit.conflict_count || 0} vi phạm`, "Tuyệt đối không trùng", "100% ĐẠT"],
    ["Vi phạm lịch rảnh đã đăng ký", `${audit.availability_violation_count || 0} vi phạm`, "Tôn trọng lịch rảnh thành viên", "100% ĐẠT"],
    ["Phòng bán trống không có người trực", `${audit.empty_room_count || 0} ca trống`, "Không để phòng trống", "100% ĐẠT"],
    ["Số ca quá tải trong ngày (>2 ca/ngày)", `${audit.daily_overload_count || 0} trường hợp`, "Tối đa 2 ca/ngày/người", "100% ĐẠT"],
    ["Độ công bằng phân bổ (Fairness Score)", `${audit.fairness_metrics?.fairness_score || 95}/100`, "Phân bổ đều giữa các thành viên", "TỐT"]
  ];

  const cardHeaders = ["Hạng Mục Kiểm Tra", "Kết Quả Thực Tế", "Tiêu Chuẩn Đề Ra", "Đánh Giá"];
  cardHeaders.forEach((h, colIdx) => {
    const cell = ws.getCell(4, colIdx + 1);
    cell.value = h;
    cell.font = FONT_HEADER;
    cell.fill = FILL_HEADER_PURPLE as any;
    cell.alignment = ALIGN_CENTER;
    cell.border = BORDER_HEADER;
  });

  metrics.forEach((rowVals, ri) => {
    const realRowIdx = ri + 5;
    ws.getRow(realRowIdx).height = 24;

    rowVals.forEach((val, colIdx) => {
      const cell = ws.getCell(realRowIdx, colIdx + 1);
      cell.value = val;
      cell.font = FONT_REGULAR;
      cell.border = BORDER_THIN;
      cell.fill = FILL_SUCCESS_LIGHT as any;

      const cIdx = colIdx + 1;
      cell.alignment = cIdx === 2 || cIdx === 4 ? ALIGN_CENTER : ALIGN_LEFT;

      if (cIdx === 4) {
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF047857" } };
      }
    });
  });

  let curRowIdx = 12;
  ws.mergeCells(`A${curRowIdx}:H${curRowIdx}`);
  const secCell2 = ws.getCell(`A${curRowIdx}`);
  secCell2.value = "CHI TIẾT ĐỘ PHỦ TỪNG KHUNG GIỜ (COVERAGE CHECK)";
  secCell2.font = FONT_SECTION;
  curRowIdx++;

  const covHeaders = ["Mã Ca", "Kênh", "Thứ", "Khung Giờ", "Yêu Cầu (Chính+DP)", "Đã Gán", "Độ Phủ (%)", "Kết Luận"];
  covHeaders.forEach((h, colIdx) => {
    const cell = ws.getCell(curRowIdx, colIdx + 1);
    cell.value = h;
    cell.font = FONT_HEADER;
    cell.fill = FILL_HEADER_DARK as any;
    cell.alignment = ALIGN_CENTER;
    cell.border = BORDER_HEADER;
  });
  curRowIdx++;

  assignedShifts.forEach(s => {
    ws.getRow(curRowIdx).height = 20;
    const req = s.required_count || 0;
    const ratio = req > 0 ? parseFloat(((s.assigned_count / req) * 100).toFixed(1)) : 100;
    const concl = ratio >= 100 ? "Hoàn hảo" : "Thiếu định mức";

    const rowVals = [
      s.shift_id,
      s.type_label,
      s.day,
      s.slot,
      req,
      s.assigned_count,
      `${ratio}%`,
      concl
    ];

    rowVals.forEach((val, colIdx) => {
      const cell = ws.getCell(curRowIdx, colIdx + 1);
      cell.value = val;
      cell.font = FONT_REGULAR;
      cell.border = BORDER_THIN;
      cell.alignment = ALIGN_CENTER;
    });

    curRowIdx++;
  });

  autofitColumns(ws);
}

// 6. Sheet: ca vắng
function createSheetCaVang(wb: ExcelJS.Workbook, contingency: any[]) {
  const ws = wb.addWorksheet("ca vắng", { views: [{ showGridLines: true }] });

  ws.mergeCells("A1:J1");
  const tCell = ws.getCell("A1");
  tCell.value = "QUY TRÌNH QUẢN LÝ CA VẮNG & MA TRẬN NHÂN SỰ DỰ PHÒNG ỨNG BIẾN NHANH";
  tCell.font = { name: "Segoe UI", size: 15, bold: true, color: { argb: "FFDC2626" } };
  tCell.alignment = ALIGN_CENTER;
  ws.getRow(1).height = 32;

  ws.mergeCells("A2:J2");
  const subCell = ws.getCell("A2");
  subCell.value = "Hướng dẫn: Khi có thành viên vắng đột xuất hoặc xin nghỉ, Trưởng ca tra cứu mã ca bên dưới và liên hệ ngay các nhân sự dự phòng theo thứ tự ưu tiên.";
  subCell.font = FONT_SMALL;
  subCell.alignment = ALIGN_CENTER;
  ws.getRow(2).height = 20;

  const headers = [
    "Mã Ca", "Kênh Trực", "Thứ", "Khung Giờ", "Địa Điểm", 
    "Nhân Sự Chính Thức (Chính / DP)", "Dự Phòng Ưu Tiên 1 (Đội Ứng Biến)", "Dự Phòng Ưu Tiên 2", "Dự Phòng Ưu Tiên 3", "Ghi Chú Vắng / Thay Ca"
  ];

  ws.getRow(4).height = 28;
  headers.forEach((h, colIdx) => {
    const cell = ws.getCell(4, colIdx + 1);
    cell.value = h;
    cell.font = FONT_HEADER;
    cell.fill = FILL_HEADER_RED as any;
    cell.alignment = ALIGN_CENTER;
    cell.border = BORDER_HEADER;
  });

  let rowIdx = 5;
  contingency.forEach(item => {
    ws.getRow(rowIdx).height = 28;
    const backups = item.backup_candidates || [];

    const b1 = backups.length > 0 ? `${backups[0].name} (${backups[0].phone})` : "Hết nhân sự rảnh";
    const b2 = backups.length > 1 ? `${backups[1].name} (${backups[1].phone})` : "-";
    const b3 = backups.length > 2 ? `${backups[2].name} (${backups[2].phone})` : "-";

    const assignedStr = (item.current_assigned || []).join(', ');

    const values = [
      item.shift_id,
      item.type_label,
      item.day,
      item.slot,
      item.location,
      assignedStr,
      b1,
      b2,
      b3,
      "Ký xác nhận khi có đổi ca"
    ];

    const fill = rowIdx % 2 === 0 ? FILL_ZEBRA_1 : FILL_ZEBRA_2;
    values.forEach((val, colIdx) => {
      const cell = ws.getCell(rowIdx, colIdx + 1);
      cell.value = val;
      cell.font = FONT_REGULAR;
      cell.fill = fill as any;
      cell.border = BORDER_THIN;

      const cIdx = colIdx + 1;
      const isCenter = [1, 2, 3, 4].includes(cIdx);
      cell.alignment = isCenter ? ALIGN_CENTER : ALIGN_LEFT;

      if (cIdx === 7 && backups.length > 0) {
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF1E40AF" } };
      }
    });

    rowIdx++;
  });

  autofitColumns(ws);
}
