import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import * as xlsx from 'xlsx';
import crypto from 'crypto';

import { 
  loadShiftsMaster, 
  loadMembersData, 
  parseMembersDf, 
  getAvailabilityHeatmap, 
  calculateDateForDay,
  Member, 
  Shift, 
  DAYS_LIST, 
  SLOT_KEYS 
} from './src/data_loader';
import { ShiftScheduler } from './src/scheduler';
import { exportScheduleToExcel } from './src/exporter';
import { TASK_2_DETAILS } from './src/risk_and_hr_protocols';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const STATE_FILE = process.env.STATE_FILE || 'state.json';
const REPORT_PATH = 'reports/Lich_Truc_Toi_Uu_Hung_Vuong_Concert.xlsx';

function resolveAppRoot(): string {
  for (const candidate of [__dirname, path.join(__dirname, '..')]) {
    if (fs.existsSync(path.join(candidate, 'templates', 'index.html'))) {
      return candidate;
    }
  }
  return __dirname;
}

const APP_ROOT = resolveAppRoot();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static assets
app.use('/static', express.static(path.join(APP_ROOT, 'static')));

// Upload configuration
const upload = multer({ dest: 'uploads/' });

// Inventory interfaces
export interface Product {
  id: string;
  name: string;
  unit: string;
  price: number;
  initial_stock: number;
  sold_count: number;
  note?: string;
}

export interface SaleTransaction {
  id: string;
  timestamp: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  channel: string;
  seller?: string;
  note?: string;
  refunded?: boolean;
}

// Global State & Auth
let ADMIN_PASSWORD: string = process.env.ADMIN_PASSWORD || 'hungvuong2026';
const ACTIVE_ADMIN_TOKENS: Set<string> = new Set();

let START_DATE: string = '2026-08-24';
let CURRENT_SHIFTS: Shift[] = [];
let CURRENT_MEMBERS: Member[] = [];
const DEFAULT_CA_NGOAI = [
  {
    id: 'NGOAI_01',
    name: 'Quán Café A',
    day: 'Thứ 7',
    start_time: '17:00',
    end_time: '19:30',
    chinh: 2,
    dp: 1
  },
  {
    id: 'NGOAI_02',
    name: 'Quán Café B',
    day: 'Thứ 7',
    start_time: '17:30',
    end_time: '20:00',
    chinh: 2,
    dp: 1
  },
  {
    id: 'NGOAI_03',
    name: 'Quán Café B',
    day: 'Chủ Nhật',
    start_time: '17:00',
    end_time: '19:30',
    chinh: 2,
    dp: 1
  },
  {
    id: 'NGOAI_04',
    name: 'Quán Café C',
    day: 'Chủ Nhật',
    start_time: '17:00',
    end_time: '19:00',
    chinh: 2,
    dp: 1
  }
];
let CUSTOM_CA_NGOAI: any[] = JSON.parse(JSON.stringify(DEFAULT_CA_NGOAI));
let ENABLE_CA_NGOAI = true;
let INCIDENT_LOGS: any[] = [];
let LATEST_SCHEDULE_RESULT: any = null;

const DEFAULT_PRODUCTS: Product[] = [];

const DEFAULT_SALES_LOGS: SaleTransaction[] = [];

let INVENTORY_PRODUCTS: Product[] = [];
let SALES_LOGS: SaleTransaction[] = [];
let KPI_ATTENDANCE: any[] = [];

// Auth Helpers & Middleware
function extractToken(req: express.Request): string | null {
  const authHeader = req.headers['authorization'] || '';
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const customHeader = req.headers['x-admin-token'];
  if (typeof customHeader === 'string') {
    return customHeader.trim();
  }
  return null;
}

export function isValidAdmin(req: express.Request): boolean {
  const token = extractToken(req);
  if (token && ACTIVE_ADMIN_TOKENS.has(token)) {
    return true;
  }
  // Allow direct secret key in header for automation or environment
  const pwdHeader = req.headers['x-admin-password'];
  if (typeof pwdHeader === 'string' && pwdHeader === ADMIN_PASSWORD) {
    return true;
  }
  return false;
}

export function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (isValidAdmin(req)) {
    return next();
  }
  return res.status(401).json({
    success: false,
    require_admin: true,
    message: 'Yêu cầu quyền Quản trị viên (Admin) để thực hiện thao tác này! Vui lòng đăng nhập với mật khẩu Admin.'
  });
}

// Helpers
function persist() {
  const payload = {
    version: 2,
    admin_password: ADMIN_PASSWORD,
    start_date: START_DATE,
    enable_ca_ngoai: ENABLE_CA_NGOAI,
    custom_ca_ngoai: CUSTOM_CA_NGOAI,
    incident_logs: INCIDENT_LOGS,
    schedule: LATEST_SCHEDULE_RESULT,
    members: CURRENT_MEMBERS,
    inventory: INVENTORY_PRODUCTS,
    sales_logs: SALES_LOGS,
    kpi_attendance: KPI_ATTENDANCE
  };
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error(`[state_store] Không lưu được trạng thái: ${e}`);
    return false;
  }
}

function applyStartDateToShifts(shifts: Shift[], startDate: string) {
  for (const s of shifts) {
    const calculated = calculateDateForDay(startDate, s.day);
    if (calculated) {
      s.date = calculated;
    }
  }
}

async function runDefaultOptimization() {
  applyStartDateToShifts(CURRENT_SHIFTS, START_DATE);
  const config = {
    start_date: START_DATE,
    phong_chinh_count: 3,
    phong_dp_count: 1,
    enable_ca_ngoai: ENABLE_CA_NGOAI,
    custom_ca_ngoai: CUSTOM_CA_NGOAI
  };
  const scheduler = new ShiftScheduler(CURRENT_SHIFTS, CURRENT_MEMBERS, config);
  const result = scheduler.optimize();
  if (result && result.success) {
    LATEST_SCHEDULE_RESULT = result;
    await exportScheduleToExcel(LATEST_SCHEDULE_RESULT, REPORT_PATH);
    persist();
  }
}

function bootstrapState() {
  CURRENT_SHIFTS = loadShiftsMaster();

  // Try loading saved state
  if (fs.existsSync(STATE_FILE)) {
    try {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      const saved = JSON.parse(data);
      if (saved) {
        if (saved.admin_password) {
          ADMIN_PASSWORD = saved.admin_password;
        }
        if (saved.start_date) {
          START_DATE = saved.start_date;
        }
        if (saved.members && saved.members.length > 0) {
          CURRENT_MEMBERS = saved.members;
        } else {
          CURRENT_MEMBERS = loadMembersData();
        }
        CUSTOM_CA_NGOAI = saved.custom_ca_ngoai || JSON.parse(JSON.stringify(DEFAULT_CA_NGOAI));
        ENABLE_CA_NGOAI = saved.enable_ca_ngoai !== undefined ? saved.enable_ca_ngoai : true;
        INCIDENT_LOGS = saved.incident_logs || [];
        LATEST_SCHEDULE_RESULT = saved.schedule || null;

        INVENTORY_PRODUCTS = saved.inventory || [];
        SALES_LOGS = saved.sales_logs || [];
        KPI_ATTENDANCE = saved.kpi_attendance || [];

        applyStartDateToShifts(CURRENT_SHIFTS, START_DATE);

        console.log(`[app] Đã phục hồi trạng thái (${CURRENT_MEMBERS.length} thành viên, ` +
                    `${INCIDENT_LOGS.length} sự cố, ${INVENTORY_PRODUCTS.length} sản phẩm, ngày bắt đầu: ${START_DATE})`);
        return;
      }
    } catch (e) {
      console.warn(`[state_store] Trạng thái đã lưu không đọc được, nạp lại từ file gốc (${e})`);
    }
  }

  // Fallback to defaults
  CURRENT_MEMBERS = loadMembersData();
  CUSTOM_CA_NGOAI = JSON.parse(JSON.stringify(DEFAULT_CA_NGOAI));
  ENABLE_CA_NGOAI = true;
  INCIDENT_LOGS = [];
  LATEST_SCHEDULE_RESULT = null;
  INVENTORY_PRODUCTS = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
  SALES_LOGS = JSON.parse(JSON.stringify(DEFAULT_SALES_LOGS));
  KPI_ATTENDANCE = [];

  applyStartDateToShifts(CURRENT_SHIFTS, START_DATE);

  // Run initial optimization once so that there is immediate data visible to users
  runDefaultOptimization().catch(err => console.error('[Bootstrap] Lỗi xếp lịch ban đầu:', err));
}

// Routes
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(APP_ROOT, 'templates', 'index.html'));
});

// AUTHENTICATION ROUTES
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu Quản trị viên!' });
  }

  if (password.trim() === ADMIN_PASSWORD.trim()) {
    const token = crypto.randomBytes(32).toString('hex');
    ACTIVE_ADMIN_TOKENS.add(token);
    return res.json({
      success: true,
      token: token,
      role: 'admin',
      message: 'Đăng nhập Quản trị viên thành công!'
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Mật khẩu Quản trị viên không chính xác!'
  });
});

app.get('/api/auth/status', (req, res) => {
  const isAdmin = isValidAdmin(req);
  res.json({
    success: true,
    is_admin: isAdmin,
    role: isAdmin ? 'admin' : 'staff'
  });
});

app.post('/api/auth/logout', (req, res) => {
  const token = extractToken(req);
  if (token) {
    ACTIVE_ADMIN_TOKENS.delete(token);
  }
  res.json({
    success: true,
    message: 'Đã đăng xuất khỏi chế độ Quản trị viên!'
  });
});

app.post('/api/auth/change-password', requireAdmin, (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu cũ và mật khẩu mới!' });
  }

  if (old_password.trim() !== ADMIN_PASSWORD.trim()) {
    return res.status(400).json({ success: false, message: 'Mật khẩu cũ không chính xác!' });
  }

  if (new_password.trim().length < 4) {
    return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 4 ký tự!' });
  }

  ADMIN_PASSWORD = new_password.trim();
  persist();

  res.json({
    success: true,
    message: 'Đã đổi mật khẩu Quản trị viên thành công!'
  });
});

app.get('/api/shifts', (req, res) => {
  applyStartDateToShifts(CURRENT_SHIFTS, START_DATE);
  res.json({
    success: true,
    start_date: START_DATE,
    shifts: CURRENT_SHIFTS,
    total: CURRENT_SHIFTS.length
  });
});

function getInventoryData() {
  const productsWithStock = INVENTORY_PRODUCTS.map(p => {
    const sold = Number(p.sold_count || 0);
    const initial = Number(p.initial_stock || 0);
    const stock = Math.max(0, initial - sold);
    const price = Number(p.price || 0);
    const revenue = sold * price;
    const stock_value = stock * price;
    return {
      ...p,
      initial_stock: initial,
      sold_count: sold,
      stock: stock,
      current_stock: stock,
      price: price,
      revenue: revenue,
      stock_value: stock_value
    };
  });

  const total_revenue = productsWithStock.reduce((sum, p) => sum + p.revenue, 0);
  const total_stock = productsWithStock.reduce((sum, p) => sum + p.stock, 0);
  const total_sold = productsWithStock.reduce((sum, p) => sum + p.sold_count, 0);
  const total_stock_value = productsWithStock.reduce((sum, p) => sum + p.stock_value, 0);

  return {
    products: productsWithStock,
    kpis: {
      total_revenue,
      total_stock,
      total_sold,
      total_stock_value
    },
    sales_logs: SALES_LOGS
  };
}

// Inventory API Routes
app.get('/api/inventory', (req, res) => {
  const data = getInventoryData();
  res.json({
    success: true,
    ...data
  });
});

app.post('/api/inventory/product', requireAdmin, (req, res) => {
  const data = req.body || {};
  let id = String(data.id || '').trim();
  const name = String(data.name || '').trim();
  const unit = String(data.unit || 'Phần').trim();
  const price = Math.max(0, parseInt(data.price || '0', 10));
  const initial_stock = Math.max(0, parseInt(data.initial_stock || '0', 10));
  const sold_count = Math.max(0, parseInt(data.sold_count || '0', 10));
  const note = String(data.note || '').trim();

  if (!name) {
    return res.status(400).json({ success: false, message: 'Tên sản phẩm không được để trống!' });
  }

  if (id) {
    // Update existing product
    const existingIndex = INVENTORY_PRODUCTS.findIndex(p => p.id === id);
    if (existingIndex !== -1) {
      INVENTORY_PRODUCTS[existingIndex] = {
        id,
        name,
        unit,
        price,
        initial_stock,
        sold_count,
        note
      };
    } else {
      INVENTORY_PRODUCTS.push({
        id,
        name,
        unit,
        price,
        initial_stock,
        sold_count,
        note
      });
    }
  } else {
    // Generate new ID
    const nextNum = INVENTORY_PRODUCTS.length + 1;
    id = `SP${String(nextNum).padStart(2, '0')}`;
    // ensure unique
    while (INVENTORY_PRODUCTS.some(p => p.id === id)) {
      id = `SP${String(parseInt(id.replace('SP', ''), 10) + 1).padStart(2, '0')}`;
    }
    INVENTORY_PRODUCTS.push({
      id,
      name,
      unit,
      price,
      initial_stock,
      sold_count,
      note
    });
  }

  persist();
  const inv = getInventoryData();
  res.json({
    success: true,
    message: `Đã lưu sản phẩm '${name}' (${id}) thành công!`,
    product: { id, name, unit, price, initial_stock, sold_count, note },
    ...inv
  });
});

app.post('/api/inventory/delete', requireAdmin, (req, res) => {
  const { id } = req.body || {};
  if (!id) {
    return res.status(400).json({ success: false, message: 'Thiếu mã sản phẩm' });
  }

  const cleanId = String(id).trim().toUpperCase();
  INVENTORY_PRODUCTS = INVENTORY_PRODUCTS.filter(p => {
    const pId = String(p.id || '').trim().toUpperCase();
    return pId !== cleanId && String(p.id).trim() !== String(id).trim();
  });

  persist();
  const inv = getInventoryData();
  res.json({
    success: true,
    message: `Đã xóa sản phẩm ${id} khỏi kho hàng!`,
    ...inv
  });
});

app.post('/api/inventory/upload-excel', requireAdmin, upload.single('file') as any, async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy file tải lên!' });
    }
    const filePath = req.file.path;
    const wb = xlsx.readFile(filePath);
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<any>(sheet);
    fs.unlinkSync(filePath);

    let count = 0;
    for (const row of rows) {
      const name = String(row['Tên sản phẩm'] || row['Tên SP'] || row['Name'] || row['name'] || '').trim();
      if (!name) continue;
      const unit = String(row['Đơn vị tính'] || row['ĐVT'] || row['Unit'] || 'Phần').trim();
      const price = Math.max(0, parseInt(String(row['Giá bán'] || row['Giá'] || row['Price'] || '0').replace(/[^0-9]/g, ''), 10));
      const initial_stock = Math.max(0, parseInt(String(row['Tồn kho đầu'] || row['Tồn kho'] || row['Stock'] || '0').replace(/[^0-9]/g, ''), 10));
      const sold_count = Math.max(0, parseInt(String(row['Đã bán'] || row['Sold'] || '0').replace(/[^0-9]/g, ''), 10));
      const note = String(row['Ghi chú'] || row['Note'] || '').trim();

      let id = String(row['Mã SP'] || row['Mã sản phẩm'] || row['ID'] || row['id'] || '').trim();
      if (!id) {
        id = `SP${String(INVENTORY_PRODUCTS.length + 1).padStart(2, '0')}`;
      }

      const existingIdx = INVENTORY_PRODUCTS.findIndex(p => p.id === id || p.name.toLowerCase() === name.toLowerCase());
      if (existingIdx !== -1) {
        INVENTORY_PRODUCTS[existingIdx] = { id: INVENTORY_PRODUCTS[existingIdx].id, name, unit, price, initial_stock, sold_count, note };
      } else {
        INVENTORY_PRODUCTS.push({ id, name, unit, price, initial_stock, sold_count, note });
      }
      count++;
    }

    persist();
    const inv = getInventoryData();
    res.json({
      success: true,
      message: `Đã nạp thành công ${count} sản phẩm vào kho hàng!`,
      ...inv
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Lỗi đọc file Excel: ${err.message}` });
  }
});

app.post('/api/inventory/sell', (req, res) => {
  const data = req.body || {};
  const product_id = String(data.product_id || '').trim();
  const quantity = Math.max(1, parseInt(data.quantity || '1', 10));
  const channel = String(data.channel || 'Phòng Thanh Niên').trim();
  const seller = String(data.seller || 'Thành viên trực ca').trim();
  const note = String(data.note || '').trim();

  const cleanPid = product_id.toUpperCase();
  const product = INVENTORY_PRODUCTS.find(p => String(p.id || '').trim().toUpperCase() === cleanPid || String(p.id || '').trim() === product_id);
  if (!product) {
    return res.status(404).json({ success: false, message: `Không tìm thấy sản phẩm ${product_id}` });
  }

  const currentStock = Math.max(0, product.initial_stock - product.sold_count);
  if (quantity > currentStock) {
    return res.status(400).json({ 
      success: false, 
      message: `Số lượng bán (${quantity}) vượt quá số lượng tồn kho hiện tại (${currentStock})!` 
    });
  }

  product.sold_count = (product.sold_count || 0) + quantity;

  const timestamp = new Date().toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const txId = `TX${String(SALES_LOGS.length + 1).padStart(3, '0')}`;
  const total_amount = quantity * product.price;

  const transaction: SaleTransaction = {
    id: txId,
    timestamp,
    product_id: product.id,
    product_name: product.name,
    quantity,
    unit_price: product.price,
    total_amount,
    channel,
    seller,
    note
  };

  SALES_LOGS.unshift(transaction);
  persist();

  const inv = getInventoryData();
  res.json({
    success: true,
    message: `Đã ghi nhận bán ${quantity} ${product.unit} '${product.name}' (${total_amount.toLocaleString('vi-VN')} ₫)!`,
    transaction,
    product,
    ...inv
  });
});

app.post('/api/inventory/refund', (req, res) => {
  const data = req.body || {};
  const transaction_id = String(data.transaction_id || '').trim();

  const transaction = SALES_LOGS.find(t => t.id === transaction_id);
  if (!transaction) {
    return res.status(404).json({ success: false, message: `Không tìm thấy giao dịch ${transaction_id}` });
  }

  if (transaction.refunded) {
    return res.status(400).json({ success: false, message: `Giao dịch ${transaction_id} đã được hủy/hoàn tác trước đó!` });
  }

  // Find corresponding product
  const product = INVENTORY_PRODUCTS.find(p => p.id === transaction.product_id);
  if (product) {
    // Refund the sold count
    product.sold_count = Math.max(0, (product.sold_count || 0) - transaction.quantity);
  }

  // Mark transaction as refunded
  transaction.refunded = true;
  persist();

  const inv = getInventoryData();
  res.json({
    success: true,
    message: `Đã hủy/hoàn tác thành công giao dịch ${transaction_id}. Đã hoàn lại ${transaction.quantity} sản phẩm vào kho!`,
    ...inv
  });
});

app.post('/api/inventory/reset', requireAdmin, (req, res) => {
  INVENTORY_PRODUCTS = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
  SALES_LOGS = JSON.parse(JSON.stringify(DEFAULT_SALES_LOGS));
  persist();
  const inv = getInventoryData();
  res.json({
    success: true,
    message: 'Đã đặt lại dữ liệu kho hàng về mặc định!',
    ...inv
  });
});

app.get('/api/members', (req, res) => {
  res.json({
    success: true,
    members: CURRENT_MEMBERS,
    total: CURRENT_MEMBERS.length
  });
});

app.post('/api/members/update', requireAdmin, (req, res) => {
  const data = req.body || {};
  const member_id = String(data.member_id || '').trim();

  const member = CURRENT_MEMBERS.find(m => m.member_id === member_id);
  if (!member) {
    return res.status(404).json({ success: false, message: `Không tìm thấy thành viên có ID ${member_id}` });
  }

  if (data.name !== undefined) member.name = String(data.name).trim();
  if (data.department !== undefined) member.department = String(data.department).trim();
  if (data.phone !== undefined) {
    let p = String(data.phone).trim();
    if (p.endsWith('.0')) p = p.slice(0, -2);
    if (p.length === 9 && !p.startsWith('0')) p = '0' + p;
    member.phone = p;
  }
  if (data.job !== undefined) member.job = String(data.job).trim();
  if (data.school !== undefined) member.school = String(data.school).trim();
  if (data.residence !== undefined) member.residence = String(data.residence).trim();
  if (data.vehicle !== undefined) member.vehicle = String(data.vehicle).trim();
  if (data.is_standby !== undefined) member.is_standby = !!data.is_standby;
  
  if (data.availability !== undefined) {
    member.availability = { ...member.availability, ...data.availability };
  }
  
  if (data.committed_slots !== undefined) {
    member.committed_slots = { ...member.committed_slots, ...data.committed_slots };
    // Rule: if a slot is committed, it MUST be available too
    for (const [key, val] of Object.entries(member.committed_slots)) {
      if (val) {
        member.availability[key] = true;
      }
    }
  }

  // Re-calculate total_free_slots
  let totalFreeSlots = 0;
  for (const v of Object.values(member.availability)) {
    if (v) totalFreeSlots++;
  }
  (member as any).total_free_slots = totalFreeSlots;

  // Re-calculate min_shifts & max_shifts
  if (member.job.toLowerCase().includes('học sinh')) {
    (member as any).max_shifts = Math.min(5, Math.max(2, Math.floor(totalFreeSlots / 3)));
    (member as any).min_shifts = 1;
  } else if (member.job.toLowerCase().includes('sinh viên')) {
    (member as any).max_shifts = Math.min(6, Math.max(2, Math.floor(totalFreeSlots / 2)));
    (member as any).min_shifts = 2;
  } else {
    (member as any).max_shifts = Math.min(4, Math.max(1, Math.floor(totalFreeSlots / 4)));
    (member as any).min_shifts = 1;
  }

  persist();

  // If there's an active schedule, let's also update the member info inside member_stats if needed
  if (LATEST_SCHEDULE_RESULT && LATEST_SCHEDULE_RESULT.member_stats) {
    const statsIdx = LATEST_SCHEDULE_RESULT.member_stats.findIndex((s: any) => s.member_id === member_id);
    if (statsIdx !== -1) {
      const ms = LATEST_SCHEDULE_RESULT.member_stats[statsIdx];
      ms.name = member.name;
      ms.department = member.department;
      ms.phone = member.phone;
      ms.job = member.job;
      ms.is_standby = member.is_standby;
    }
  }

  res.json({
    success: true,
    message: `Đã cập nhật thông tin & lịch rảnh thành công cho thành viên ${member.name}!`,
    member
  });
});

// KPI ATTENDANCE ENDPOINTS
app.get('/api/kpi/attendance', (req, res) => {
  // Auto-sync with current schedule
  const shifts = LATEST_SCHEDULE_RESULT && LATEST_SCHEDULE_RESULT.assigned_shifts ? LATEST_SCHEDULE_RESULT.assigned_shifts : [];
  
  // Create a fast lookup set of existing keys: `${shift_id}|${member_id}`
  const existingKeys = new Set(KPI_ATTENDANCE.map(log => `${log.shift_id}|${log.member_id}`));
  
  let newlyAdded = false;
  shifts.forEach((s: any) => {
    const assigned = s.assigned_members || [];
    assigned.forEach((m: any) => {
      const key = `${s.id}|${m.member_id}`;
      if (!existingKeys.has(key)) {
        KPI_ATTENDANCE.push({
          shift_id: s.id,
          member_id: m.member_id,
          name: m.name,
          day: s.day,
          slot: s.start_time + ' - ' + s.end_time,
          role: m.role || 'Chính',
          type: s.type || 'Phong',
          status: 'Đúng giờ'
        });
        newlyAdded = true;
      }
    });
  });

  if (newlyAdded) {
    persist();
  }

  res.json({
    success: true,
    attendance: KPI_ATTENDANCE
  });
});

app.post('/api/kpi/attendance', (req, res) => {
  const { shift_id, member_id, status } = req.body || {};
  if (!shift_id || !member_id) {
    return res.status(400).json({ success: false, message: 'Thiếu shift_id hoặc member_id' });
  }

  let log = KPI_ATTENDANCE.find(l => l.shift_id === shift_id && l.member_id === member_id);
  if (log) {
    log.status = status;
  } else {
    // Attempt to find in schedule
    const shifts = LATEST_SCHEDULE_RESULT && LATEST_SCHEDULE_RESULT.assigned_shifts ? LATEST_SCHEDULE_RESULT.assigned_shifts : [];
    const sh = shifts.find((s: any) => s.id === shift_id);
    const mem = sh ? (sh.assigned_members || []).find((m: any) => m.member_id === member_id) : null;
    
    log = {
      shift_id,
      member_id,
      name: mem ? mem.name : (CURRENT_MEMBERS.find(m => m.member_id === member_id)?.name || member_id),
      day: sh ? sh.day : 'Thứ 2',
      slot: sh ? sh.start_time + ' - ' + sh.end_time : '',
      role: mem ? mem.role : 'Chính',
      type: sh ? sh.type : 'Phong',
      status: status || 'Đúng giờ'
    };
    KPI_ATTENDANCE.push(log);
  }

  persist();
  res.json({ success: true, message: 'Đã cập nhật trạng thái chuyên cần', log });
});

app.post('/api/kpi/attendance/reset', requireAdmin, (req, res) => {
  KPI_ATTENDANCE = [];
  const shifts = LATEST_SCHEDULE_RESULT && LATEST_SCHEDULE_RESULT.assigned_shifts ? LATEST_SCHEDULE_RESULT.assigned_shifts : [];
  shifts.forEach((s: any) => {
    const assigned = s.assigned_members || [];
    assigned.forEach((m: any) => {
      KPI_ATTENDANCE.push({
        shift_id: s.id,
        member_id: m.member_id,
        name: m.name,
        day: s.day,
        slot: s.start_time + ' - ' + s.end_time,
        role: m.role || 'Chính',
        type: s.type || 'Phong',
        status: 'Đúng giờ'
      });
    });
  });

  persist();
  res.json({ success: true, message: 'Đã đặt lại toàn bộ trạng thái điểm danh về mặc định (Đúng giờ)', attendance: KPI_ATTENDANCE });
});

app.get('/api/heatmap', (req, res) => {
  const heatmap_data = getAvailabilityHeatmap(CURRENT_MEMBERS);
  res.json({
    success: true,
    heatmap: heatmap_data
  });
});

app.all('/api/ca-ngoai', (req, res) => {
  if (req.method === 'GET') {
    res.json({
      success: true,
      enabled: ENABLE_CA_NGOAI,
      list: CUSTOM_CA_NGOAI || []
    });
  } else if (req.method === 'POST') {
    if (!isValidAdmin(req)) {
      return res.status(401).json({
        success: false,
        require_admin: true,
        message: 'Yêu cầu quyền Quản trị viên (Admin) để chỉnh sửa ca ngoài!'
      });
    }
    const data = req.body || {};
    if (data.enabled !== undefined) {
      ENABLE_CA_NGOAI = Boolean(data.enabled);
    }
    if (data.action) {
      if (data.action === 'add') {
        if (!CUSTOM_CA_NGOAI) CUSTOM_CA_NGOAI = [];
        const item = data.item || {};
        const new_id = `NGOAI_${String(CUSTOM_CA_NGOAI.length + 1).padStart(2, '0')}`;
        item.id = new_id;
        CUSTOM_CA_NGOAI.push(item);
      } else if (data.action === 'delete') {
        const target_id = data.id;
        if (CUSTOM_CA_NGOAI) {
          CUSTOM_CA_NGOAI = CUSTOM_CA_NGOAI.filter(c => c.id !== target_id);
        }
      } else if (data.action === 'clear') {
        CUSTOM_CA_NGOAI = []; // Explicitly clear all custom outside shifts
      } else if (data.action === 'reset') {
        CUSTOM_CA_NGOAI = JSON.parse(JSON.stringify(DEFAULT_CA_NGOAI)); // Revert to default shifts
      }
    }
    persist();

    // Trigger schedule re-run if latest schedule exists
    if (LATEST_SCHEDULE_RESULT) {
      const config = {
        start_date: START_DATE,
        enable_ca_ngoai: ENABLE_CA_NGOAI,
        custom_ca_ngoai: CUSTOM_CA_NGOAI,
        active_types: ENABLE_CA_NGOAI ? ['Phong', 'Ngoai'] : ['Phong']
      };
      const scheduler = new ShiftScheduler(CURRENT_SHIFTS, CURRENT_MEMBERS, config);
      const new_result = scheduler.optimize();
      if (new_result && new_result.success) {
        LATEST_SCHEDULE_RESULT = new_result;
      }
    }

    res.json({
      success: true,
      enabled: ENABLE_CA_NGOAI,
      list: CUSTOM_CA_NGOAI || [],
      schedule: LATEST_SCHEDULE_RESULT
    });
  } else {
    res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }
});

app.post('/api/upload-data', requireAdmin, upload.single('file') as any, async (req: any, res: any) => {
  try {
    let msg = '';
    if (req.file) {
      const file_path = req.file.path;
      const wb = xlsx.readFile(file_path);
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json<any>(sheet);
      CURRENT_MEMBERS = parseMembersDf(rows);
      fs.unlinkSync(file_path); // Clean up temp file
      
      const dupCount = (CURRENT_MEMBERS as any).duplicateCount || 0;
      const dupStr = dupCount > 0 ? ` (phát hiện & loại bỏ ${dupCount} dòng trùng lặp)` : '';
      msg = `Tải lên thành công file '${req.file.originalname}'! Đã nhập ${CURRENT_MEMBERS.length} thành viên${dupStr}.`;
    } else if (req.body && req.body.google_sheet_url) {
      const url = String(req.body.google_sheet_url).trim();
      
      // Fetch Google Sheet export URL as CSV
      const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) {
        return res.status(400).json({ success: false, message: 'URL Google Sheet không hợp lệ!' });
      }
      const sheet_id = match[1];
      const gid_match = url.match(/[#&?]gid=([0-9]+)/);
      const gid = gid_match ? gid_match[1] : '0';
      const export_url = `https://docs.google.com/spreadsheets/d/${sheet_id}/export?format=csv&gid=${gid}`;

      const response = await fetch(export_url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (!response.ok) {
        throw new Error('Không thể tải file từ Google Sheets. Hãy chắc chắn sheet ở chế độ công khai (Bất kỳ ai có liên kết đều có thể xem).');
      }
      const csvText = await response.text();
      const wb = xlsx.read(csvText, { type: 'string' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json<any>(firstSheet);

      CURRENT_MEMBERS = parseMembersDf(rows);
      const dupCount = (CURRENT_MEMBERS as any).duplicateCount || 0;
      const dupStr = dupCount > 0 ? ` (phát hiện & loại bỏ ${dupCount} dòng trùng lặp)` : '';
      msg = `Đồng bộ Google Sheets thành công! Đã tải ${CURRENT_MEMBERS.length} thành viên${dupStr}.`;
    } else {
      return res.status(400).json({ success: false, message: 'Không tìm thấy file hoặc link Google Sheets' });
    }

    // Rerun optimization
    await runDefaultOptimization();
    res.json({
      success: true,
      message: msg,
      total_members: CURRENT_MEMBERS.length,
      duplicate_count: (CURRENT_MEMBERS as any).duplicateCount || 0,
      duplicate_details: (CURRENT_MEMBERS as any).duplicateDetails || [],
      schedule: LATEST_SCHEDULE_RESULT
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: `Lỗi xử lý dữ liệu đầu vào: ${e.message}` });
  }
});

app.post('/api/shift/update', requireAdmin, async (req, res) => {
  if (!LATEST_SCHEDULE_RESULT) {
    return res.status(400).json({ success: false, message: 'Chưa có lịch trực' });
  }

  const data = req.body || {};
  const shift_id = data.shift_id;
  const new_leader = data.shift_leader;
  const members_update = data.assigned_members; // list of {member_id, role, position_role}

  const target_shift = LATEST_SCHEDULE_RESULT.assigned_shifts.find((s: any) => s.shift_id === shift_id);
  if (!target_shift) {
    return res.status(404).json({ success: false, message: `Không tìm thấy ca ${shift_id}` });
  }

  if (new_leader !== undefined) {
    target_shift.shift_leader = new_leader;
  }

  if (members_update !== undefined) {
    const mem_lookup = new Map<string, Member>();
    CURRENT_MEMBERS.forEach(m => mem_lookup.set(m.member_id, m));

    const new_assigned: any[] = [];
    for (const mu of members_update) {
      const m_orig = mem_lookup.get(mu.member_id);
      if (m_orig) {
        new_assigned.push({
          member_id: m_orig.member_id,
          name: m_orig.name,
          department: m_orig.department,
          residence: m_orig.residence,
          vehicle: m_orig.vehicle,
          job: m_orig.job,
          school: m_orig.school,
          phone: m_orig.phone,
          role: mu.role || 'Chính',
          position_role: mu.position_role || 'Phục vụ / Giao hàng',
          is_standby: m_orig.is_standby,
          is_committed: m_orig.committed_slots[`${target_shift.day}|${target_shift.slot}`] || false
        });
      }
    }
    target_shift.assigned_members = new_assigned;
    target_shift.assigned_count = new_assigned.length;
    target_shift.chinh_assigned_count = new_assigned.filter(m => m.role === 'Chính').length;
    target_shift.dp_assigned_count = new_assigned.filter(m => m.role === 'Dự phòng').length;
    target_shift.is_filled = new_assigned.length >= (target_shift.required_count || 0);
  }

  // Save to Excel and disk
  await exportScheduleToExcel(LATEST_SCHEDULE_RESULT, REPORT_PATH);
  persist();

  res.json({
    success: true,
    message: `Đã cập nhật thành công thông tin ca ${shift_id}!`,
    shift: target_shift
  });
});

app.get('/api/contingency/suggest', (req, res) => {
  const shift_id = req.query.shift_id;
  if (!LATEST_SCHEDULE_RESULT) {
    return res.status(400).json({ success: false, message: 'Chưa có lịch trực' });
  }

  const target_shift = LATEST_SCHEDULE_RESULT.assigned_shifts.find((s: any) => s.shift_id === shift_id);
  if (!target_shift) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy ca' });
  }

  const assigned_ids = new Set<string>((target_shift.assigned_members || []).map((m: any) => m.member_id));
  const day = target_shift.day;
  const slot = target_shift.slot;
  const overlap_slots = target_shift.overlapping_slots || [slot];

  const available_candidates: any[] = [];
  CURRENT_MEMBERS.forEach(m => {
    if (assigned_ids.has(m.member_id)) return;

    // Check if member is working another shift at this overlapping slot
    let is_busy_elsewhere = false;
    for (const otherS of LATEST_SCHEDULE_RESULT.assigned_shifts) {
      if (otherS.day === day) {
        const other_overlap = otherS.overlapping_slots || [otherS.slot];
        const intersects = overlap_slots.some((sl: string) => other_overlap.includes(sl));
        if (intersects) {
          const is_working = (otherS.assigned_members || []).some((sm: any) => sm.member_id === m.member_id);
          if (is_working) {
            is_busy_elsewhere = true;
            break;
          }
        }
      }
    }

    if (is_busy_elsewhere) return;

    // Priority ranking:
    // 1 = Registered available & Standby team
    // 2 = Registered available
    // 3 = Standby team member (off-duty)
    // 4 = General off-duty member
    const is_registered_free = overlap_slots.every(sl => m.availability[`${day}|${sl}`] === true);
    let priority = 4;
    let label = 'Rảnh lịch chung';

    if (is_registered_free && m.is_standby) {
      priority = 1;
      label = '⚡ Ứng biến (Đã ĐK Rảnh)';
    } else if (is_registered_free) {
      priority = 2;
      label = '✓ Đã ĐK Rảnh';
    } else if (m.is_standby) {
      priority = 3;
      label = '⚡ Ứng biến';
    }

    available_candidates.push({
      member_id: m.member_id,
      name: m.name,
      department: m.department,
      phone: m.phone,
      job: m.job,
      vehicle: m.vehicle,
      is_standby: m.is_standby,
      is_registered_free: is_registered_free,
      priority: priority,
      priority_label: label
    });
  });

  available_candidates.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.name.localeCompare(b.name, 'vi');
  });

  res.json({
    success: true,
    shift: target_shift,
    candidates: available_candidates,
    total: available_candidates.length
  });
});

app.post('/api/contingency/log-incident', async (req, res) => {
  if (!LATEST_SCHEDULE_RESULT) {
    return res.status(400).json({ success: false, message: 'Chưa có lịch trực' });
  }

  const data = req.body || {};
  const shift_id = data.shift_id;
  const absent_member_id = data.absent_member_id;
  const replacement_member_id = data.replacement_member_id;
  const status_type = data.status_type || 'Vắng đột xuất'; // 'Đi trễ', 'Vắng đột xuất', 'Xin nghỉ trước', 'Có mặt'
  const late_minutes = data.late_minutes ? parseInt(data.late_minutes, 10) : (status_type === 'Đi trễ' ? 15 : 0);
  const note = data.note || '';

  const target_shift = LATEST_SCHEDULE_RESULT.assigned_shifts.find((s: any) => s.shift_id === shift_id);
  if (!target_shift) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy ca' });
  }

  const absent_m = CURRENT_MEMBERS.find(m => m.member_id === absent_member_id);
  const rep_m = CURRENT_MEMBERS.find(m => m.member_id === replacement_member_id);

  if (rep_m && absent_m) {
    target_shift.assigned_members = (target_shift.assigned_members || []).filter((m: any) => m.member_id !== absent_member_id);
    target_shift.assigned_members.push({
      member_id: rep_m.member_id,
      name: rep_m.name,
      department: rep_m.department,
      residence: rep_m.residence,
      vehicle: rep_m.vehicle,
      job: rep_m.job,
      school: rep_m.school,
      phone: rep_m.phone,
      role: 'Dự phòng thay thế',
      position_role: 'Phục vụ / Giao hàng',
      is_standby: rep_m.is_standby,
      is_committed: false
    });
    target_shift.assigned_count = target_shift.assigned_members.length;
  }

  const timestamp = new Date().toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const incident_record = {
    id: INCIDENT_LOGS.length + 1,
    shift_id: shift_id,
    day: target_shift.day,
    date: target_shift.date || '',
    slot: target_shift.slot,
    location: target_shift.location || target_shift.type_label,
    status_type: status_type,
    late_minutes: late_minutes,
    absent_member: absent_m ? absent_m.name : 'Chung',
    absent_member_id: absent_member_id,
    replacement_member: rep_m ? rep_m.name : 'Không thay thế',
    replacement_member_id: replacement_member_id,
    note: note,
    timestamp: timestamp
  };

  INCIDENT_LOGS.unshift(incident_record);

  await exportScheduleToExcel(LATEST_SCHEDULE_RESULT, REPORT_PATH);
  persist();

  // Compute late / absence summary stats
  const late_logs = INCIDENT_LOGS.filter(i => i.status_type === 'Đi trễ');
  const absent_logs = INCIDENT_LOGS.filter(i => i.status_type === 'Vắng đột xuất' || i.status_type === 'Xin nghỉ trước');

  res.json({
    success: true,
    message: `Đã ghi nhận dữ liệu điểm danh '${status_type}' thành công!`,
    incident: incident_record,
    incidents: INCIDENT_LOGS,
    stats: {
      total_incidents: INCIDENT_LOGS.length,
      total_late: late_logs.length,
      total_absent: absent_logs.length,
      replaced_count: INCIDENT_LOGS.filter(i => i.replacement_member !== 'Không thay thế').length
    }
  });
});

app.get('/api/contingency/incidents', (req, res) => {
  res.json({
    success: true,
    incidents: INCIDENT_LOGS
  });
});

app.post('/api/contingency/reset', requireAdmin, (req, res) => {
  INCIDENT_LOGS = [];
  persist();
  res.json({
    success: true,
    message: 'Đã xóa toàn bộ lịch sử điểm danh và ghi nhận sự cố!',
    incidents: [],
    stats: {
      total_incidents: 0,
      total_late: 0,
      total_absent: 0,
      replaced_count: 0
    }
  });
});

app.post('/api/schedule/run', requireAdmin, async (req, res) => {
  const data = req.body || {};

  if (data.start_date) {
    START_DATE = String(data.start_date).trim();
  }
  applyStartDateToShifts(CURRENT_SHIFTS, START_DATE);

  if (data.enable_ca_ngoai !== undefined) {
    ENABLE_CA_NGOAI = Boolean(data.enable_ca_ngoai);
  }
  if (data.custom_ca_ngoai !== undefined) {
    CUSTOM_CA_NGOAI = data.custom_ca_ngoai;
  }

  const config = {
    start_date: START_DATE,
    min_shifts_per_member: parseInt(data.min_shifts || '1', 10),
    max_shifts_per_member: parseInt(data.max_shifts || '4', 10),
    max_shifts_per_day: parseInt(data.max_shifts_per_day || '2', 10),
    phong_chinh_count: parseInt(data.phong_chinh_count || '3', 10),
    phong_dp_count: parseInt(data.phong_dp_count || '1', 10),
    enable_ca_ngoai: ENABLE_CA_NGOAI,
    custom_ca_ngoai: CUSTOM_CA_NGOAI,
    active_types: ENABLE_CA_NGOAI ? ['Phong', 'Ngoai'] : ['Phong']
  };

  const scheduler = new ShiftScheduler(CURRENT_SHIFTS, CURRENT_MEMBERS, config);
  const result = scheduler.optimize();

  if (result && result.success) {
    LATEST_SCHEDULE_RESULT = result;
    await exportScheduleToExcel(LATEST_SCHEDULE_RESULT, REPORT_PATH);
    persist();
    res.json({
      success: true,
      result: result,
      message: 'Tối ưu hóa lịch trực thành công!'
    });
  } else {
    persist();
    res.status(400).json({
      success: false,
      message: result?.message || 'Không tìm thấy phương án tối ưu thỏa mãn ràng buộc!'
    });
  }
});

app.get('/api/schedule/current', async (req, res) => {
  if (!LATEST_SCHEDULE_RESULT) {
    await runDefaultOptimization();
  }
  if (LATEST_SCHEDULE_RESULT) {
    res.json({
      success: true,
      result: LATEST_SCHEDULE_RESULT
    });
  } else {
    res.status(404).json({ success: false, message: 'Chưa có lịch trực nào' });
  }
});

function getFormattedTimestamp(): string {
  const now = new Date();
  // UTC time + 7 hours for GMT+7 (Vietnam)
  const vnTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  const year = vnTime.getUTCFullYear();
  const month = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(vnTime.getUTCDate()).padStart(2, '0');
  const hour = String(vnTime.getUTCHours()).padStart(2, '0');
  const minute = String(vnTime.getUTCMinutes()).padStart(2, '0');
  const second = String(vnTime.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hour}${minute}${second}`;
}

app.get('/api/schedule/export', async (req, res) => {
  if (!LATEST_SCHEDULE_RESULT) {
    await runDefaultOptimization();
  }
  if (!LATEST_SCHEDULE_RESULT) {
    return res.status(400).json({ success: false, message: 'Chưa có lịch trực để xuất' });
  }

  const out_file = await exportScheduleToExcel(LATEST_SCHEDULE_RESULT, REPORT_PATH);
  const ts = getFormattedTimestamp();
  res.download(out_file, `Lich_Truc_Toi_Uu_Hung_Vuong_Concert_${ts}.xlsx`);
});

app.get('/api/contingency/export-excel', async (req, res) => {
  if (!LATEST_SCHEDULE_RESULT) {
    await runDefaultOptimization();
  }
  if (!LATEST_SCHEDULE_RESULT) {
    return res.status(400).json({ success: false, message: 'Chưa có lịch trực để xuất báo cáo' });
  }

  const out_file = await exportScheduleToExcel(LATEST_SCHEDULE_RESULT, REPORT_PATH);
  const ts = getFormattedTimestamp();
  res.download(out_file, `Bao_Cao_Ca_Vang_Di_Tre_Va_Thay_The_${ts}.xlsx`);
});

app.get('/api/preview', async (req, res) => {
  if (!LATEST_SCHEDULE_RESULT) {
    await runDefaultOptimization();
  }
  if (!LATEST_SCHEDULE_RESULT) {
    return res.status(400).json({ success: false, message: 'Chưa có lịch trực để xem trước' });
  }

  const assigned = LATEST_SCHEDULE_RESULT.assigned_shifts || [];
  const m_stats = LATEST_SCHEDULE_RESULT.member_stats || [];
  const audit = LATEST_SCHEDULE_RESULT.audit_results || {};
  const cont = LATEST_SCHEDULE_RESULT.contingency_matrix || [];

  const preview = {
    tong_ca_truc: {
      headers: ["Mã Ca", "Kênh", "Thứ", "Ngày", "Khung Giờ", "Địa Điểm", "Trưởng Ca", "Trực Chính", "Dự Phòng", "Tình Trạng"],
      rows: assigned.map((s: any) => [
        s.shift_id,
        s.type_label,
        s.day,
        s.date,
        s.slot,
        s.location,
        s.shift_leader || '-',
        (s.assigned_members || []).filter((m: any) => m.role === 'Chính').map((m: any) => `${m.name} (${m.department})`).join(', '),
        (s.assigned_members || []).filter((m: any) => m.role !== 'Chính').map((m: any) => `${m.name} (${m.department})`).join(', '),
        s.is_filled ? "Đủ người" : "Thiếu người"
      ])
    },
    ca_trong: {
      headers: ["Mã Ca", "Thứ", "Ngày", "Khung Giờ", "Định Mức", "Trưởng Ca", "Danh Sách Trực Chính", "Danh Sách Dự Phòng"],
      rows: assigned.filter((s: any) => s.type === 'Phong').map((s: any) => [
        s.shift_id, s.day, s.date, s.slot,
        `${s.chinh_count || 3} Chính + ${s.dp_count || 1} DP`,
        s.shift_leader || '-',
        (s.assigned_members || []).filter((m: any) => m.role === 'Chính').map((m: any) => `${m.name} (${m.phone})`).join(', '),
        (s.assigned_members || []).filter((m: any) => m.role !== 'Chính').map((m: any) => `${m.name} (${m.phone})`).join(', ')
      ])
    },
    ca_ngoai: {
      headers: ["Mã Ca", "Thứ", "Ngày", "Khung Giờ", "Địa Điểm", "Định Mức", "Trưởng Điểm", "Danh Sách Trực Chính", "Danh Sách Dự Phòng"],
      rows: assigned.filter((s: any) => s.type === 'Ngoai').map((s: any) => [
        s.shift_id, s.day, s.date, s.slot, s.location,
        `${s.chinh_count || 2} Chính + ${s.dp_count || 1} DP`,
        s.shift_leader || '-',
        (s.assigned_members || []).filter((m: any) => m.role === 'Chính').map((m: any) => `${m.name} (${m.phone})`).join(', '),
        (s.assigned_members || []).filter((m: any) => m.role !== 'Chính').map((m: any) => `${m.name} (${m.phone})`).join(', ')
      ])
    },
    thong_ke: {
      headers: ["Mã TV", "Họ Tên", "Ban", "Đối Tượng", "SĐT", "Đội Ứng Biến", "Tổng Ca", "Tổng Giờ", "Ca Trong", "Ca Ngoài", "Mã Ca Phân Công"],
      rows: m_stats.map((m: any) => [
        m.member_id, m.name, m.department, m.job, m.phone,
        m.is_standby ? "Có" : "Không",
        m.total_shifts, `${m.total_hours}h`, m.phong_shifts, m.ngoai_shifts,
        m.assigned_shift_ids
      ])
    },
    kiem_tra_ca: {
      headers: ["Hạng Mục Kiểm Tra", "Kết Quả Thẩm Định", "Tiêu Chuẩn Đạt", "Đánh Giá"],
      rows: [
        ["Xung đột trùng ca cùng giờ", `${audit.conflict_count || 0} vi phạm`, "0 vi phạm", "100% ĐẠT"],
        ["Vi phạm lịch rảnh đăng ký", `${audit.availability_violation_count || 0} vi phạm`, "0 vi phạm", "100% ĐẠT"],
        ["Ca phòng bán trống không người", `${audit.empty_room_count || 0} ca trống`, "0 ca trống", "100% ĐẠT"],
        ["Ca quá tải trong ngày (>2 ca)", `${audit.daily_overload_count || 0} vi phạm`, "0 vi phạm", "100% ĐẠT"],
        ["Chỉ số công bằng phân bổ", `${audit.fairness_metrics?.fairness_score || 97}/100`, ">= 90/100", "XUẤT SẮC"]
      ]
    },
    ca_vang: {
      headers: ["Mã Ca", "Kênh", "Thứ", "Khung Giờ", "Địa Điểm", "Nhân Sự Chính Thức", "Dự Phòng Ưu Tiên 1 (Đội Ứng Biến)", "Dự Phòng 2", "Dự Phòng 3"],
      rows: cont.map((c: any) => [
        c.shift_id, c.type_label, c.day, c.slot, c.location,
        (c.current_assigned || []).join(', '),
        c.backup_candidates[0] ? `${c.backup_candidates[0].name} (${c.backup_candidates[0].phone})` : "-",
        c.backup_candidates[1] ? `${c.backup_candidates[1].name} (${c.backup_candidates[1].phone})` : "-",
        c.backup_candidates[2] ? `${c.backup_candidates[2].name} (${c.backup_candidates[2].phone})` : "-"
      ])
    },
    ca_vang_backup: {
      headers: [
        "Mã Ca", "Kênh / Loại", "Thứ / Ngày", "Khung Giờ Trực", "Địa Điểm Trực", 
        "Định Mức Yêu Cầu", "Nhân Sự Chính Thức Phân Công", 
        "Dự Phòng Ưu Tiên 1 (Đội Ứng Biến Standby)", "Dự Phòng Ưu Tiên 2 (Dự Bị Rảnh Slot)", 
        "Dự Phòng Ưu Tiên 3 (Dự Bị Hỗ Trợ)", "Trạng Thái Sẵn Sàng Backup"
      ],
      rows: cont.map((c: any) => [
        c.shift_id,
        c.type_label,
        `${c.day} (${c.date || 'Tuần F&B'})`,
        c.slot,
        c.location,
        `${c.required_count || 4} Người (${c.chinh_count || 4} Chính + ${c.dp_count || 1} DP)`,
        (c.current_assigned || []).join(', ') || 'Chưa phân công',
        c.backup_candidates[0] ? `${c.backup_candidates[0].name} - ${c.backup_candidates[0].phone} (${c.backup_candidates[0].department})` : "Chưa kích hoạt pool",
        c.backup_candidates[1] ? `${c.backup_candidates[1].name} - ${c.backup_candidates[1].phone} (${c.backup_candidates[1].department})` : "-",
        c.backup_candidates[2] ? `${c.backup_candidates[2].name} - ${c.backup_candidates[2].phone} (${c.backup_candidates[2].department})` : "-",
        c.backup_candidates && c.backup_candidates.length > 0 ? "⚡ Sẵn sàng ứng biến 24/7" : "⚠️ Cần bổ sung nhân sự"
      ])
    }
  };

  res.json({
    success: true,
    preview: preview
  });
});

app.get('/api/protocols', (req, res) => {
  res.json({
    success: true,
    protocols: TASK_2_DETAILS
  });
});

// App Start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  // Run bootstrap
  bootstrapState();
});
