import math
import os
import re
from collections import defaultdict
from ortools.sat.python import cp_model
from data_loader import load_shifts_master, load_members_data, normalize_time_slot

STANDARD_SLOTS = {
    '7h - 9h': (7.0, 9.0),
    '9h - 11h': (9.0, 11.0),
    '11h - 13h': (11.0, 13.0),
    '13h - 15h': (13.0, 15.0),
    '15h - 17h': (15.0, 18.0),
}

def parse_time_to_hours(time_str):
    """Convert time string like '14:00', '14h', '17:30', '7:00' to float hours (e.g. 14.0, 17.5)."""
    if not time_str:
        return 0.0
    s = str(time_str).strip().lower().replace('h', ':')
    if ':' in s:
        parts = s.split(':')
        try:
            h = float(parts[0])
            m = float(parts[1]) if len(parts) > 1 and parts[1] else 0.0
            return h + m / 60.0
        except ValueError:
            pass
    try:
        return float(s)
    except ValueError:
        return 0.0

def get_overlapping_standard_slots(start_str, end_str):
    """
    Determine which standard survey slots overlap with the given [start, end] interval.
    If start_time is late (>= 17:00), map to the latest survey slot ('15h - 17h/18h').
    If shift spans across slots (e.g. 14:00 - 16:00), returns all spanned slots (['13h - 15h', '15h - 17h']).
    """
    start_h = parse_time_to_hours(start_str)
    end_h = parse_time_to_hours(end_str)
    
    if end_h <= start_h:
        end_h = start_h + 2.0  # fallback default 2h
        
    if start_h >= 17.0:
        return ['15h - 17h']
        
    overlapping = []
    for slot_name, (s_start, s_end) in STANDARD_SLOTS.items():
        if max(start_h, s_start) < min(end_h, s_end):
            overlapping.append(slot_name)
            
    return overlapping if overlapping else ['15h - 17h']

class ShiftScheduler:
    def __init__(self, shifts=None, members=None, config=None):
        self.shifts = shifts if shifts is not None else load_shifts_master()
        self.members = members if members is not None else load_members_data()
        self.config = {
            'min_shifts_per_member': 1,
            'max_shifts_per_member': 4,
            'max_shifts_per_day': 2,
            'phong_chinh_count': 3,
            'phong_dp_count': 1,
            'enable_ca_ngoai': True,
            'custom_ca_ngoai': [],
            'weight_committed': 15,
            'weight_fairness': 8,
            'weight_dept_diversity': 4,
            'weight_transport': 3,
            'weight_standby_balance': 2,
            'active_types': ['Phong', 'Ngoai'],
            'custom_demands': {},
            'active_shift_ids': None,
        }
        if config:
            self.config.update(config)

    def optimize(self):
        model = cp_model.CpModel()
        
        active_shifts = []
        
        # 1. Add Room Shifts (Phòng Thanh Niên)
        phong_shifts = [s for s in self.shifts if s['type'] == 'Phong']
        for s in phong_shifts:
            s_copy = dict(s)
            chinh_req = self.config.get('phong_chinh_count', s.get('required_count', 3))
            dp_req = self.config.get('phong_dp_count', 1)
            s_copy['chinh_count'] = chinh_req
            s_copy['dp_count'] = dp_req
            s_copy['required_count'] = chinh_req + dp_req
            s_copy['overlapping_slots'] = [s['slot']]
            active_shifts.append(s_copy)
            
        # 2. Add Outside Shifts (Ca Ngoài) if enabled
        if self.config.get('enable_ca_ngoai', True):
            custom_ngoai = self.config.get('custom_ca_ngoai', [])
            if custom_ngoai and len(custom_ngoai) > 0:
                for idx, c in enumerate(custom_ngoai):
                    c_id = c.get('id', f"NGOAI_{idx+1:02d}")
                    c_day = c.get('day', 'Thứ 7')
                    c_start = c.get('start_time', '17:00')
                    c_end = c.get('end_time', '19:30')
                    chinh_n = int(c.get('chinh', 2))
                    dp_n = int(c.get('dp', 1))
                    
                    overlap_slots = get_overlapping_standard_slots(c_start, c_end)
                    slot_label = f"{c_start} - {c_end}"
                    
                    active_shifts.append({
                        'shift_id': c_id,
                        'type': 'Ngoai',
                        'type_label': 'Điểm bán ngoài',
                        'day': c_day,
                        'date': c.get('date', 'Tuần F&B'),
                        'location': c.get('name', f"Điểm ngoài {idx+1}"),
                        'start_time': c_start,
                        'end_time': c_end,
                        'slot': slot_label,
                        'overlapping_slots': overlap_slots,
                        'chinh_count': chinh_n,
                        'dp_count': dp_n,
                        'required_count': chinh_n + dp_n,
                        'active': True,
                        'note': c.get('note', '')
                    })
            else:
                ngoai_shifts = [s for s in self.shifts if s['type'] == 'Ngoai']
                for s in ngoai_shifts:
                    s_copy = dict(s)
                    s_copy['chinh_count'] = max(1, s.get('required_count', 3) - 1)
                    s_copy['dp_count'] = 1
                    s_copy['required_count'] = s_copy['chinh_count'] + s_copy['dp_count']
                    s_copy['overlapping_slots'] = [s['slot']]
                    active_shifts.append(s_copy)

        num_members = len(self.members)
        num_shifts = len(active_shifts)
        
        if num_shifts == 0 or num_members == 0:
            return {'status': 'NO_SHIFTS', 'assignments': [], 'stats': {}, 'audit': {}}

        # Decision variables: x[i, s] = 1 if member i assigned to shift s
        x = {}
        for i, member in enumerate(self.members):
            for j, shift in enumerate(active_shifts):
                x[i, j] = model.NewBoolVar(f"x_{i}_{j}")
                
        # Hard Constraint 1: Availability
        # A member can only be assigned if they are FREE in ALL standard slots that this shift spans/overlaps
        for i, member in enumerate(self.members):
            for j, shift in enumerate(active_shifts):
                day = shift['day']
                overlap_slots = shift.get('overlapping_slots', [shift['slot']])
                
                # Check if free in ALL overlapping slots
                is_available_all = True
                for sl in overlap_slots:
                    if not member['availability'].get((day, sl), False):
                        is_available_all = False
                        break
                        
                if not is_available_all:
                    model.Add(x[i, j] == 0)

        # Hard Constraint 2: No double-booking across channels (Ca Trong & Ca Ngoai) for any overlapping time
        for i in range(num_members):
            for j1 in range(num_shifts):
                s1 = active_shifts[j1]
                for j2 in range(j1 + 1, num_shifts):
                    s2 = active_shifts[j2]
                    # Check if on the same day and their overlapping standard slots intersect
                    if s1['day'] == s2['day']:
                        slots1 = set(s1.get('overlapping_slots', [s1['slot']]))
                        slots2 = set(s2.get('overlapping_slots', [s2['slot']]))
                        if slots1.intersection(slots2):
                            # Cannot work both shifts
                            model.Add(x[i, j1] + x[i, j2] <= 1)

        # Hard Constraint 3: Max shifts per day for a member
        day_groups = defaultdict(list)
        for j, shift in enumerate(active_shifts):
            day_groups[shift['day']].append(j)
            
        max_per_day = self.config.get('max_shifts_per_day', 2)
        for i in range(num_members):
            for day, shift_indices in day_groups.items():
                model.Add(sum(x[i, j] for j in shift_indices) <= max_per_day)

        # Hard Constraint 4: Shift Demand
        slack_under = {}
        for j, shift in enumerate(active_shifts):
            req = shift['required_count']
            slack_under[j] = model.NewIntVar(0, req, f"slack_under_{j}")
            model.Add(sum(x[i, j] for i in range(num_members)) + slack_under[j] >= req)
            model.Add(sum(x[i, j] for i in range(num_members)) <= req)

        # Hard Constraint 5: Member weekly shift bounds & fairness
        total_demand = sum(s['required_count'] for s in active_shifts)
        target_avg = max(1, round(total_demand / num_members))
        
        member_total_shifts = {}
        for i, member in enumerate(self.members):
            member_total_shifts[i] = model.NewIntVar(0, 10, f"tot_{i}")
            model.Add(member_total_shifts[i] == sum(x[i, j] for j in range(num_shifts)))
            
            min_s = self.config.get('min_shifts_per_member', 1)
            max_s = self.config.get('max_shifts_per_member', 4)
            free_count = sum(1 for (d, sl), free in member['availability'].items() if free)
            eff_max = min(max_s, free_count)
            
            if eff_max >= 1:
                model.Add(member_total_shifts[i] <= eff_max)

        # Objective Function Terms
        obj_terms = []
        
        for j in range(num_shifts):
            is_phong = active_shifts[j]['type'] == 'Phong'
            penalty = 1500 if is_phong else 1000
            obj_terms.append(-penalty * slack_under[j])

        w_commit = self.config.get('weight_committed', 15)
        for i, member in enumerate(self.members):
            for j, shift in enumerate(active_shifts):
                day = shift['day']
                overlap_slots = shift.get('overlapping_slots', [shift['slot']])
                # Reward if any of the overlapping slots was committed
                is_committed_any = any(member['committed_slots'].get((day, sl), False) for sl in overlap_slots)
                if is_committed_any:
                    obj_terms.append(w_commit * x[i, j])

        w_fair = self.config.get('weight_fairness', 8)
        for i in range(num_members):
            dev = model.NewIntVar(0, 10, f"dev_{i}")
            model.Add(dev >= member_total_shifts[i] - target_avg)
            model.Add(dev >= target_avg - member_total_shifts[i])
            obj_terms.append(-w_fair * dev)

        w_trans = self.config.get('weight_transport', 3)
        for i, member in enumerate(self.members):
            has_vehicle = 'xe máy' in member['vehicle'].lower() or 'tự đi' in member['vehicle'].lower()
            for j, shift in enumerate(active_shifts):
                overlap_slots = shift.get('overlapping_slots', [shift['slot']])
                if ('7h - 9h' in overlap_slots or shift['type'] == 'Ngoai') and has_vehicle:
                    obj_terms.append(w_trans * x[i, j])

        model.Maximize(sum(obj_terms))
        
        # Solve with CP-SAT
        # Configurable via env: free-tier hosts have far less CPU than a dev box,
        # so they need a longer wall-clock budget with fewer parallel workers.
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = float(os.getenv('SOLVER_MAX_SECONDS', '15'))
        solver.parameters.num_workers = int(os.getenv('SOLVER_WORKERS', '4'))
        status = solver.Solve(model)
        
        status_name = solver.StatusName(status)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return {
                'success': False,
                'status': status_name,
                'message': f"Solver không tìm thấy nghiệm khả thi: {status_name}"
            }

        # Extract assignments and designate Trực Chính vs Dự Phòng
        assigned_shifts = []
        member_assigned_map = defaultdict(list)
        
        for j, shift in enumerate(active_shifts):
            raw_assigned = []
            for i, member in enumerate(self.members):
                if solver.Value(x[i, j]) == 1:
                    raw_assigned.append(member)
                    
            overlap_slots = shift.get('overlapping_slots', [shift['slot']])
            raw_assigned.sort(key=lambda m: (
                not any(m['committed_slots'].get((shift['day'], sl), False) for sl in overlap_slots),
                m['is_standby'],
                m['name']
            ))

            chinh_needed = shift.get('chinh_count', max(1, len(raw_assigned) - 1))
            
            assigned_members = []
            for idx_m, m in enumerate(raw_assigned):
                role = 'Chính' if idx_m < chinh_needed else 'Dự phòng'
                is_commit = any(m['committed_slots'].get((shift['day'], sl), False) for sl in overlap_slots)
                assigned_members.append({
                    'member_id': m['member_id'],
                    'name': m['name'],
                    'department': m['department'],
                    'residence': m['residence'],
                    'vehicle': m['vehicle'],
                    'job': m['job'],
                    'school': m['school'],
                    'phone': m['phone'],
                    'role': role,
                    'is_standby': m['is_standby'],
                    'is_committed': is_commit
                })
                member_assigned_map[m['member_id']].append(shift['shift_id'])
                    
            shift_leader = None
            if assigned_members:
                hr_members = [m for m in assigned_members if ('Nhân sự' in m['department'] or 'Sự kiện' in m['department']) and m['role'] == 'Chính']
                if hr_members:
                    shift_leader = hr_members[0]['name']
                else:
                    chinh_members = [m for m in assigned_members if m['role'] == 'Chính']
                    shift_leader = chinh_members[0]['name'] if chinh_members else assigned_members[0]['name']

            # Assign specific tasks for each member in shift
            for m in assigned_members:
                if m['name'] == shift_leader:
                    m['task'] = "Trưởng ca - Điều hành & Kiểm thu"
                elif m['role'] == 'Dự phòng':
                    m['task'] = "Dự phòng - Hỗ trợ & Thay ca khi cần"
                elif 'Tài chính' in m.get('department', ''):
                    m['task'] = "Thu ngân & Nhập sổ sách F&B"
                elif 'Hậu cần' in m.get('department', '') or 'Kỹ thuật' in m.get('department', ''):
                    m['task'] = "Chuẩn bị F&B & Kiểm kho"
                elif 'Truyền thông' in m.get('department', '') or 'Sự kiện' in m.get('department', ''):
                    m['task'] = "Đón khách & Quảng bá F&B"
                else:
                    m['task'] = "Bán hàng F&B & Phục vụ trực tiếp"

            assigned_shift_data = dict(shift)
            assigned_shift_data['assigned_members'] = assigned_members
            assigned_shift_data['assigned_count'] = len(assigned_members)
            assigned_shift_data['chinh_assigned_count'] = sum(1 for m in assigned_members if m['role'] == 'Chính')
            assigned_shift_data['dp_assigned_count'] = sum(1 for m in assigned_members if m['role'] == 'Dự phòng')
            assigned_shift_data['shift_leader'] = shift_leader
            assigned_shift_data['is_filled'] = len(assigned_members) >= shift['required_count']
            assigned_shifts.append(assigned_shift_data)

        # Compile member statistics
        member_stats = []
        for member in self.members:
            m_id = member['member_id']
            assigned_ids = member_assigned_map.get(m_id, [])
            shifts_assigned = [s for s in assigned_shifts if s['shift_id'] in assigned_ids]
            
            phong_count = sum(1 for s in shifts_assigned if s['type'] == 'Phong')
            ngoai_count = sum(1 for s in shifts_assigned if s['type'] == 'Ngoai')
            commit_matched = sum(1 for s in shifts_assigned if any(member['committed_slots'].get((s['day'], sl), False) for sl in s.get('overlapping_slots', [s['slot']])))
            
            member_stats.append({
                'member_id': m_id,
                'name': member['name'],
                'department': member['department'],
                'residence': member['residence'],
                'job': member['job'],
                'school': member['school'],
                'phone': member['phone'],
                'is_standby': member['is_standby'],
                'total_shifts': len(assigned_ids),
                'total_hours': len(assigned_ids) * 2,
                'phong_shifts': phong_count,
                'ngoai_shifts': ngoai_count,
                'committed_matched': commit_matched,
                'assigned_shift_ids': ", ".join(assigned_ids),
                'assigned_shifts_detail': shifts_assigned
            })

        audit_results = self.run_audit(assigned_shifts, member_stats)
        contingency_matrix = self.build_contingency(assigned_shifts)

        return {
            'success': True,
            'status': status_name,
            'assigned_shifts': assigned_shifts,
            'member_stats': member_stats,
            'audit_results': audit_results,
            'contingency_matrix': contingency_matrix,
            'summary': {
                'total_active_shifts': len(active_shifts),
                'total_assignments': sum(s['assigned_count'] for s in assigned_shifts),
                'total_members': num_members,
                'avg_shifts_per_member': round(sum(m['total_shifts'] for m in member_stats) / num_members, 2),
                'phong_shifts_filled': sum(1 for s in assigned_shifts if s['type'] == 'Phong' and s['is_filled']),
                'total_phong_shifts': sum(1 for s in assigned_shifts if s['type'] == 'Phong'),
                'ngoai_shifts_filled': sum(1 for s in assigned_shifts if s['type'] == 'Ngoai' and s['is_filled']),
                'total_ngoai_shifts': sum(1 for s in assigned_shifts if s['type'] == 'Ngoai'),
            }
        }

    def run_audit(self, assigned_shifts, member_stats):
        conflicts = []
        availability_violations = []
        daily_overloads = []
        empty_rooms = []
        
        # Check conflict across overlapping slots
        for s1_idx, s1 in enumerate(assigned_shifts):
            for s2_idx in range(s1_idx + 1, len(assigned_shifts)):
                s2 = assigned_shifts[s2_idx]
                if s1['day'] == s2['day']:
                    slots1 = set(s1.get('overlapping_slots', [s1['slot']]))
                    slots2 = set(s2.get('overlapping_slots', [s2['slot']]))
                    if slots1.intersection(slots2):
                        m_set1 = {m['member_id'] for m in s1['assigned_members']}
                        m_set2 = {m['member_id'] for m in s2['assigned_members']}
                        overlap_m = m_set1.intersection(m_set2)
                        for m_id in overlap_m:
                            conflicts.append({
                                'member_id': m_id,
                                'day': s1['day'],
                                'shift_ids': [s1['shift_id'], s2['shift_id']],
                                'description': f"Thành viên {m_id} bị trùng ca vào {s1['day']} ({s1['shift_id']} và {s2['shift_id']})"
                            })

        mem_lookup = {m['member_id']: m for m in self.members}
        for s in assigned_shifts:
            overlap_slots = s.get('overlapping_slots', [s['slot']])
            for m in s['assigned_members']:
                orig = mem_lookup.get(m['member_id'])
                if orig:
                    is_free_all = all(orig['availability'].get((s['day'], sl), False) for sl in overlap_slots)
                    if not is_free_all:
                        availability_violations.append({
                            'member_id': m['member_id'],
                            'name': m['name'],
                            'shift_id': s['shift_id'],
                            'day': s['day'],
                            'slot': s['slot']
                        })

        for s in assigned_shifts:
            if s['type'] == 'Phong' and s['assigned_count'] == 0:
                empty_rooms.append({
                    'shift_id': s['shift_id'],
                    'day': s['day'],
                    'slot': s['slot'],
                    'required': s['required_count']
                })

        member_day_map = defaultdict(lambda: defaultdict(int))
        for s in assigned_shifts:
            for m in s['assigned_members']:
                member_day_map[m['member_id']][s['day']] += 1
                
        for m_id, days in member_day_map.items():
            for day, cnt in days.items():
                if cnt > self.config.get('max_shifts_per_day', 2):
                    daily_overloads.append({
                        'member_id': m_id,
                        'day': day,
                        'count': cnt
                    })

        shift_counts = [m['total_shifts'] for m in member_stats]
        min_c = min(shift_counts) if shift_counts else 0
        max_c = max(shift_counts) if shift_counts else 0
        mean_c = sum(shift_counts) / len(shift_counts) if shift_counts else 0
        variance = sum((c - mean_c) ** 2 for c in shift_counts) / len(shift_counts) if shift_counts else 0
        std_dev = math.sqrt(variance)

        is_passed = (len(conflicts) == 0 and len(availability_violations) == 0 and len(empty_rooms) == 0)

        return {
            'is_passed': is_passed,
            'conflict_count': len(conflicts),
            'conflicts': conflicts,
            'availability_violation_count': len(availability_violations),
            'availability_violations': availability_violations,
            'empty_room_count': len(empty_rooms),
            'empty_rooms': empty_rooms,
            'daily_overload_count': len(daily_overloads),
            'daily_overloads': daily_overloads,
            'fairness_metrics': {
                'min_shifts': min_c,
                'max_shifts': max_c,
                'avg_shifts': round(mean_c, 2),
                'std_dev': round(std_dev, 2),
                'fairness_score': max(0, round(100 - std_dev * 15, 1))
            }
        }

    def build_contingency(self, assigned_shifts):
        contingency = []
        for s in assigned_shifts:
            assigned_m_ids = {m['member_id'] for m in s['assigned_members']}
            overlap_slots = s.get('overlapping_slots', [s['slot']])
            backups = []
            
            for m in self.members:
                if m['member_id'] in assigned_m_ids:
                    continue
                is_free_all = all(m['availability'].get((s['day'], sl), False) for sl in overlap_slots)
                if is_free_all:
                    backups.append({
                        'member_id': m['member_id'],
                        'name': m['name'],
                        'department': m['department'],
                        'phone': m['phone'],
                        'is_standby': m['is_standby'],
                        'job': m['job'],
                        'vehicle': m['vehicle'],
                        'priority': 1 if m['is_standby'] else 2
                    })
                    
            backups.sort(key=lambda x: (x['priority'], x['name']))
            
            contingency.append({
                'shift_id': s['shift_id'],
                'type': s['type'],
                'type_label': s['type_label'],
                'day': s['day'],
                'date': s['date'],
                'slot': s['slot'],
                'location': s['location'],
                'current_assigned': [f"{m['name']} ({m['role']})" for m in s['assigned_members']],
                'backup_candidates': backups[:8],
                'total_available_backups': len(backups)
            })
        return contingency
