import os
import unittest
import openpyxl
from data_loader import load_shifts_master, load_members_data, get_availability_heatmap
from scheduler_engine import ShiftScheduler
from excel_exporter import export_schedule_to_excel

class TestShiftScheduler(unittest.TestCase):
    def setUp(self):
        self.shifts = load_shifts_master("Danh_sach_ca.xlsx")
        self.members = load_members_data("Danh_sach_dang_ky_truc_ca_50_nguoi.xlsx")

    def test_data_loading_and_heatmap(self):
        self.assertEqual(len(self.shifts), 70)
        self.assertEqual(len(self.members), 50)
        
        heatmap = get_availability_heatmap(self.members)
        self.assertEqual(len(heatmap['matrix']), 7)
        self.assertEqual(len(heatmap['slots']), 5)

    def test_optimization_solver_with_roles(self):
        config = {
            'phong_chinh_count': 3,
            'phong_dp_count': 1,
            'enable_ca_ngoai': True,
            'custom_ca_ngoai': [
                {'id': 'NGOAI_01', 'name': 'Quán Café A', 'day': 'Thứ 7', 'start_time': '17:00', 'end_time': '19:30', 'chinh': 2, 'dp': 1}
            ]
        }
        scheduler = ShiftScheduler(shifts=self.shifts, members=self.members, config=config)
        result = scheduler.optimize()
        
        self.assertTrue(result['success'])
        self.assertIn(result['status'], ['OPTIMAL', 'FEASIBLE'])
        
        # Verify roles assigned
        for s in result['assigned_shifts']:
            roles = [m['role'] for m in s['assigned_members']]
            self.assertTrue(any(r == 'Chính' for r in roles))
            
        audit = result['audit_results']
        self.assertEqual(audit['conflict_count'], 0)
        self.assertEqual(audit['availability_violation_count'], 0)
        self.assertEqual(audit['empty_room_count'], 0)

    def test_excel_export_6_sheets(self):
        scheduler = ShiftScheduler(shifts=self.shifts, members=self.members)
        result = scheduler.optimize()
        test_out = "reports/test_output.xlsx"
        
        export_schedule_to_excel(result, test_out)
        self.assertTrue(os.path.exists(test_out))
        
        wb = openpyxl.load_workbook(test_out)
        required_sheets = ['Tổng ca trực', 'ca trong', 'ca ngoài', 'thống kê', 'kiểm tra ca', 'ca vắng']
        
        for s in required_sheets:
            self.assertIn(s, wb.sheetnames, f"Missing required sheet: {s}")
            
        wb.close()

if __name__ == '__main__':
    unittest.main()
