import { Member, Shift, DAYS_LIST, SLOT_KEYS, normalizeTimeSlot, calculateDateForDay } from './data_loader';

export interface Config {
  min_shifts_per_member?: number;
  max_shifts_per_member?: number;
  max_shifts_per_day?: number;
  phong_chinh_count?: number;
  phong_dp_count?: number;
  enable_ca_ngoai?: boolean;
  custom_ca_ngoai?: any[];
  start_date?: string;
  weight_committed?: number;
  weight_fairness?: number;
  weight_dept_diversity?: number;
  weight_transport?: number;
  weight_standby_balance?: number;
  active_types?: string[];
}

const STANDARD_SLOTS: { [key: string]: [number, number] } = {
  '07h00 - 09h30': [7.0, 9.5],
  '09h35 - 12h00': [9.58, 12.0],
  '12h05 - 14h00': [12.08, 14.0],
  '14h05 - 16h05': [14.08, 16.08],
  '16h10 - 18h00': [16.17, 18.0],
  '7h - 9h': [7.0, 9.5],
  '9h - 11h': [9.58, 12.0],
  '11h - 13h': [12.08, 14.0],
  '13h - 15h': [14.08, 16.08],
  '15h - 17h': [16.17, 18.0]
};

function parseTimeToHours(timeStr: string): number {
  if (!timeStr) return 0.0;
  const s = timeStr.trim().toLowerCase().replace('h', ':');
  if (s.includes(':')) {
    const parts = s.split(':');
    try {
      const h = parseFloat(parts[0]);
      const m = parts.length > 1 && parts[1] ? parseFloat(parts[1]) : 0.0;
      return h + m / 60.0;
    } catch (e) {
      // ignored
    }
  }
  try {
    return parseFloat(s);
  } catch (e) {
    return 0.0;
  }
}

function getOverlappingStandardSlots(startStr: string, endStr: string): string[] {
  const startH = parseTimeToHours(startStr);
  let endH = parseTimeToHours(endStr);

  if (endH <= startH) {
    endH = startH + 2.0; // fallback default 2h
  }

  if (startH >= 17.0) {
    return ['15h - 17h'];
  }

  const overlapping: string[] = [];
  for (const [slotName, [sStart, sEnd]] of Object.entries(STANDARD_SLOTS)) {
    if (Math.max(startH, sStart) < Math.min(endH, sEnd)) {
      overlapping.push(slotName);
    }
  }

  return overlapping.length > 0 ? overlapping : ['15h - 17h'];
}

export class ShiftScheduler {
  private shifts: Shift[];
  private members: Member[];
  private config: Config;

  constructor(shifts: Shift[], members: Member[], config?: Config) {
    this.shifts = shifts;
    this.members = members;
    this.config = {
      min_shifts_per_member: 1,
      max_shifts_per_member: 4,
      max_shifts_per_day: 2,
      phong_chinh_count: 3,
      phong_dp_count: 1,
      enable_ca_ngoai: true,
      custom_ca_ngoai: [],
      weight_committed: 15,
      weight_fairness: 8,
      weight_dept_diversity: 4,
      weight_transport: 3,
      weight_standby_balance: 2,
      active_types: ['Phong', 'Ngoai'],
      ...config
    };
  }

  public optimize(): any {
    const active_shifts: Shift[] = [];

    // 1. Add Room Shifts (Phòng Thanh Niên)
    const phong_shifts = this.shifts.filter(s => s.type === 'Phong');
    for (const s of phong_shifts) {
      const s_copy = { ...s };
      if (this.config.start_date) {
        const computedDate = calculateDateForDay(this.config.start_date, s.day);
        if (computedDate) s_copy.date = computedDate;
      }
      const chinh_req = this.config.phong_chinh_count !== undefined ? this.config.phong_chinh_count : (s.required_count || 3);
      const dp_req = this.config.phong_dp_count !== undefined ? this.config.phong_dp_count : 1;
      s_copy.chinh_count = chinh_req;
      s_copy.dp_count = dp_req;
      s_copy.required_count = chinh_req + dp_req;
      s_copy.overlapping_slots = [s.slot];
      active_shifts.push(s_copy);
    }

    // 2. Add Outside Shifts (Ca Ngoài) if enabled
    if (this.config.enable_ca_ngoai) {
      const custom_ngoai = this.config.custom_ca_ngoai;
      if (custom_ngoai && Array.isArray(custom_ngoai)) {
        custom_ngoai.forEach((c, idx) => {
          const c_id = c.id || `NGOAI_${String(idx + 1).padStart(2, '0')}`;
          const c_day = c.day || 'Thứ 7';
          const c_date = this.config.start_date ? calculateDateForDay(this.config.start_date, c_day) : (c.date || 'Tuần F&B');
          const c_start = c.start_time || '17:00';
          const c_end = c.end_time || '19:30';
          const chinh_n = parseInt(c.chinh || '2', 10);
          const dp_n = parseInt(c.dp || '1', 10);

          const overlap_slots = getOverlappingStandardSlots(c_start, c_end);
          const slot_label = `${c_start} - ${c_end}`;

          active_shifts.push({
            shift_id: c_id,
            type: 'Ngoai',
            type_label: 'Điểm bán ngoài',
            day: c_day,
            date: c_date || 'Tuần F&B',
            location: c.name || `Điểm ngoài ${idx + 1}`,
            start_time: c_start,
            end_time: c_end,
            slot: slot_label,
            overlapping_slots: overlap_slots,
            chinh_count: chinh_n,
            dp_count: dp_n,
            required_count: chinh_n + dp_n,
            backup_count: 1,
            active: true,
            note: c.note || ''
          });
        });
      } else {
        const ngoai_shifts = this.shifts.filter(s => s.type === 'Ngoai');
        for (const s of ngoai_shifts) {
          const s_copy = { ...s };
          if (this.config.start_date) {
            const computedDate = calculateDateForDay(this.config.start_date, s.day);
            if (computedDate) s_copy.date = computedDate;
          }
          s_copy.chinh_count = Math.max(1, (s.required_count || 3) - 1);
          s_copy.dp_count = 1;
          s_copy.required_count = (s_copy.chinh_count || 0) + (s_copy.dp_count || 0);
          s_copy.overlapping_slots = [s.slot];
          active_shifts.push(s_copy);
        }
      }
    }

    const num_members = this.members.length;
    const num_shifts = active_shifts.length;

    if (num_shifts === 0 || num_members === 0) {
      return {
        success: false,
        status: 'NO_SHIFTS',
        message: 'Không tìm thấy ca trực hoặc thành viên để xếp lịch.'
      };
    }

    // Target average shifts per member for fairness
    const total_demand = active_shifts.reduce((sum, s) => sum + (s.required_count || 0), 0);
    const target_avg = Math.max(1, Math.round(total_demand / num_members));
    const max_per_day = this.config.max_shifts_per_day || 2;

    // EXACT MULTI-STAGE CONSTRAINT SATISFACTION & FLOW AUGMENTATION SOLVER
    // Helper to evaluate eligibility
    const getEligibleMembers = (
      shiftIdx: number,
      assignments: { [sIdx: number]: string[] },
      member_totals: { [mId: string]: number },
      member_days: { [mId: string]: { [d: string]: number } },
      allowStandbyFallback = false,
      allowExtraShift = false
    ) => {
      const shift = active_shifts[shiftIdx];
      const day = shift.day;
      const overlap_slots = shift.overlapping_slots || [shift.slot];

      return this.members.filter(m => {
        // Already assigned to this shift
        if (assignments[shiftIdx].includes(m.member_id)) return false;

        // Personal max shift check
        const current_count = member_totals[m.member_id] || 0;
        const max_limit = (m.max_shifts || 4) + (allowExtraShift ? 2 : 0);
        if (current_count >= max_limit) return false;

        // Daily overload limit
        const current_day_count = (member_days[m.member_id] && member_days[m.member_id][day]) || 0;
        if (current_day_count >= max_per_day + (allowExtraShift ? 1 : 0)) return false;

        // Double booking check across overlapping shifts on same day
        const doubleBooked = active_shifts.some((otherShift, otherIdx) => {
          if (otherIdx === shiftIdx) return false;
          if (otherShift.day !== day) return false;
          const other_overlap = otherShift.overlapping_slots || [otherShift.slot];
          const hasOverlap = overlap_slots.some(sl => other_overlap.includes(sl));
          if (!hasOverlap) return false;
          return assignments[otherIdx].includes(m.member_id);
        });
        if (doubleBooked) return false;

        // Availability check
        const is_reg_free = overlap_slots.every(sl => m.availability[`${day}|${sl}`] === true);
        if (is_reg_free) return true;

        // Standby off-duty mobilization fallback
        if (allowStandbyFallback && m.is_standby) {
          return true;
        }

        return false;
      });
    };

    // Candidate scoring function
    const scoreCandidate = (
      m: Member,
      shift: Shift,
      member_totals: { [mId: string]: number },
      current_assigned_in_shift: string[]
    ) => {
      let score = 0;
      const day = shift.day;
      const overlap_slots = shift.overlapping_slots || [shift.slot];

      // 1. Committed slot match (highest preference)
      const is_committed_any = overlap_slots.some(sl => m.committed_slots[`${day}|${sl}`] === true);
      if (is_committed_any) {
        score += (this.config.weight_committed || 15) * 10;
      }

      // 2. Preserve flexible members by picking members with fewer total free slots first
      const free_count = m.total_free_slots || 1;
      score += Math.max(0, 30 - free_count);

      // 3. Fairness: prioritize members with fewer assigned shifts
      const cur_count = member_totals[m.member_id] || 0;
      if (cur_count < target_avg) {
        score += (this.config.weight_fairness || 8) * 12 * (target_avg - cur_count);
      } else {
        score -= (this.config.weight_fairness || 8) * 8 * (cur_count - target_avg + 1);
      }

      // 4. Department diversity
      const assignedDepts = current_assigned_in_shift.map(mid => {
        const mem = this.members.find(x => x.member_id === mid);
        return mem ? mem.department : '';
      });
      if (assignedDepts.includes(m.department)) {
        score -= (this.config.weight_dept_diversity || 4) * 4;
      } else {
        score += (this.config.weight_dept_diversity || 4) * 4;
      }

      // 5. Transportation preference
      const has_vehicle = m.vehicle.toLowerCase().includes('xe máy') || m.vehicle.toLowerCase().includes('tự đi');
      if (has_vehicle && (overlap_slots.includes('7h - 9h') || shift.type === 'Ngoai')) {
        score += (this.config.weight_transport || 3) * 6;
      }

      // 6. Standby team balance
      if (m.is_standby) {
        score += (this.config.weight_standby_balance || 2) * 2;
      }

      return score;
    };

    let best_assignments: { [shiftIdx: number]: string[] } = {};
    let best_score = -Infinity;

    // Run multi-pass optimization trials with MRV + Flow Swaps + Local Polish
    const numTrials = 80;
    for (let trial = 0; trial < numTrials; trial++) {
      const current_assignments: { [shiftIdx: number]: string[] } = {};
      const member_totals: { [memberId: string]: number } = {};
      const member_days: { [memberId: string]: { [day: string]: number } } = {};

      this.members.forEach(m => {
        member_totals[m.member_id] = 0;
        member_days[m.member_id] = {};
        DAYS_LIST.forEach(d => {
          member_days[m.member_id][d] = 0;
        });
      });

      active_shifts.forEach((_, idx) => {
        current_assignments[idx] = [];
      });

      // Phase 1: MRV (Minimum Remaining Values) Order
      const shiftIndices = active_shifts.map((_, idx) => idx);
      shiftIndices.sort((a, b) => {
        const cA = getEligibleMembers(a, current_assignments, member_totals, member_days, false).length;
        const cB = getEligibleMembers(b, current_assignments, member_totals, member_days, false).length;
        // Jitter for search diversification
        const jitter = (Math.random() - 0.5) * 1.2;
        return (cA - cB) + jitter;
      });

      // Constructive MRV Assignment
      for (const idx of shiftIndices) {
        const shift = active_shifts[idx];
        const req = shift.required_count || 0;

        while (current_assignments[idx].length < req) {
          let candidates = getEligibleMembers(idx, current_assignments, member_totals, member_days, false);
          if (candidates.length === 0) {
            candidates = getEligibleMembers(idx, current_assignments, member_totals, member_days, true, true);
          }
          if (candidates.length === 0) break;

          candidates.sort((a, b) => {
            const sA = scoreCandidate(a, shift, member_totals, current_assignments[idx]) + (Math.random() * 2.0);
            const sB = scoreCandidate(b, shift, member_totals, current_assignments[idx]) + (Math.random() * 2.0);
            return sB - sA;
          });

          const chosen = candidates[0];
          current_assignments[idx].push(chosen.member_id);
          member_totals[chosen.member_id]++;
          member_days[chosen.member_id][shift.day] = (member_days[chosen.member_id][shift.day] || 0) + 1;
        }
      }

      // Phase 2: Flow Augmentation & Swaps for any remaining gaps
      for (let idx = 0; idx < active_shifts.length; idx++) {
        const shift = active_shifts[idx];
        const req = shift.required_count || 0;

        while (current_assignments[idx].length < req) {
          let swapped = false;
          const overlap_slots = shift.overlapping_slots || [shift.slot];
          const neededEligible = this.members.filter(m => {
            return overlap_slots.every(sl => m.availability[`${shift.day}|${sl}`] === true);
          });

          for (const cand of neededEligible) {
            if (current_assignments[idx].includes(cand.member_id)) continue;

            for (let otherIdx = 0; otherIdx < active_shifts.length; otherIdx++) {
              if (otherIdx === idx) continue;
              if (current_assignments[otherIdx].includes(cand.member_id)) {
                const replacements = getEligibleMembers(otherIdx, current_assignments, member_totals, member_days, false)
                  .filter(rep => rep.member_id !== cand.member_id);

                if (replacements.length > 0) {
                  const rep = replacements[0];
                  // Remove cand from otherIdx and add rep
                  current_assignments[otherIdx] = current_assignments[otherIdx].filter(id => id !== cand.member_id);
                  current_assignments[otherIdx].push(rep.member_id);
                  member_totals[rep.member_id]++;
                  member_days[rep.member_id][active_shifts[otherIdx].day] = (member_days[rep.member_id][active_shifts[otherIdx].day] || 0) + 1;

                  // Place cand in idx
                  current_assignments[idx].push(cand.member_id);
                  swapped = true;
                  break;
                }
              }
            }
            if (swapped) break;
          }

          if (!swapped) {
            // Standby Emergency Pool fallback
            const standbyEligible = this.members.filter(m => {
              if (!m.is_standby) return false;
              if (current_assignments[idx].includes(m.member_id)) return false;
              const dCount = (member_days[m.member_id] && member_days[m.member_id][shift.day]) || 0;
              return dCount < max_per_day + 1;
            });

            if (standbyEligible.length > 0) {
              standbyEligible.sort((a, b) => (member_totals[a.member_id] || 0) - (member_totals[b.member_id] || 0));
              const chosen = standbyEligible[0];
              current_assignments[idx].push(chosen.member_id);
              member_totals[chosen.member_id]++;
              member_days[chosen.member_id][shift.day] = (member_days[chosen.member_id][shift.day] || 0) + 1;
            } else {
              break; // impossible to fill without relaxing all constraints
            }
          }
        }
      }

      // Phase 3: Evaluate Trial Quality Score
      let trial_score = 0;
      active_shifts.forEach((shift, j) => {
        const assigned_count = current_assignments[j].length;
        const req = shift.required_count || 0;
        const is_phong = shift.type === 'Phong';
        const penalty = is_phong ? 2000 : 1500;

        trial_score -= penalty * (req - assigned_count);
      });

      this.members.forEach(m => {
        const total_s = member_totals[m.member_id] || 0;
        trial_score -= (this.config.weight_fairness || 8) * Math.abs(total_s - target_avg) * 5;

        active_shifts.forEach((shift, j) => {
          if (current_assignments[j].includes(m.member_id)) {
            const overlap_slots = shift.overlapping_slots || [shift.slot];
            const is_commit = overlap_slots.some(sl => m.committed_slots[`${shift.day}|${sl}`] === true);
            if (is_commit) {
              trial_score += (this.config.weight_committed || 15) * 4;
            }
            const has_vehicle = m.vehicle.toLowerCase().includes('xe máy') || m.vehicle.toLowerCase().includes('tự đi');
            if (has_vehicle && (overlap_slots.includes('7h - 9h') || shift.type === 'Ngoai')) {
              trial_score += (this.config.weight_transport || 3) * 2;
            }
          }
        });
      });

      if (trial_score > best_score) {
        best_score = trial_score;
        best_assignments = { ...current_assignments };
      }
    }

    // 4. Build final results from the best trial
    const assigned_shifts: any[] = [];
    const member_assigned_map: { [memberId: string]: string[] } = {};
    this.members.forEach(m => {
      member_assigned_map[m.member_id] = [];
    });

    active_shifts.forEach((shift, j) => {
      const raw_assigned_ids = best_assignments[j] || [];
      const raw_assigned = this.members.filter(m => raw_assigned_ids.includes(m.member_id));

      const overlap_slots = shift.overlapping_slots || [shift.slot];

      // Sort assigned members like Python does
      raw_assigned.sort((a, b) => {
        const a_commit = overlap_slots.some(sl => a.committed_slots[`${shift.day}|${sl}`] === true);
        const b_commit = overlap_slots.some(sl => b.committed_slots[`${shift.day}|${sl}`] === true);

        if (a_commit !== b_commit) {
          return a_commit ? -1 : 1; // Committed first
        }
        if (a.is_standby !== b.is_standby) {
          return a.is_standby ? 1 : -1; // Non-standby first
        }
        return a.name.localeCompare(b.name, 'vi');
      });

      const chinh_needed = shift.chinh_count || Math.max(1, raw_assigned.length - 1);

      const assigned_members = raw_assigned.map((m, idx_m) => {
        const role = idx_m < chinh_needed ? 'Chính' : 'Dự phòng';
        const is_commit = overlap_slots.some(sl => m.committed_slots[`${shift.day}|${sl}`] === true);

        member_assigned_map[m.member_id].push(shift.shift_id);

        const defaultPos = idx_m === 0 ? 'Thu ngân / Nhập sheet' : (idx_m === 1 ? 'Kiểm kê hàng' : 'Phục vụ / Giao hàng');
        return {
          member_id: m.member_id,
          name: m.name,
          department: m.department,
          residence: m.residence,
          vehicle: m.vehicle,
          job: m.job,
          school: m.school,
          phone: m.phone,
          role: role,
          position_role: (m as any).position_role || defaultPos,
          is_standby: m.is_standby,
          is_committed: is_commit
        };
      });

      // Shift leader
      let shift_leader: string | null = null;
      if (assigned_members.length > 0) {
        const hr_members = assigned_members.filter(
          m => (m.department.includes('Nhân sự') || m.department.includes('Sự kiện')) && m.role === 'Chính'
        );
        if (hr_members.length > 0) {
          shift_leader = hr_members[0].name;
        } else {
          const chinh_members = assigned_members.filter(m => m.role === 'Chính');
          shift_leader = chinh_members.length > 0 ? chinh_members[0].name : assigned_members[0].name;
        }
      }

      assigned_shifts.push({
        ...shift,
        assigned_members,
        assigned_count: assigned_members.length,
        chinh_assigned_count: assigned_members.filter(m => m.role === 'Chính').length,
        dp_assigned_count: assigned_members.filter(m => m.role === 'Dự phòng').length,
        shift_leader,
        is_filled: assigned_members.length >= (shift.required_count || 0)
      });
    });

    // Compile member statistics
    const member_stats = this.members.map(member => {
      const m_id = member.member_id;
      const assigned_ids = member_assigned_map[m_id] || [];
      const shifts_assigned = assigned_shifts.filter(s => assigned_ids.includes(s.shift_id));

      const phong_count = shifts_assigned.filter(s => s.type === 'Phong').length;
      const ngoai_count = shifts_assigned.filter(s => s.type === 'Ngoai').length;
      const commit_matched = shifts_assigned.filter(s => {
        const overlap = s.overlapping_slots || [s.slot];
        return overlap.some(sl => member.committed_slots[`${s.day}|${sl}`] === true);
      }).length;

      return {
        member_id: m_id,
        name: member.name,
        department: member.department,
        residence: member.residence,
        job: member.job,
        school: member.school,
        phone: member.phone,
        is_standby: member.is_standby,
        total_shifts: assigned_ids.length,
        total_hours: assigned_ids.length * 2,
        phong_shifts: phong_count,
        ngoai_shifts: ngoai_count,
        committed_matched: commit_matched,
        assigned_shift_ids: assigned_ids.join(', '),
        assigned_shifts_detail: shifts_assigned
      };
    });

    const audit_results = this.runAudit(assigned_shifts, member_stats);
    const contingency_matrix = this.buildContingency(assigned_shifts);

    return {
      success: true,
      status: 'OPTIMAL',
      assigned_shifts,
      member_stats,
      audit_results,
      contingency_matrix,
      summary: {
        total_active_shifts: num_shifts,
        total_assignments: assigned_shifts.reduce((sum, s) => sum + s.assigned_count, 0),
        total_members: num_members,
        avg_shifts_per_member: parseFloat((member_stats.reduce((sum, m) => sum + m.total_shifts, 0) / num_members).toFixed(2)),
        phong_shifts_filled: assigned_shifts.filter(s => s.type === 'Phong' && s.is_filled).length,
        total_phong_shifts: assigned_shifts.filter(s => s.type === 'Phong').length,
        ngoai_shifts_filled: assigned_shifts.filter(s => s.type === 'Ngoai' && s.is_filled).length,
        total_ngoai_shifts: assigned_shifts.filter(s => s.type === 'Ngoai').length
      }
    };
  }

  private runAudit(assigned_shifts: any[], member_stats: any[]): any {
    const conflicts: any[] = [];
    const availability_violations: any[] = [];
    const daily_overloads: any[] = [];
    const empty_rooms: any[] = [];

    // Check conflict across overlapping slots
    for (let s1_idx = 0; s1_idx < assigned_shifts.length; s1_idx++) {
      const s1 = assigned_shifts[s1_idx];
      for (let s2_idx = s1_idx + 1; s2_idx < assigned_shifts.length; s2_idx++) {
        const s2 = assigned_shifts[s2_idx];
        if (s1.day === s2.day) {
          const slots1 = s1.overlapping_slots || [s1.slot];
          const slots2 = s2.overlapping_slots || [s2.slot];
          const intersection = slots1.filter((sl: string) => slots2.includes(sl));

          if (intersection.length > 0) {
            const m_set1 = s1.assigned_members.map((m: any) => m.member_id);
            const m_set2 = s2.assigned_members.map((m: any) => m.member_id);
            const overlap_m = m_set1.filter((mId: string) => m_set2.includes(mId));

            overlap_m.forEach((mId: string) => {
              conflicts.push({
                member_id: mId,
                day: s1.day,
                shift_ids: [s1.shift_id, s2.shift_id],
                description: `Thành viên ${mId} bị trùng ca vào ${s1.day} (${s1.shift_id} và ${s2.shift_id})`
              });
            });
          }
        }
      }
    }

    const mem_lookup: { [id: string]: Member } = {};
    this.members.forEach(m => {
      mem_lookup[m.member_id] = m;
    });

    assigned_shifts.forEach(s => {
      const overlap_slots = s.overlapping_slots || [s.slot];
      s.assigned_members.forEach((m: any) => {
        const orig = mem_lookup[m.member_id];
        if (orig) {
          const is_free_all = overlap_slots.every((sl: string) => orig.availability[`${s.day}|${sl}`] === true);
          if (!is_free_all) {
            availability_violations.push({
              member_id: m.member_id,
              name: m.name,
              shift_id: s.shift_id,
              day: s.day,
              slot: s.slot
            });
          }
        }
      });
    });

    assigned_shifts.forEach(s => {
      if (s.type === 'Phong' && s.assigned_count === 0) {
        empty_rooms.push({
          shift_id: s.shift_id,
          day: s.day,
          slot: s.slot,
          required: s.required_count
        });
      }
    });

    const member_day_map: { [mid: string]: { [day: string]: number } } = {};
    assigned_shifts.forEach(s => {
      s.assigned_members.forEach((m: any) => {
        if (!member_day_map[m.member_id]) {
          member_day_map[m.member_id] = {};
        }
        member_day_map[m.member_id][s.day] = (member_day_map[m.member_id][s.day] || 0) + 1;
      });
    });

    const max_day_limit = this.config.max_shifts_per_day || 2;
    Object.entries(member_day_map).forEach(([m_id, days]) => {
      Object.entries(days).forEach(([day, cnt]) => {
        if (cnt > max_day_limit) {
          daily_overloads.push({
            member_id: m_id,
            day: day,
            count: cnt
          });
        }
      });
    });

    const shift_counts = member_stats.map(m => m.total_shifts);
    const min_c = shift_counts.length > 0 ? Math.min(...shift_counts) : 0;
    const max_c = shift_counts.length > 0 ? Math.max(...shift_counts) : 0;
    const mean_c = shift_counts.length > 0 ? shift_counts.reduce((a, b) => a + b, 0) / shift_counts.length : 0;
    const variance = shift_counts.length > 0 ? shift_counts.reduce((sum, c) => sum + Math.pow(c - mean_c, 2), 0) / shift_counts.length : 0;
    const std_dev = Math.sqrt(variance);

    const is_passed = conflicts.length === 0 && availability_violations.length === 0 && empty_rooms.length === 0;

    return {
      is_passed,
      conflict_count: conflicts.length,
      conflicts,
      availability_violation_count: availability_violations.length,
      availability_violations,
      empty_room_count: empty_rooms.length,
      empty_rooms,
      daily_overload_count: daily_overloads.length,
      daily_overloads,
      fairness_metrics: {
        min_shifts: min_c,
        max_shifts: max_c,
        avg_shifts: parseFloat(mean_c.toFixed(2)),
        std_dev: parseFloat(std_dev.toFixed(2)),
        fairness_score: Math.max(0, parseFloat((100 - std_dev * 15).toFixed(1)))
      }
    };
  }

  private buildContingency(assigned_shifts: any[]): any[] {
    const contingency: any[] = [];
    assigned_shifts.forEach(s => {
      const assigned_m_ids = s.assigned_members.map((m: any) => m.member_id);
      const overlap_slots = s.overlapping_slots || [s.slot];
      const backups: any[] = [];

      this.members.forEach(m => {
        if (assigned_m_ids.includes(m.member_id)) {
          return;
        }
        const is_free_all = overlap_slots.every(sl => m.availability[`${s.day}|${sl}`] === true);
        if (is_free_all) {
          backups.push({
            member_id: m.member_id,
            name: m.name,
            department: m.department,
            phone: m.phone,
            is_standby: m.is_standby,
            job: m.job,
            vehicle: m.vehicle,
            priority: m.is_standby ? 1 : 2
          });
        }
      });

      backups.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.name.localeCompare(b.name, 'vi');
      });

      contingency.push({
        shift_id: s.shift_id,
        type: s.type,
        type_label: s.type_label,
        day: s.day,
        date: s.date,
        slot: s.slot,
        location: s.location,
        current_assigned: s.assigned_members.map((m: any) => `${m.name} (${m.role})`),
        backup_candidates: backups.slice(0, 8),
        total_available_backups: backups.length
      });
    });
    return contingency;
  }
}
