# IADSS Alpha Testing Pack

Use this after the app is deployed and you have a public Render URL.

Vietnamese version: [alpha-testing.vi.md](alpha-testing.vi.md)

## Tester Message

Copy this message and send it to 2-3 friends or family members:

```text
Bạn đang đóng vai dược sĩ trong một nhà thuốc.

Mở app IADSS tại đây:
[Dán public URL vào đây]

Kịch bản 1: Thử bán Amoxicillin với thông tin không hợp lệ
- Patient ID: 00000
- Prescriber License Number: 98765
- Antibiotic Name: Amoxicillin
- Antibiotic Class: Penicillin
- Dosage: 500mg
- Quantity: 1
- Treatment Duration: 5

Kỳ vọng: hệ thống phải hiện cảnh báo đỏ và chặn giao dịch.

Kịch bản 2: Thử bán Amoxicillin với thông tin hợp lệ
- Patient ID: 12345
- Prescriber License Number: 98765
- Antibiotic Name: Amoxicillin
- Antibiotic Class: Penicillin
- Dosage: 500mg
- Quantity: 10
- Treatment Duration: 5

Kỳ vọng: hệ thống phải hiện thông báo xanh Approved.

Sau đó mở tab MOH Dashboard và kiểm tra:
- Cả 2 giao dịch đều xuất hiện trong bảng.
- Giao dịch bị chặn có nền đỏ nhạt.
- Misuse Rate hiển thị khoảng 50%.

Gửi feedback cho mình:
1. Cảnh báo đỏ có đủ rõ không?
2. Thông báo approved có dễ hiểu không?
3. Form POS có dễ nhập không?
4. Dashboard MOH có giúp phát hiện misuse nhanh không?
5. Có chỗ nào gây bối rối không?
```

## Doctor Portal Scenario

Use this to show the hospital-to-pharmacy flow:

```text
1. Open the Hospital / Doctor Portal tab.
2. Create a new prescription:
   Patient ID: 77777
   Prescriber License Number: DOC-2026
   Antibiotic Name: Cefixime
   Antibiotic Class: Cephalosporin
   Dosage: 200mg
   Quantity Limit: 14
   Treatment Duration: 7
   Expiry Date: 2027-12-31

3. Open the Pharmacy POS tab.
4. Try selling Cefixime using the same patient and prescription details.
5. Confirm the transaction is Approved.
6. Change one field, such as dosage or duration, and confirm it is Blocked.
```

## Feedback Log

| Tester | Invalid sale blocked? | Valid sale approved? | Dashboard clear? | Warning clear? | Notes |
| --- | --- | --- | --- | --- | --- |
| Tester 1 |  |  |  |  |  |
| Tester 2 |  |  |  |  |  |
| Tester 3 |  |  |  |  |  |

## Pass Criteria

The alpha test passes when:

- At least 2 testers can complete both POS scenarios without help.
- Invalid sale is blocked for every tester.
- Valid sale is approved for every tester.
- Dashboard shows both approved and blocked attempts.
- Testers understand that Misuse Rate means blocked attempts divided by total attempts.
- No tester reports a blocking UI issue.

## Known MVP Limits

- This is not a real medical verification system.
- Prescriptions are seeded demo records.
- Medicine lookup uses public APIs and fallback seed data, not Long Chau private APIs.
- There is no authentication yet.
- MOH sync is simulated by saving records into the backend database.
