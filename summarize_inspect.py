import json

with open('inspect_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

ca_truc = data['Danh_sach_ca']['CaTruc']
print("Total shifts in Danh_sach_ca.xlsx (CaTruc):", len(ca_truc))
print("Sample CaTruc items:")
for c in ca_truc[:10]:
    print(c)

print("\nLast 5 CaTruc items:")
for c in ca_truc[-5:]:
    print(c)

thanh_vien = data['Danh_sach_ca']['ThanhVien']
print(f"\nThanhVien in Danh_sach_ca.xlsx: {len(thanh_vien)} rows")

dang_ki = data['Danh_sach_ca']['DangKiCa']
print(f"DangKiCa in Danh_sach_ca.xlsx: {len(dang_ki)} rows")

reg_50 = data['Danh_sach_dang_ky_50']['Danh sách đăng ký trực ca']
print(f"\nDanh_sach_dang_ky_50 rows: {len(reg_50['records'])}")
print("Columns:", reg_50['columns'])
print("\nFirst 3 records of 50 people registration:")
for r in reg_50['records'][:3]:
    print(r)
