# IADSS MVP

MVP cho **IADSS (Integrated Drug Dispensing Surveillance System)**, được xây bằng Codex, Express, Vanilla JavaScript và backend sẵn sàng deploy lên Render.

## Tính Năng

- Màn hình đầu cho chọn vai trò: **Pharmacy**, **Doctor / Hospital**, hoặc **MOH**.
- **Hospital / Doctor Portal** cho bác sĩ tạo toa thuốc hợp lệ, kèm chẩn đoán cơ bản, ICD-10, ghi chú lâm sàng và dị ứng thuốc.
- **Pharmacy Portal** cho nhà thuốc nhập hoặc scan `Prescription ID / QR Code`, hệ thống tự tải thuốc, liều dùng, số lượng còn lại.
- Trạng thái toa: `Valid`, `Partially Dispensed`, `Fully Dispensed`, `Expired`, `Cancelled`.
- Cho phép bán từng phần. Nếu nhập số lượng bán ra lớn hơn số lượng còn lại, giao dịch bị block và được ghi vào dashboard.
- **MOH Dashboard** hiển thị Approved, Blocked và misuse rate.
- **Settings** cho thêm/xóa danh sách thuốc và nhóm thuốc.
- Hỗ trợ PostgreSQL qua `DATABASE_URL`; nếu chưa có DB thì dùng JSON local để demo.
- Tìm thuốc qua openFDA/RxNorm, fallback về danh sách thuốc cấu hình trong Settings.

## Chạy Local

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

## Checklist Test Local

1. Vào màn hình đầu và chọn **Doctor / Hospital**.
2. Tạo một toa thuốc:
   - Prescription ID: `RX-2026-0001`
   - Patient ID: `12345`
   - Hospital / Clinic: `National General Hospital`
   - Prescriber License Number: `98765`
   - Main Diagnosis: nhập bất kỳ để demo
   - Drug Name: `Amoxicillin`
   - Drug / Antibiotic Class: `Penicillin`
   - Dosage: `500mg`
   - Quantity Limit: `20`
   - Treatment Duration: `5`
   - Expiry Date: chọn ngày trong tương lai
3. Chọn **Pharmacy**.
4. Load `RX-2026-0001`, nhập `Dispense Quantity = 10`, bấm **Mark as Dispensed**.
5. Xác nhận alert xanh: `Transaction Approved. Data synced to MOH.`
6. Load lại toa đó, nhập `Dispense Quantity = 11`.
7. Xác nhận alert đỏ vì toa chỉ còn `10` viên.
8. Nhập `Dispense Quantity = 10` để bán nốt phần còn lại.
9. Load lại toa và xác nhận trạng thái thành `Fully Dispensed`.
10. Chọn **MOH Dashboard** và kiểm tra transaction Approved/Blocked, misuse rate, row Blocked nền đỏ nhạt.
11. Vào **Settings** để thêm/xóa thuốc hoặc drug class.
12. Bấm `Clear Data` nếu muốn reset transaction history cho lần test tiếp theo.

Chạy smoke test tự động:

```bash
npm run smoke
```

Smoke test kiểm tra health, reference lists, doctor-created prescription, pharmacy lookup privacy, partial dispensing, block khi vượt remaining quantity, dashboard misuse rate và medicine lookup.

## Flow Hospital-To-Pharmacy

1. Bác sĩ/bệnh viện nhập diagnosis và toa thuốc vào IADSS.
2. Toa được lưu trong prescription registry trung tâm.
3. Nhà thuốc nhập hoặc scan `Prescription ID / QR Code`.
4. IADSS trả về dữ liệu tối thiểu cho nhà thuốc: thuốc, class, liều dùng, quantity limit, remaining quantity, thời gian dùng, trạng thái toa.
5. Nhà thuốc nhập số lượng bán ra và bấm **Mark as Dispensed**.
6. Nếu số lượng hợp lệ và toa chưa hết hạn/chưa hủy/chưa bán hết: Approved.
7. Nếu toa không tồn tại, hết hạn, bị hủy, đã bán hết, hoặc nhập vượt số lượng còn lại: Blocked.
8. MOH Dashboard ghi nhận cả Approved và Blocked để theo dõi misuse.

## Minimum Necessary Data Sharing

Pharmacy được thấy:

- Prescription ID / QR code status
- Thuốc được kê
- Drug / antibiotic class
- Liều dùng
- Quantity limit và remaining quantity
- Thời gian dùng
- Trạng thái toa
- Prescriber ID và facility/hospital ID

Pharmacy không được thấy:

- Diagnosis
- Full EMR/EHR
- Lab results
- Medical history không liên quan
- Ghi chú lâm sàng của bác sĩ
- Dị ứng thuốc nếu chưa có cơ chế chia sẻ phù hợp

## Deploy Lên Render

1. Push project lên GitHub.
2. Trong Render, chọn **New +** rồi **Blueprint**.
3. Chọn repository và để Render đọc `render.yaml`.
4. Render sẽ tạo Web Service `iadss-mvp` và PostgreSQL database `iadss-db`.
5. Deploy xong thì mở public URL và chạy checklist ở trên.

Chạy smoke test trên Render:

```bash
npm run smoke -- https://your-iadss-service.onrender.com
```

## API Chính

- `GET /api/health`
- `GET /api/prescriptions`
- `GET /api/prescriptions/:prescriptionId`
- `POST /api/prescriptions`
- `POST /api/prescriptions/:prescriptionId/cancel`
- `GET /api/medicines/search?q=amoxicillin`
- `GET /api/reference/drugs`
- `POST /api/reference/drugs`
- `DELETE /api/reference/drugs/:value`
- `GET /api/reference/drugClasses`
- `POST /api/reference/drugClasses`
- `DELETE /api/reference/drugClasses/:value`
- `GET /api/transactions`
- `POST /api/transactions`
- `DELETE /api/transactions`

Đây là MVP demo, chưa phải hệ thống y tế production. App không scrape Long Châu và không gọi private/hidden API của website bán thuốc.
