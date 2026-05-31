# IADSS MVP

MVP cho **IADSS (Integrated Antibiotic Dispensing Surveillance System)**, được xây bằng Codex, Express, Vanilla JavaScript và backend sẵn sàng deploy lên Render.

## Tính năng

- Form **Pharmacy POS** để nhà thuốc gửi giao dịch bán kháng sinh.
- Tab **Hospital / Doctor Portal** để bác sĩ hoặc bệnh viện tạo đơn thuốc hợp lệ.
- Xác minh đơn thuốc dựa trên prescription registry trong backend.
- Dashboard **MOH** hiển thị giao dịch Approved/Blocked và tỷ lệ misuse.
- Hỗ trợ PostgreSQL qua `DATABASE_URL`.
- Có local JSON fallback để chạy nhanh khi chưa có database.
- Gợi ý thuốc qua API công khai và seed antibiotic list.

## Chạy local

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

Các đơn thuốc seed hữu ích:

| Patient ID | Bệnh viện / Phòng khám | Prescriber License | Thuốc | Quantity Limit |
| --- | --- | --- | --- | --- |
| 12345 | National General Hospital | 98765 | Amoxicillin, Penicillin, 500mg, 5 days | 20 |
| 24680 | City Children Hospital | 13579 | Azithromycin, Macrolide, 250mg, 3 days | 6 |
| 11223 | District Medical Center | 44556 | Cephalexin, Cephalosporin, 500mg, 7 days | 28 |

## Checklist test local

1. Mở tab **Pharmacy POS**.
2. Gửi giao dịch hợp lệ:
   - Patient ID: `12345`
   - Hospital / Clinic: `National General Hospital`
   - Prescriber License Number: `98765`
   - Antibiotic Name: `Amoxicillin`
   - Antibiotic Class: `Penicillin`
   - Dosage: `500mg`
   - Quantity: `10`
   - Treatment Duration: `5`
3. Xác nhận hiện thông báo xanh: `Transaction Approved. Data synced to MOH.`
4. Gửi giao dịch không hợp lệ:
   - Patient ID: `00000`
   - Hospital / Clinic: `National General Hospital`
   - Prescriber License Number: `98765`
   - Antibiotic Name: `Amoxicillin`
   - Antibiotic Class: `Penicillin`
   - Dosage: `500mg`
   - Quantity: `1`
   - Treatment Duration: `5`
5. Xác nhận hiện cảnh báo đỏ: `HIGH RISK ALERT: Invalid Prescription. Sale Blocked.`
6. Mở tab **MOH Dashboard** và xác nhận cả hai giao dịch đều được ghi nhận.
7. Xác nhận giao dịch bị chặn có nền đỏ nhạt.
8. Bấm `Clear Data` để reset dashboard khi cần test lại.

Có thể chạy smoke test tự động:

```bash
npm run smoke
```

Smoke test kiểm tra health, seed prescriptions, doctor-created prescription, giao dịch Approved, giao dịch Blocked, transaction history, misuse rate 33% và medicine lookup.

## Deploy lên Render

Cách khuyến nghị:

1. Push project này lên GitHub.
2. Trong Render, chọn **New +** rồi chọn **Blueprint**.
3. Chọn repository và để Render đọc file `render.yaml`.
4. Xác nhận Render tạo:
   - Web Service: `iadss-mvp`
   - PostgreSQL database: `iadss-db`
5. Deploy Blueprint.
6. Mở public Render URL sau khi deploy xong.
7. Chạy checklist test ở trên với Render URL.
8. Chạy smoke test với Render URL:

```bash
npm run smoke -- https://your-iadss-service.onrender.com
```

Cách thủ công:

1. Tạo Render PostgreSQL database.
2. Copy internal connection string.
3. Tạo Render Web Service từ repo này.
4. Build command: `npm install`.
5. Start command: `npm start`.
6. Thêm biến môi trường `DATABASE_URL` bằng PostgreSQL connection string.
7. Tùy chọn: thêm `OPENFDA_API_KEY` để tăng quota openFDA.
8. Chạy `npm run smoke -- https://your-iadss-service.onrender.com`.

Nếu không có `DATABASE_URL`, app sẽ dùng local JSON fallback. Cách này tiện cho local development, nhưng khi deploy Render nên dùng PostgreSQL để dữ liệu không mất khi service restart.

## Flow Hospital-to-Pharmacy

1. Bác sĩ hoặc bệnh viện mở tab **Hospital / Doctor Portal**.
2. Nhập đơn thuốc hợp lệ cho bệnh nhân.
3. Nhà thuốc mở tab **Pharmacy POS**.
4. Nhà thuốc nhập thông tin bán kháng sinh.
5. IADSS đối chiếu giao dịch với đơn thuốc hợp lệ.
6. Nếu khớp: giao dịch Approved.
7. Nếu thiếu/sai thông tin, sai thuốc, sai class, sai dosage, vượt quantity hoặc vượt duration: giao dịch Blocked.
8. MOH Dashboard ghi nhận cả Approved và Blocked để theo dõi misuse.

## Alpha testing

Gửi public Render URL cho 2-3 người test. Kịch bản đầy đủ bằng tiếng Việt nằm ở [docs/alpha-testing.vi.md](docs/alpha-testing.vi.md).

## API

- `GET /api/health`
- `GET /api/prescriptions`
- `POST /api/prescriptions`
- `GET /api/medicines/search?q=amoxicillin`
- `GET /api/transactions`
- `POST /api/transactions`
- `DELETE /api/transactions`

## Dữ liệu thuốc công khai

Endpoint medicine search sẽ thử nguồn công khai trước, rồi fallback về seed antibiotic list:

1. openFDA Drug Label API
2. RxNorm/RxNav API
3. Local fallback antibiotics

App không scrape Long Châu và không gọi private/hidden API của các website bán thuốc.

Đây là MVP demo, không phải hệ thống y tế production.
