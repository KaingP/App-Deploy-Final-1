import re
import os
import io
import urllib.request
import pandas as pd
import numpy as np

DAY_MAP = {
    'thứ 2': 'Thứ 2',
    'thứ hai': 'Thứ 2',
    't2': 'Thứ 2',
    'thứ 3': 'Thứ 3',
    'thứ ba': 'Thứ 3',
    't3': 'Thứ 3',
    'thứ 4': 'Thứ 4',
    'thứ tư': 'Thứ 4',
    't4': 'Thứ 4',
    'thứ 5': 'Thứ 5',
    'thứ năm': 'Thứ 5',
    't5': 'Thứ 5',
    'thứ 6': 'Thứ 6',
    'thứ sáu': 'Thứ 6',
    't6': 'Thứ 6',
    'thứ 7': 'Thứ 7',
    'thứ bảy': 'Thứ 7',
    't7': 'Thứ 7',
    'chủ nhật': 'Chủ Nhật',
    'cn': 'Chủ Nhật',
}

SLOT_KEYS = [
    '7h - 9h',
    '9h - 11h',
    '11h - 13h',
    '13h - 15h',
    '15h - 17h'  # or 15h - 18h
]

DAYS_LIST = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật']

def parse_days_from_text(text):
    if not isinstance(text, str) or pd.isna(text):
        return set()
    text_lower = text.lower().strip()
    if 'không rảnh' in text_lower or 'ko rảnh' in text_lower or 'bận' in text_lower:
        return set()
    
    days = set()
    for raw_k, standard_day in DAY_MAP.items():
        pattern = r'\b' + re.escape(raw_k) + r'\b'
        if re.search(pattern, text_lower):
            days.add(standard_day)
    return days

def normalize_time_slot(start_time, end_time):
    """Normalize start and end time into standard slot label."""
    s_str = str(start_time).strip()
    e_str = str(end_time).strip()
    
    if '07:' in s_str or s_str.startswith('7:'):
        return '7h - 9h'
    elif '09:' in s_str or s_str.startswith('9:'):
        return '9h - 11h'
    elif '11:' in s_str:
        return '11h - 13h'
    elif '13:' in s_str:
        return '13h - 15h'
    elif '15:' in s_str:
        return '15h - 17h'
    elif '17:' in s_str or '17h' in s_str:
        return '17h - 19h30'
    return f"{s_str} - {e_str}"

def load_shifts_master(file_path="Danh_sach_ca.xlsx"):
    """Load master list of shifts from Danh_sach_ca.xlsx."""
    if not os.path.exists(file_path):
        return []
    df_ca = pd.read_excel(file_path, sheet_name='CaTruc')
    shifts = []
    
    for idx, row in df_ca.iterrows():
        shift_id = str(row['Mã ca']).strip()
        shift_type = str(row['Loại']).strip() # 'Phong' or 'Ngoai'
        day_name = str(row['Thứ']).strip()
        date_val = str(row['Ngày']).strip()
        location = str(row['Điểm bán']).strip()
        start_t = row['Bắt đầu']
        end_t = row['Kết thúc']
        slot = normalize_time_slot(start_t, end_t)
        
        try:
            req_count = int(row['Số người trực'])
        except (ValueError, TypeError):
            req_count = 3
            
        shifts.append({
            'shift_id': shift_id,
            'type': 'Phong' if 'phong' in shift_type.lower() else 'Ngoai',
            'type_label': 'Phòng Thanh Niên' if 'phong' in shift_type.lower() else 'Điểm bán ngoài',
            'day': day_name,
            'date': date_val,
            'location': location if location and location != 'nan' else ('Phòng Thanh Niên' if 'phong' in shift_type.lower() else 'Điểm bán ngoài'),
            'start_time': str(start_t)[:5] if len(str(start_t)) >= 5 else str(start_t),
            'end_time': str(end_t)[:5] if len(str(end_t)) >= 5 else str(end_t),
            'slot': slot,
            'required_count': req_count,
            'backup_count': 1,
            'active': True,
            'note': str(row['Ghi chú']) if pd.notna(row['Ghi chú']) and str(row['Ghi chú']) != 'nan' else ''
        })
    return shifts

def parse_members_df(df):
    """Parse DataFrame of member survey responses into normalized member list."""
    members = []
    
    slot_col_map = {}
    commit_col_map = {}
    
    for col in df.columns:
        col_clean = str(col).strip()
        if 'Lịch rảnh' in col_clean:
            if '7h' in col_clean:
                slot_col_map['7h - 9h'] = col
            elif '9h' in col_clean:
                slot_col_map['9h - 11h'] = col
            elif '11h' in col_clean:
                slot_col_map['11h - 13h'] = col
            elif '13h' in col_clean:
                slot_col_map['13h - 15h'] = col
            elif '15h' in col_clean:
                slot_col_map['15h - 17h'] = col
                
        if 'cam kết' in col_clean.lower():
            if '7h' in col_clean:
                commit_col_map['7h - 9h'] = col
            elif '9h' in col_clean:
                commit_col_map['9h - 11h'] = col
            elif '11h' in col_clean:
                commit_col_map['11h - 13h'] = col
            elif '13h' in col_clean:
                commit_col_map['13h - 15h'] = col
            elif '15h' in col_clean:
                commit_col_map['15h - 17h'] = col

    for idx, row in df.iterrows():
        member_id = f"TV{idx+1:03d}"
        name = str(row.get('Họ và tên của bạn?', row.get('Họ và tên', f'Thành viên {idx+1}'))).strip()
        dept = str(row.get('Bạn là thành viên của ban?', row.get('Ban', 'Ban Sự kiện'))).strip()
        residence = str(row.get('Nơi sinh sống của bạn', row.get('Nơi sinh sống', 'Bình Dương'))).strip()
        vehicle = str(row.get('Phương tiện di chuyển bạn thường sử dụng?', row.get('Phương tiện', 'Xe máy'))).strip()
        job = str(row.get('Công việc hiện tại', 'Học sinh ( Cấp 3 )')).strip()
        school = str(row.get('Bạn đang là học sinh trường THPT nào?', '')).strip() if pd.notna(row.get('Bạn đang là học sinh trường THPT nào?')) else ''
        
        phone_val = str(row.get('Số điện thoại', row.get('SĐT', '0900000000'))).strip()
        if phone_val.endswith('.0'):
            phone_val = phone_val[:-2]
        if len(phone_val) == 9 and not phone_val.startswith('0'):
            phone_val = '0' + phone_val
            
        flexible_resp = str(row.get('Nếu có nhiều thời gian, bạn có cân nhắc tham gia vào "Đội ứng biến linh hoạt" không?', row.get('Đội ứng biến', ''))).strip().lower()
        is_standby = 'có' in flexible_resp or 'yes' in flexible_resp
        
        # Parse free slots
        availability = {}
        committed_slots = {}
        
        for slot_name, col_name in slot_col_map.items():
            free_days = parse_days_from_text(row.get(col_name, ''))
            for d in DAYS_LIST:
                availability[(d, slot_name)] = (d in free_days)
                
        for slot_name, col_name in commit_col_map.items():
            commit_days = parse_days_from_text(row.get(col_name, ''))
            for d in DAYS_LIST:
                committed_slots[(d, slot_name)] = (d in commit_days)
                if d in commit_days:
                    availability[(d, slot_name)] = True

        total_free_slots = sum(1 for v in availability.values() if v)
        if 'học sinh' in job.lower():
            max_shifts = min(5, max(2, total_free_slots // 3))
            min_shifts = 1
        elif 'sinh viên' in job.lower():
            max_shifts = min(6, max(2, total_free_slots // 2))
            min_shifts = 2
        else:
            max_shifts = min(4, max(1, total_free_slots // 4))
            min_shifts = 1

        members.append({
            'member_id': member_id,
            'name': name,
            'department': dept,
            'residence': residence,
            'vehicle': vehicle,
            'job': job,
            'school': school,
            'phone': phone_val,
            'is_standby': is_standby,
            'availability': availability,
            'committed_slots': committed_slots,
            'total_free_slots': total_free_slots,
            'min_shifts': min_shifts,
            'max_shifts': max_shifts
        })
        
    return members

def load_members_data(file_path="Danh_sach_dang_ky_truc_ca_50_nguoi.xlsx"):
    """Load members availability and profiles from Excel file."""
    if not os.path.exists(file_path):
        return []
    df = pd.read_excel(file_path)
    return parse_members_df(df)

def load_from_google_sheet_url(sheet_url):
    """
    Fetch and parse data directly from a public or shared Google Sheets link.
    Supports formats:
    - https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit#gid={GID}
    - https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=csv
    """
    # Extract spreadsheet ID
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", sheet_url)
    if not match:
        raise ValueError("URL Google Sheet không hợp lệ! Vui lòng cung cấp link dạng: https://docs.google.com/spreadsheets/d/{ID}/...")
    
    sheet_id = match.group(1)
    
    # Extract gid if present
    gid_match = re.search(r"[#&?]gid=([0-9]+)", sheet_url)
    gid = gid_match.group(1) if gid_match else "0"
    
    export_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
    
    req = urllib.request.Request(
        export_url,
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    )
    
    with urllib.request.urlopen(req, timeout=15) as response:
        csv_bytes = response.read()
        df = pd.read_csv(io.BytesIO(csv_bytes))
        
    return parse_members_df(df)

def get_availability_heatmap(members):
    """
    Calculate 2D Heatmap of free members count for each Day x Slot.
    Returns matrix data suitable for frontend heatmap rendering.
    """
    slots = ['7h - 9h', '9h - 11h', '11h - 13h', '13h - 15h', '15h - 17h']
    total_members = len(members) if members else 1
    
    heatmap = []
    for day in DAYS_LIST:
        day_row = {
            'day': day,
            'slots': []
        }
        for slot in slots:
            free_members = []
            for m in members:
                if m['availability'].get((day, slot), False):
                    free_members.append({
                        'member_id': m['member_id'],
                        'name': m['name'],
                        'department': m['department'],
                        'phone': m['phone'],
                        'job': m['job'],
                        'is_standby': m['is_standby']
                    })
            
            count = len(free_members)
            pct = round((count / total_members) * 100, 1)
            
            # Density level: 0 (very low) to 4 (very high)
            if count == 0:
                level = 0
            elif count < total_members * 0.2:
                level = 1
            elif count < total_members * 0.4:
                level = 2
            elif count < total_members * 0.6:
                level = 3
            else:
                level = 4
                
            day_row['slots'].append({
                'slot': slot,
                'count': count,
                'percentage': pct,
                'level': level,
                'free_members': free_members
            })
        heatmap.append(day_row)
        
    return {
        'days': DAYS_LIST,
        'slots': slots,
        'total_members': total_members,
        'matrix': heatmap
    }
