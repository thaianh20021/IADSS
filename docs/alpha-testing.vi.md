# Bộ Tài Liệu Alpha Testing IADSS

Dùng file này sau khi app đã deploy và bạn có public Render URL.

## Tin nhắn gửi tester

Copy tin nhắn này và gửi cho 2-3 người test:

```text
Bạn đang đóng vai dược sĩ trong một nhà thuốc.

Mở app IADSS tại đây:
[Dán public URL vào đây]

Kịch bản 0: Tạo đơn thuốc trước
1. Mở tab Hospital / Doctor Portal.
2. Nhập đơn thuốc:
   Prescription ID: RX-2026-0001
   Patient ID: 12345
   Hospital / Clinic: National General Hospital
   Prescriber License Number: 98765
   Antibiotic Name: Amoxicillin
   Antibiotic Class: Penicillin
   Dosage: 500mg
   Quantity Limit: 20
   Treatment Duration: 5
   Expiry Date: chọn ngày trong tương lai

Kịch bản 1: Thử bán Amoxicillin với thông tin không hợp lệ
- Prescription ID: RX-UNKNOWN
- Patient ID: 00000
- Hospital / Clinic: National General Hospital
- Prescriber License Number: 98765
- Antibiotic Name: Amoxicillin
- Antibiotic Class: Penicillin
- Dosage: 500mg
- Quantity: 1
- Treatment Duration: 5

Kỳ vọng: hệ thống phải hiện cảnh báo đỏ và chặn giao dịch.

Kịch bản 2: Thử bán Amoxicillin với thông tin hợp lệ
- Prescription ID: RX-2026-0001
- Patient ID: 12345
- Hospital / Clinic: National General Hospital
- Prescriber License Number: 98765
- Antibiotic Name: Amoxicillin
- Antibiotic Class: Penicillin
- Dosage: 500mg
- Quantity: 10
- Treatment Duration: 5

Kỳ vọng: hệ thống phải hiện thông báo xanh Approved.

Kịch bản 3: Gửi lại đúng giao dịch hợp lệ ở trên một lần nữa

Kỳ vọng: hệ thống phải chặn giao dịch với trạng thái Already Dispensed.

Sau đó mở tab MOH Dashboard và kiểm tra:
- Cả 2 giao dịch đều xuất hiện trong bảng.
- Giao dịch bị chặn có nền đỏ nhạt.
- Misuse Rate hiển thị dựa trên tỷ lệ giao dịch bị Blocked / tổng giao dịch.

Gửi feedback cho mình:
1. Cảnh báo đỏ có đủ rõ không?
2. Thông báo Approved có dễ hiểu không?
3. Form POS có dễ nhập không?
4. Dashboard MOH có giúp phát hiện misuse nhanh không?
5. Có chỗ nào gây bối rối không?
```

## Kịch bản Doctor Portal

Dùng kịch bản này để kiểm tra flow bệnh viện/bác sĩ tạo đơn thuốc trước, nhà thuốc kiểm tra sau:

```text
1. Mở tab Hospital / Doctor Portal.
2. Tạo đơn thuốc mới:
   Patient ID: 77777
   Prescription ID: RX-DOCTOR-77777
   Hospital / Clinic: University Medical Center
   Prescriber License Number: DOC-2026
   Antibiotic Name: Cefixime
   Antibiotic Class: Cephalosporin
   Dosage: 200mg
   Quantity Limit: 14
   Treatment Duration: 7
   Expiry Date: 2027-12-31

3. Mở tab Pharmacy POS.
4. Thử bán Cefixime với đúng Prescription ID, thông tin bệnh nhân và đơn thuốc vừa tạo.
5. Xác nhận giao dịch được Approved.
6. Đổi sai một trường, ví dụ dosage hoặc duration, và xác nhận giao dịch bị Blocked.
```

## Bảng ghi feedback

| Tester | Invalid sale blocked? | Valid sale approved? | Dashboard rõ không? | Cảnh báo rõ không? | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Tester 1 |  |  |  |  |  |
| Tester 2 |  |  |  |  |  |
| Tester 3 |  |  |  |  |  |

## Tiêu chí pass

Alpha test được xem là pass khi:

- Ít nhất 2 tester hoàn thành cả hai kịch bản POS mà không cần hỗ trợ.
- Giao dịch không hợp lệ bị Blocked với mọi tester.
- Giao dịch hợp lệ được Approved với mọi tester.
- Dashboard hiển thị cả Approved và Blocked attempts.
- Tester hiểu Misuse Rate là số giao dịch bị Blocked chia cho tổng số giao dịch.
- Không tester nào báo lỗi UI nghiêm trọng làm họ không thể hoàn thành test.

## Giới hạn của MVP

- Đây chưa phải hệ thống xác minh y tế thật.
- POS chỉ approve khi đơn thuốc đã được nhập từ Hospital / Doctor Portal.
- Medicine lookup dùng API công khai và danh sách fallback trong Settings, không dùng private API của Long Châu.
- Chưa có authentication.
- MOH sync được mô phỏng bằng cách lưu records vào backend database.
