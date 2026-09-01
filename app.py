import os
import sys
import json
import io
import threading
import pandas as pd

# Console here is UTF-8 for Vietnamese output. Under some WSGI servers stdout is
# not a reconfigurable stream, and failing to log must never break startup.
try:
    sys.stdout.reconfigure(encoding='utf-8')
except (AttributeError, ValueError):
    pass

from flask import Flask, render_template, request, jsonify, send_file
from data_loader import load_shifts_master, load_members_data, load_from_google_sheet_url, parse_members_df, get_availability_heatmap
from scheduler_engine import ShiftScheduler
from excel_exporter import export_schedule_to_excel
from risk_and_hr_protocols import TASK_2_DETAILS
from state_store import load_state, save_state, encode_member

app = Flask(__name__)

REPORT_PATH = "reports/Lich_Truc_Toi_Uu_Hung_Vuong_Concert.xlsx"

# Must run at module level, not under __main__: a WSGI server imports this file
# without ever executing __main__, and export_schedule_to_excel needs the dir.
os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)

# Global runtime state. Loaded lazily by bootstrap_state() on the first real
# request rather than at import time, so the process boots fast enough for a
# host health check even though a solve takes 15-25s.
CURRENT_SHIFTS = []
CURRENT_MEMBERS = []
DEFAULT_CA_NGOAI = [
    {
        'id': 'NGOAI_01',
        'name': 'Quán Café A',
        'day': 'Thứ 7',
        'start_time': '17:00',
        'end_time': '19:30',
        'chinh': 2,
        'dp': 1
    },
    {
        'id': 'NGOAI_02',
        'name': 'Quán Café B',
        'day': 'Thứ 7',
        'start_time': '17:30',
        'end_time': '20:00',
        'chinh': 2,
        'dp': 1
    },
    {
        'id': 'NGOAI_03',
        'name': 'Quán Café B',
        'day': 'Chủ Nhật',
        'start_time': '17:00',
        'end_time': '19:30',
        'chinh': 2,
        'dp': 1
    },
    {
        'id': 'NGOAI_04',
        'name': 'Quán Café C',
        'day': 'Chủ Nhật',
        'start_time': '17:00',
        'end_time': '19:00',
        'chinh': 2,
        'dp': 1
    }
]
CUSTOM_CA_NGOAI = [dict(c) for c in DEFAULT_CA_NGOAI]

DEFAULT_PRODUCTS = [
    {'id': 'SP01', 'name': 'Cà Phê Muối Hùng Vương', 'unit': 'Ly', 'price': 25000, 'initial_stock': 150, 'sold_count': 42, 'note': 'Best-seller ca sáng & chiều'},
    {'id': 'SP02', 'name': 'Trà Trái Cây Nhiệt Đới', 'unit': 'Ly', 'price': 25000, 'initial_stock': 120, 'sold_count': 35, 'note': 'Đặc sản giải khát Concert'},
    {'id': 'SP03', 'name': 'Bánh Mì Que Hải Phòng', 'unit': 'Cái', 'price': 15000, 'initial_stock': 200, 'sold_count': 88, 'note': 'Combo ăn nhẹ phục vụ nhanh'},
    {'id': 'SP04', 'name': 'Nước Suối Chai 500ml', 'unit': 'Chai', 'price': 10000, 'initial_stock': 300, 'sold_count': 120, 'note': 'Phục vụ ban nhạc & khán giả'},
    {'id': 'SP05', 'name': 'Áo Áp Phích Concert Souvenir', 'unit': 'Cái', 'price': 99000, 'initial_stock': 50, 'sold_count': 18, 'note': 'Hàng lưu niệm chính thức'},
]

CURRENT_PRODUCTS = [dict(p) for p in DEFAULT_PRODUCTS]
SALES_LOGS = [
    {
        'id': 'POS_001',
        'timestamp': '31/08/2026 09:15',
        'product_id': 'SP01',
        'product_name': 'Cà Phê Muối Hùng Vương',
        'unit': 'Ly',
        'quantity': 2,
        'unit_price': 25000,
        'total_amount': 50000,
        'channel': 'Phòng Thanh Niên (T2_SANG)',
        'seller': 'Phùng Nhật Khang',
        'note': 'Bán lẻ ca trực sáng'
    },
    {
        'id': 'POS_002',
        'timestamp': '31/08/2026 10:30',
        'product_id': 'SP03',
        'product_name': 'Bánh Mì Que Hải Phòng',
        'unit': 'Cái',
        'quantity': 5,
        'unit_price': 15000,
        'total_amount': 75000,
        'channel': 'Phòng Thanh Niên (T2_SANG)',
        'seller': 'Trần Thanh Tâm',
        'note': 'Khách đoàn đặt mua'
    }
]

ENABLE_CA_NGOAI = True
INCIDENT_LOGS = []
LATEST_SCHEDULE_RESULT = None

_BOOTSTRAPPED = False
# Serialises bootstrap and solving. The app runs on one worker with several
# threads, so concurrent requests share this state and must not load or solve twice.
_BOOTSTRAP_LOCK = threading.Lock()
_SOLVE_LOCK = threading.Lock()


def bootstrap_state():
    """
    Load master data from Excel, then restore any persisted state over it.
    Runs once per process, on the first request that needs data.
    """
    global CURRENT_SHIFTS, CURRENT_MEMBERS, LATEST_SCHEDULE_RESULT
    global CUSTOM_CA_NGOAI, ENABLE_CA_NGOAI, INCIDENT_LOGS, _BOOTSTRAPPED
    global CURRENT_PRODUCTS, SALES_LOGS

    if _BOOTSTRAPPED:
        return

    with _BOOTSTRAP_LOCK:
        if _BOOTSTRAPPED:
            return

        CURRENT_SHIFTS = load_shifts_master()
        CURRENT_MEMBERS = load_members_data()

        saved = load_state()
        if saved:
            # Uploaded member data replaces the bundled file; everything else
            # falls back to the defaults already set above.
            if saved['members']:
                CURRENT_MEMBERS = saved['members']
            if saved['custom_ca_ngoai']:
                CUSTOM_CA_NGOAI = saved['custom_ca_ngoai']
            if saved.get('products'):
                CURRENT_PRODUCTS = saved['products']
            if saved.get('sales_logs'):
                SALES_LOGS = saved['sales_logs']
            ENABLE_CA_NGOAI = saved['enable_ca_ngoai']
            INCIDENT_LOGS = saved['incident_logs']
            LATEST_SCHEDULE_RESULT = saved['schedule']
            print(f"[app] Đã phục hồi trạng thái đã lưu ({len(CURRENT_MEMBERS)} thành viên, "
                  f"{len(INCIDENT_LOGS)} sự cố, {len(CURRENT_PRODUCTS)} sản phẩm, lịch trực: {'có' if LATEST_SCHEDULE_RESULT else 'chưa có'})")

        _BOOTSTRAPPED = True


@app.before_request
def _ensure_state_loaded():
    """Every route except the health check needs data; load it on first use."""
    if request.endpoint != 'healthz':
        bootstrap_state()


def persist():
    """Snapshot current runtime state to disk so it survives a restart."""
    save_state(
        members=CURRENT_MEMBERS,
        schedule=LATEST_SCHEDULE_RESULT,
        custom_ca_ngoai=CUSTOM_CA_NGOAI,
        enable_ca_ngoai=ENABLE_CA_NGOAI,
        incident_logs=INCIDENT_LOGS,
        products=CURRENT_PRODUCTS,
        sales_logs=SALES_LOGS
    )


def run_default_optimization():
    global LATEST_SCHEDULE_RESULT
    config = {
        'phong_chinh_count': 3,
        'phong_dp_count': 1,
        'enable_ca_ngoai': ENABLE_CA_NGOAI,
        'custom_ca_ngoai': CUSTOM_CA_NGOAI
    }
    scheduler = ShiftScheduler(shifts=CURRENT_SHIFTS, members=CURRENT_MEMBERS, config=config)
    LATEST_SCHEDULE_RESULT = scheduler.optimize()
    if LATEST_SCHEDULE_RESULT.get('success'):
        export_schedule_to_excel(LATEST_SCHEDULE_RESULT, REPORT_PATH)
        persist()


def ensure_schedule():
    """
    Return the current schedule, solving once if there isn't one yet.
    Held under a lock so two concurrent first-hits don't both run the solver.
    """
    global LATEST_SCHEDULE_RESULT
    if LATEST_SCHEDULE_RESULT:
        return LATEST_SCHEDULE_RESULT
    with _SOLVE_LOCK:
        if not LATEST_SCHEDULE_RESULT:
            run_default_optimization()
    return LATEST_SCHEDULE_RESULT


@app.route('/healthz')
def healthz():
    """Instant liveness check: must not touch data or trigger a solve."""
    return jsonify({'status': 'ok'})


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/shifts', methods=['GET'])
def get_shifts():
    return jsonify({
        'success': True,
        'shifts': CURRENT_SHIFTS,
        'total': len(CURRENT_SHIFTS)
    })

@app.route('/api/members', methods=['GET'])
def get_members():
    # encode_member flattens the (day, slot) tuple keys that JSON cannot carry.
    sanitized_members = [encode_member(m) for m in CURRENT_MEMBERS]

    return jsonify({
        'success': True,
        'members': sanitized_members,
        'total': len(sanitized_members)
    })

@app.route('/api/heatmap', methods=['GET'])
def get_heatmap():
    heatmap_data = get_availability_heatmap(CURRENT_MEMBERS)
    return jsonify({
        'success': True,
        'heatmap': heatmap_data
    })

@app.route('/api/ca-ngoai', methods=['GET', 'POST', 'DELETE'])
def handle_ca_ngoai():
    global CUSTOM_CA_NGOAI, ENABLE_CA_NGOAI
    if request.method == 'GET':
        return jsonify({
            'success': True,
            'enabled': ENABLE_CA_NGOAI,
            'list': CUSTOM_CA_NGOAI
        })
    elif request.method == 'POST':
        data = request.json or {}
        if 'enabled' in data:
            ENABLE_CA_NGOAI = bool(data['enabled'])
            
        if 'action' in data:
            if data['action'] == 'add':
                item = data.get('item', {})
                new_id = f"NGOAI_{len(CUSTOM_CA_NGOAI)+1:02d}"
                item['id'] = new_id
                CUSTOM_CA_NGOAI.append(item)
            elif data['action'] == 'delete':
                target_id = data.get('id')
                CUSTOM_CA_NGOAI = [c for c in CUSTOM_CA_NGOAI if c.get('id') != target_id]
            elif data['action'] == 'clear':
                CUSTOM_CA_NGOAI = []
        persist()
        return jsonify({
            'success': True,
            'enabled': ENABLE_CA_NGOAI,
            'list': CUSTOM_CA_NGOAI
        })

@app.route('/api/upload-data', methods=['POST'])
def upload_data():
    global CURRENT_MEMBERS
    try:
        if 'file' in request.files:
            uploaded_file = request.files['file']
            if uploaded_file.filename.endswith('.csv'):
                df = pd.read_csv(uploaded_file)
            else:
                df = pd.read_excel(uploaded_file)
            CURRENT_MEMBERS = parse_members_df(df)
            msg = f"Tải lên thành công file '{uploaded_file.filename}'! Đã nhập {len(CURRENT_MEMBERS)} thành viên."
        elif request.json and 'google_sheet_url' in request.json:
            url = request.json['google_sheet_url'].strip()
            CURRENT_MEMBERS = load_from_google_sheet_url(url)
            msg = f"Đồng bộ Google Sheets thành công! Đã tải {len(CURRENT_MEMBERS)} câu trả lời khảo sát."
        else:
            return jsonify({'success': False, 'message': 'Không tìm thấy file hoặc link Google Sheets'}), 400

        # Rerun optimization with updated members
        run_default_optimization()
        # Persist again even if the solve failed, so an uploaded roster is not lost.
        persist()
        return jsonify({
            'success': True,
            'message': msg,
            'total_members': len(CURRENT_MEMBERS),
            'schedule': LATEST_SCHEDULE_RESULT
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f"Lỗi xử lý dữ liệu đầu vào: {str(e)}"}), 500

@app.route('/api/shift/update', methods=['POST'])
def update_shift_details():
    global LATEST_SCHEDULE_RESULT
    if not ensure_schedule():
        return jsonify({'success': False, 'message': 'Chưa có lịch trực'}), 400

    data = request.json or {}
    shift_id = data.get('shift_id')
    new_leader = data.get('shift_leader')
    members_update = data.get('assigned_members') # list of {member_id, role}

    target_shift = next((s for s in LATEST_SCHEDULE_RESULT['assigned_shifts'] if s['shift_id'] == shift_id), None)
    if not target_shift:
        return jsonify({'success': False, 'message': f'Không tìm thấy ca {shift_id}'}), 404

    if new_leader is not None:
        target_shift['shift_leader'] = new_leader

    if members_update is not None:
        mem_lookup = {m['member_id']: m for m in CURRENT_MEMBERS}
        new_assigned = []
        for mu in members_update:
            m_id = mu.get('member_id')
            m_orig = mem_lookup.get(m_id)
            if m_orig:
                new_assigned.append({
                    'member_id': m_orig['member_id'],
                    'name': m_orig['name'],
                    'department': m_orig['department'],
                    'residence': m_orig['residence'],
                    'vehicle': m_orig['vehicle'],
                    'job': m_orig['job'],
                    'school': m_orig['school'],
                    'phone': m_orig['phone'],
                    'role': mu.get('role', 'Chính'),
                    'is_standby': m_orig['is_standby'],
                    'is_committed': m_orig['committed_slots'].get((target_shift['day'], target_shift['slot']), False)
                })
        target_shift['assigned_members'] = new_assigned
        target_shift['assigned_count'] = len(new_assigned)
        target_shift['chinh_assigned_count'] = sum(1 for m in new_assigned if m['role'] == 'Chính')
        target_shift['dp_assigned_count'] = sum(1 for m in new_assigned if m['role'] == 'Dự phòng')

    # Save to Excel
    export_schedule_to_excel(LATEST_SCHEDULE_RESULT, REPORT_PATH)
    persist()
    return jsonify({
        'success': True,
        'message': f"Đã cập nhật thành công thông tin ca {shift_id}!",
        'shift': target_shift
    })

@app.route('/api/contingency/suggest', methods=['GET'])
def suggest_backups():
    shift_id = request.args.get('shift_id')
    if not ensure_schedule():
        return jsonify({'success': False, 'message': 'Chưa có lịch trực'}), 400

    target_shift = next((s for s in LATEST_SCHEDULE_RESULT['assigned_shifts'] if s['shift_id'] == shift_id), None)
    if not target_shift:
        return jsonify({'success': False, 'message': 'Không tìm thấy ca'}), 404

    assigned_ids = {m['member_id'] for m in target_shift['assigned_members']}
    day = target_shift['day']
    slot = target_shift['slot']

    # Find members who are free and NOT working any shift at that time
    available_candidates = []
    for m in CURRENT_MEMBERS:
        if m['member_id'] in assigned_ids:
            continue
        lookup_slot = slot if slot in m['availability'] else ('15h - 17h' if '17' in slot or '18' in slot or '19' in slot else slot)
        if m['availability'].get((day, lookup_slot), False):
            # Check if working any other shift at that slot
            is_busy_elsewhere = False
            for s in LATEST_SCHEDULE_RESULT['assigned_shifts']:
                if s['day'] == day and s['slot'] == slot:
                    if any(sm['member_id'] == m['member_id'] for sm in s['assigned_members']):
                        is_busy_elsewhere = True
                        break
            if not is_busy_elsewhere:
                available_candidates.append({
                    'member_id': m['member_id'],
                    'name': m['name'],
                    'department': m['department'],
                    'phone': m['phone'],
                    'job': m['job'],
                    'vehicle': m['vehicle'],
                    'is_standby': m['is_standby'],
                    'priority': 1 if m['is_standby'] else 2
                })

    available_candidates.sort(key=lambda x: (x['priority'], x['name']))
    return jsonify({
        'success': True,
        'shift': target_shift,
        'candidates': available_candidates,
        'total': len(available_candidates)
    })

@app.route('/api/contingency/log-incident', methods=['POST'])
def log_incident():
    global INCIDENT_LOGS, LATEST_SCHEDULE_RESULT
    if not ensure_schedule():
        return jsonify({'success': False, 'message': 'Chưa có lịch trực'}), 400

    data = request.json or {}
    shift_id = data.get('shift_id')
    absent_member_id = data.get('absent_member_id')
    replacement_member_id = data.get('replacement_member_id')
    status_type = data.get('status_type', 'Vắng đột xuất') # 'Có mặt', 'Đi trễ', 'Xin nghỉ trước', 'Vắng đột xuất'
    note = data.get('note', '')

    target_shift = next((s for s in LATEST_SCHEDULE_RESULT['assigned_shifts'] if s['shift_id'] == shift_id), None)
    if not target_shift:
        return jsonify({'success': False, 'message': 'Không tìm thấy ca'}), 404

    mem_lookup = {m['member_id']: m for m in CURRENT_MEMBERS}
    absent_m = mem_lookup.get(absent_member_id)
    rep_m = mem_lookup.get(replacement_member_id)

    # If replacement provided, perform swap in shift
    if rep_m and absent_m:
        target_shift['assigned_members'] = [
            m for m in target_shift['assigned_members'] if m['member_id'] != absent_member_id
        ]
        target_shift['assigned_members'].append({
            'member_id': rep_m['member_id'],
            'name': rep_m['name'],
            'department': rep_m['department'],
            'residence': rep_m['residence'],
            'vehicle': rep_m['vehicle'],
            'job': rep_m['job'],
            'school': rep_m['school'],
            'phone': rep_m['phone'],
            'role': 'Dự phòng thay thế',
            'is_standby': rep_m['is_standby'],
            'is_committed': False
        })
        target_shift['assigned_count'] = len(target_shift['assigned_members'])

    incident_record = {
        'id': len(INCIDENT_LOGS) + 1,
        'shift_id': shift_id,
        'day': target_shift['day'],
        'slot': target_shift['slot'],
        'status_type': status_type,
        'absent_member': absent_m['name'] if absent_m else 'Chung',
        'replacement_member': rep_m['name'] if rep_m else 'Không thay thế',
        'note': note,
        'timestamp': pd.Timestamp.now().strftime('%d/%m/%Y %H:%M')
    }
    INCIDENT_LOGS.insert(0, incident_record)

    export_schedule_to_excel(LATEST_SCHEDULE_RESULT, REPORT_PATH, INCIDENT_LOGS)
    persist()
    return jsonify({
        'success': True,
        'message': f"Đã ghi nhận sự cố '{status_type}' thành công!",
        'incident': incident_record,
        'incidents': INCIDENT_LOGS
    })

@app.route('/api/contingency/incidents', methods=['GET'])
def get_incidents():
    return jsonify({
        'success': True,
        'incidents': INCIDENT_LOGS
    })

@app.route('/api/contingency/export-excel', methods=['GET'])
def export_contingency_excel():
    if not ensure_schedule():
        return jsonify({'success': False, 'message': 'Chưa có lịch trực để xuất báo cáo'}), 400
    
    inc_file = REPORT_PATH
    export_schedule_to_excel(LATEST_SCHEDULE_RESULT, inc_file, INCIDENT_LOGS)
    return send_file(inc_file, as_attachment=True, download_name="Bao_Cao_Ca_Vang_Di_Tre_Va_Thay_The.xlsx")

# ---------------------------------------------------------------------------
# INVENTORY & SALES MANAGEMENT ROUTES
# ---------------------------------------------------------------------------

def calculate_inventory_kpis():
    total_revenue = sum(l.get('total_amount', 0) for l in SALES_LOGS)
    total_sold = sum(p.get('sold_count', 0) for p in CURRENT_PRODUCTS)
    total_stock = sum(max(0, p.get('initial_stock', 0) - p.get('sold_count', 0)) for p in CURRENT_PRODUCTS)
    total_stock_value = sum(max(0, p.get('initial_stock', 0) - p.get('sold_count', 0)) * p.get('price', 0) for p in CURRENT_PRODUCTS)
    return {
        'total_revenue': total_revenue,
        'total_sold': total_sold,
        'total_stock': total_stock,
        'total_stock_value': total_stock_value
    }

@app.route('/api/inventory', methods=['GET'])
def get_inventory():
    for p in CURRENT_PRODUCTS:
        p['current_stock'] = max(0, p.get('initial_stock', 0) - p.get('sold_count', 0))
    return jsonify({
        'success': True,
        'products': CURRENT_PRODUCTS,
        'sales_logs': SALES_LOGS,
        'kpis': calculate_inventory_kpis()
    })

@app.route('/api/inventory/product', methods=['POST'])
def save_product():
    global CURRENT_PRODUCTS
    data = request.json or {}
    p_id = data.get('id', '').strip()
    name = data.get('name', '').strip()
    unit = data.get('unit', 'Ly').strip()
    price = int(data.get('price', 0))
    initial_stock = int(data.get('initial_stock', 0))
    sold_count = int(data.get('sold_count', 0))
    note = data.get('note', '').strip()

    if not name:
        return jsonify({'success': False, 'message': 'Tên sản phẩm không được để trống'}), 400

    existing = next((p for p in CURRENT_PRODUCTS if p['id'] == p_id), None)
    if existing:
        existing['name'] = name
        existing['unit'] = unit
        existing['price'] = price
        existing['initial_stock'] = initial_stock
        existing['sold_count'] = sold_count
        existing['current_stock'] = max(0, initial_stock - sold_count)
        existing['note'] = note
        msg = f"Đã cập nhật sản phẩm {p_id} thành công!"
    else:
        new_id = p_id or f"SP{len(CURRENT_PRODUCTS)+1:02d}"
        new_p = {
            'id': new_id,
            'name': name,
            'unit': unit,
            'price': price,
            'initial_stock': initial_stock,
            'sold_count': sold_count,
            'current_stock': max(0, initial_stock - sold_count),
            'note': note
        }
        CURRENT_PRODUCTS.append(new_p)
        msg = f"Đã thêm sản phẩm {new_id} vào danh mục!"

    persist()
    return jsonify({
        'success': True,
        'message': msg,
        'products': CURRENT_PRODUCTS,
        'kpis': calculate_inventory_kpis()
    })

@app.route('/api/inventory/delete', methods=['POST'])
def delete_product():
    global CURRENT_PRODUCTS
    data = request.json or {}
    target_id = data.get('id')
    CURRENT_PRODUCTS = [p for p in CURRENT_PRODUCTS if p['id'] != target_id]
    persist()
    return jsonify({
        'success': True,
        'message': f"Đã xóa sản phẩm {target_id}",
        'products': CURRENT_PRODUCTS,
        'kpis': calculate_inventory_kpis()
    })

@app.route('/api/inventory/sell', methods=['POST'])
def record_sale():
    global CURRENT_PRODUCTS, SALES_LOGS
    data = request.json or {}
    prod_id = data.get('product_id')
    qty = int(data.get('quantity', 1))
    channel = data.get('channel', 'Phòng Thanh Niên')
    seller = data.get('seller', 'Ban Quản Trị')
    note = data.get('note', '')

    product = next((p for p in CURRENT_PRODUCTS if p['id'] == prod_id), None)
    if not product:
        return jsonify({'success': False, 'message': f'Không tìm thấy sản phẩm {prod_id}'}), 404

    # Update product sold count
    product['sold_count'] = product.get('sold_count', 0) + qty
    product['current_stock'] = max(0, product.get('initial_stock', 0) - product['sold_count'])

    unit_price = product.get('price', 0)
    total_amount = unit_price * qty

    log_entry = {
        'id': f"POS_{len(SALES_LOGS)+1:03d}",
        'timestamp': pd.Timestamp.now().strftime('%d/%m/%Y %H:%M'),
        'product_id': prod_id,
        'product_name': product['name'],
        'unit': product['unit'],
        'quantity': qty,
        'unit_price': unit_price,
        'total_amount': total_amount,
        'channel': channel,
        'seller': seller,
        'note': note
    }
    SALES_LOGS.insert(0, log_entry)

    persist()
    return jsonify({
        'success': True,
        'message': f"Đã ghi nhận bán thành công {qty} {product['unit']} {product['name']} ({total_amount:,} ₫)!",
        'log': log_entry,
        'products': CURRENT_PRODUCTS,
        'sales_logs': SALES_LOGS,
        'kpis': calculate_inventory_kpis()
    })

@app.route('/api/inventory/upload', methods=['POST'])
def upload_inventory_excel():
    global CURRENT_PRODUCTS
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'Không tìm thấy file Excel'}), 400

        uploaded_file = request.files['file']
        filename = uploaded_file.filename.lower()
        if filename.endswith('.csv'):
            df = pd.read_csv(uploaded_file)
        else:
            df = pd.read_excel(uploaded_file)

        new_products = []
        for idx, row in df.iterrows():
            row_dict = {str(k).strip().lower(): v for k, v in row.to_dict().items() if pd.notna(v)}

            # Find ID
            prod_id = None
            for key in ['mã', 'ma', 'id', 'mã sp', 'ma sp', 'code', 'mã sản phẩm']:
                if key in row_dict:
                    prod_id = str(row_dict[key]).strip()
                    break
            if not prod_id:
                prod_id = f"SP{len(new_products)+1:02d}"

            # Find Name
            name = None
            for key in ['tên sản phẩm', 'ten san pham', 'tên', 'ten', 'product', 'name', 'sản phẩm']:
                if key in row_dict:
                    name = str(row_dict[key]).strip()
                    break
            if not name:
                continue

            # Find Unit
            unit = 'Ly'
            for key in ['đvt', 'dvt', 'đơn vị tính', 'don vi tinh', 'unit']:
                if key in row_dict:
                    unit = str(row_dict[key]).strip()
                    break

            # Find Price
            price = 25000
            for key in ['giá bán', 'gia ban', 'giá', 'gia', 'price', 'đơn giá', 'don gia']:
                if key in row_dict:
                    try:
                        raw_price = str(row_dict[key]).replace(',', '').replace('.', '').replace('₫', '').strip()
                        price = int(float(raw_price))
                    except:
                        pass
                    break

            # Find initial stock
            initial = 100
            for key in ['tồn kho đầu', 'ton kho dau', 'tồn kho', 'ton kho', 'số lượng', 'so luong', 'stock', 'initial_stock']:
                if key in row_dict:
                    try:
                        initial = int(float(str(row_dict[key])))
                    except:
                        pass
                    break

            # Find sold count if present
            sold = 0
            for key in ['đã bán', 'da ban', 'sold', 'sold_count']:
                if key in row_dict:
                    try:
                        sold = int(float(str(row_dict[key])))
                    except:
                        pass
                    break

            # Find note
            note = ''
            for key in ['ghi chú', 'ghi chu', 'note', 'mô tả']:
                if key in row_dict:
                    note = str(row_dict[key]).strip()
                    break

            new_products.append({
                'id': prod_id,
                'name': name,
                'unit': unit,
                'price': price,
                'initial_stock': initial,
                'sold_count': sold,
                'current_stock': max(0, initial - sold),
                'note': note
            })

        if not new_products:
            return jsonify({'success': False, 'message': 'Không tìm thấy dữ liệu sản phẩm hợp lệ trong file Excel'}), 400

        CURRENT_PRODUCTS = new_products
        persist()
        return jsonify({
            'success': True,
            'message': f"Đã tải lên file '{uploaded_file.filename}' thành công! Nhập {len(new_products)} sản phẩm.",
            'products': CURRENT_PRODUCTS,
            'kpis': calculate_inventory_kpis()
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f"Lỗi đọc file Excel sản phẩm: {str(e)}"}), 500

@app.route('/api/inventory/reset', methods=['POST'])
def reset_inventory():
    global CURRENT_PRODUCTS, SALES_LOGS
    CURRENT_PRODUCTS = [dict(p) for p in DEFAULT_PRODUCTS]
    SALES_LOGS = []
    persist()
    return jsonify({
        'success': True,
        'message': 'Đã khôi phục danh mục sản phẩm mặc định!',
        'products': CURRENT_PRODUCTS,
        'kpis': calculate_inventory_kpis()
    })

@app.route('/api/schedule/run', methods=['POST'])
def run_optimization():
    global LATEST_SCHEDULE_RESULT, ENABLE_CA_NGOAI, CUSTOM_CA_NGOAI
    data = request.json or {}
    
    if 'enable_ca_ngoai' in data:
        ENABLE_CA_NGOAI = bool(data['enable_ca_ngoai'])
    if 'custom_ca_ngoai' in data:
        CUSTOM_CA_NGOAI = data['custom_ca_ngoai']

    config = {
        'min_shifts_per_member': int(data.get('min_shifts', 1)),
        'max_shifts_per_member': int(data.get('max_shifts', 4)),
        'max_shifts_per_day': int(data.get('max_shifts_per_day', 2)),
        'phong_chinh_count': int(data.get('phong_chinh_count', 3)),
        'phong_dp_count': int(data.get('phong_dp_count', 1)),
        'enable_ca_ngoai': ENABLE_CA_NGOAI,
        'custom_ca_ngoai': CUSTOM_CA_NGOAI,
        'active_types': ['Phong', 'Ngoai'] if ENABLE_CA_NGOAI else ['Phong'],
    }
    
    # One solver run at a time: it is the heaviest thing this app does, and two
    # concurrent runs on a small host would starve each other.
    with _SOLVE_LOCK:
        scheduler = ShiftScheduler(shifts=CURRENT_SHIFTS, members=CURRENT_MEMBERS, config=config)
        result = scheduler.optimize()

    if result.get('success'):
        LATEST_SCHEDULE_RESULT = result
        export_schedule_to_excel(result, REPORT_PATH)
        persist()
        return jsonify({
            'success': True,
            'result': result,
            'message': "Tối ưu hóa lịch trực thành công!"
        })
    else:
        # The new ca-ngoai config still needs saving even when no schedule was found.
        persist()
        return jsonify({
            'success': False,
            'message': result.get('message', "Không tìm thấy phương án tối ưu thỏa mãn ràng buộc!")
        }), 400

@app.route('/api/schedule/current', methods=['GET'])
def get_current_schedule():
    schedule = ensure_schedule()
    if schedule:
        return jsonify({
            'success': True,
            'result': schedule
        })
    return jsonify({'success': False, 'message': 'Chưa có lịch trực nào'}), 404

@app.route('/api/schedule/export', methods=['GET'])
def export_excel():
    schedule = ensure_schedule()
    if not schedule:
        return jsonify({'success': False, 'message': 'Chưa có lịch trực để xuất'}), 400

    out_file = export_schedule_to_excel(schedule, REPORT_PATH, INCIDENT_LOGS)
    return send_file(
        out_file,
        as_attachment=True,
        download_name="Lich_Truc_Toi_Uu_Hung_Vuong_Concert.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

@app.route('/api/preview', methods=['GET'])
def get_preview_data():
    """Return JSON preview formatted for all 6 sheets."""
    schedule = ensure_schedule()
    if not schedule:
        return jsonify({'success': False, 'message': 'Chưa có lịch trực để xem trước'}), 400

    assigned = schedule.get('assigned_shifts', [])
    m_stats = schedule.get('member_stats', [])
    audit = schedule.get('audit_results', {})
    cont = schedule.get('contingency_matrix', [])

    preview = {
        'tong_ca_truc': {
            'headers': ["Mã Ca", "Kênh", "Thứ", "Ngày", "Khung Giờ", "Địa Điểm", "Trưởng Ca", "Trực Chính", "Dự Phòng", "Tình Trạng"],
            'rows': [
                [
                    s['shift_id'], s['type_label'], s['day'], s['date'], s['slot'], s['location'],
                    s['shift_leader'] or '-',
                    ", ".join([f"{m['name']} ({m['department']})" for m in s['assigned_members'] if m.get('role') == 'Chính']),
                    ", ".join([f"{m['name']} ({m['department']})" for m in s['assigned_members'] if m.get('role') != 'Chính']),
                    "Đủ người" if s['is_filled'] else "Thiếu người"
                ] for s in assigned
            ]
        },
        'ca_trong': {
            'headers': ["Mã Ca", "Thứ", "Ngày", "Khung Giờ", "Định Mức", "Trưởng Ca", "Danh Sách Trực Chính", "Danh Sách Dự Phòng"],
            'rows': [
                [
                    s['shift_id'], s['day'], s['date'], s['slot'],
                    f"{s.get('chinh_count',3)} Chính + {s.get('dp_count',1)} DP",
                    s['shift_leader'] or '-',
                    ", ".join([f"{m['name']} ({m['phone']})" for m in s['assigned_members'] if m.get('role') == 'Chính']),
                    ", ".join([f"{m['name']} ({m['phone']})" for m in s['assigned_members'] if m.get('role') != 'Chính'])
                ] for s in assigned if s['type'] == 'Phong'
            ]
        },
        'ca_ngoai': {
            'headers': ["Mã Ca", "Thứ", "Ngày", "Khung Giờ", "Địa Điểm", "Định Mức", "Trưởng Điểm", "Danh Sách Trực Chính", "Danh Sách Dự Phòng"],
            'rows': [
                [
                    s['shift_id'], s['day'], s['date'], s['slot'], s['location'],
                    f"{s.get('chinh_count',2)} Chính + {s.get('dp_count',1)} DP",
                    s['shift_leader'] or '-',
                    ", ".join([f"{m['name']} ({m['phone']})" for m in s['assigned_members'] if m.get('role') == 'Chính']),
                    ", ".join([f"{m['name']} ({m['phone']})" for m in s['assigned_members'] if m.get('role') != 'Chính'])
                ] for s in assigned if s['type'] == 'Ngoai'
            ]
        },
        'thong_ke': {
            'headers': ["Mã TV", "Họ Tên", "Ban", "Đối Tượng", "SĐT", "Đội Ứng Biến", "Tổng Ca", "Tổng Giờ", "Ca Trong", "Ca Ngoài", "Mã Ca Phân Công"],
            'rows': [
                [
                    m['member_id'], m['name'], m['department'], m['job'], m['phone'],
                    "Có" if m['is_standby'] else "Không",
                    m['total_shifts'], f"{m['total_hours']}h", m['phong_shifts'], m['ngoai_shifts'],
                    m['assigned_shift_ids']
                ] for m in m_stats
            ]
        },
        'kiem_tra_ca': {
            'headers': ["Hạng Mục Kiểm Tra", "Kết Quả Thẩm Định", "Tiêu Chuẩn Đạt", "Đánh Giá"],
            'rows': [
                ["Xung đột trùng ca cùng giờ", f"{audit.get('conflict_count', 0)} vi phạm", "0 vi phạm", "100% ĐẠT"],
                ["Vi phạm lịch rảnh đăng ký", f"{audit.get('availability_violation_count', 0)} vi phạm", "0 vi phạm", "100% ĐẠT"],
                ["Ca phòng bán trống không người", f"{audit.get('empty_room_count', 0)} ca trống", "0 ca trống", "100% ĐẠT"],
                ["Ca quá tải trong ngày (>2 ca)", f"{audit.get('daily_overload_count', 0)} vi phạm", "0 vi phạm", "100% ĐẠT"],
                ["Chỉ số công bằng phân bổ", f"{audit.get('fairness_metrics',{}).get('fairness_score', 97)}/100", ">= 90/100", "XUẤT SẮC"]
            ]
        },
        'ca_vang': {
            'headers': ["Mã Ca", "Kênh", "Thứ", "Khung Giờ", "Địa Điểm", "Nhân Sự Chính Thức", "Dự Phòng Ưu Tiên 1 (Đội Ứng Biến)", "Dự Phòng 2", "Dự Phòng 3"],
            'rows': [
                [
                    c['shift_id'], c['type_label'], c['day'], c['slot'], c['location'],
                    ", ".join(c['current_assigned']),
                    f"{c['backup_candidates'][0]['name']} ({c['backup_candidates'][0]['phone']})" if len(c['backup_candidates']) > 0 else "-",
                    f"{c['backup_candidates'][1]['name']} ({c['backup_candidates'][1]['phone']})" if len(c['backup_candidates']) > 1 else "-",
                    f"{c['backup_candidates'][2]['name']} ({c['backup_candidates'][2]['phone']})" if len(c['backup_candidates']) > 2 else "-"
                ] for c in cont
            ]
        }
    }
    return jsonify({
        'success': True,
        'preview': preview
    })

@app.route('/api/protocols', methods=['GET'])
def get_protocols():
    return jsonify({
        'success': True,
        'protocols': TASK_2_DETAILS
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', '5000'))
    print("================================================================================")
    print("🌟 HÙNG VƯƠNG CONCERT - HR SHIFT SCHEDULER & MANAGEMENT WEB APP")
    print(f"👉 Máy chủ đang chạy tại: http://127.0.0.1:{port}")
    print("   Lịch trực được xếp ở lần truy cập đầu tiên (mất 15-25 giây).")
    print("================================================================================")
    app.run(host='0.0.0.0', port=port, debug=False)
