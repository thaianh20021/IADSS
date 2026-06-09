# IADSS MVP

Integrated Drug Dispensing Surveillance System MVP built with Codex, Express, Vanilla JavaScript, and a Render-ready backend.

Vietnamese version: [README.vi.md](README.vi.md)

## Features

- Role selector for Pharmacy, Hospital / Doctor, and MOH users.
- Registration and login with role-based API access for Pharmacy, Doctor / Hospital, and MOH accounts.
- Each account has a unique username; for Pharmacy accounts this is the Pharmacy ID, and for Doctor / Hospital accounts this is the Doctor ID.
- Pharmacy Portal that loads a prescription by ID / QR code before dispensing.
- Hospital / Doctor Portal for creating valid prescription records with diagnosis fields.
- Prescription validation against prescriptions entered through the Hospital / Doctor Portal.
- Prescription status checks: Valid, Partially Dispensed, Fully Dispensed, Expired, Cancelled.
- Partial dispensing is allowed; over-remaining quantities are blocked and logged.
- MOH dashboard with approved and blocked transaction history.
- Settings tab for managing drug and drug / antibiotic class reference lists.
- PostgreSQL support through `DATABASE_URL`.
- Local file fallback database for quick development without external setup.
- Medicine search endpoint using public APIs with a configurable drug fallback list.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Do not open `public/index.html` directly with `file://`, because auth and API calls require the Express backend. On Render, use the public Render URL.

## Local Test Checklist

1. Create one Doctor / Hospital account, one Pharmacy account, and one MOH account from the sign-in screen. Use usernames such as `doctor-demo-001`, `pharma-demo-001`, and `moh-demo-001`; these become the role IDs.
2. Log in as the Doctor / Hospital account and open the Hospital / Doctor Portal tab.
3. Create a prescription:
   - Prescription ID: `RX-2026-0001`
   - Patient ID: `12345`
   - Hospital / Clinic: `National General Hospital`
   - Prescriber License Number: `98765`
   - Drug Name: `Amoxicillin`
   - Drug / Antibiotic Class: `Penicillin`
   - Dosage: `500mg`
   - Quantity Limit: `20`
   - Treatment Duration: `5`
   - Expiry Date: any future date
4. Log out, log in as the Pharmacy account, open the Pharmacy Portal tab, load `RX-2026-0001`, and dispense quantity `10`.
5. Confirm the green message appears: `Transaction Approved. Data synced to MOH.`
6. Load the same prescription again and try dispensing quantity `11`.
7. Confirm the red message appears because only `10` remain.
8. Dispense the remaining `10` and confirm the status becomes `Fully Dispensed`.
9. Submit an invalid transaction:
   - Prescription ID: `RX-UNKNOWN`
   - Quantity: `1`
10. Confirm the red message appears: `HIGH RISK ALERT: Invalid Prescription. Sale Blocked.`
11. Log out, log in as the MOH account, and open the MOH Dashboard tab.
12. Confirm Approved, Blocked, and prescription status are logged.
13. Confirm the blocked row has a light red background.
14. Open Settings to add or remove drugs and drug classes used by dropdowns.
15. Click `Clear Data` to reset the dashboard for another test run.

You can also run the automated smoke test:

```bash
npm run smoke
```

The smoke test verifies health, registration/login, username-based role IDs, role-scoped API access, reference lists, doctor-created prescriptions, pharmacy lookup privacy, partial dispensing, over-remaining blocks, transaction history, intervention rate, and medicine lookup.

## Render Deployment

Recommended path:

1. Push this project to GitHub.
2. In Render, choose **New +** then **Blueprint**.
3. Select the repository and let Render read `render.yaml`.
4. Confirm it creates:
   - Web Service: `iadss-mvp`
   - PostgreSQL database: `iadss-db`
5. Deploy the Blueprint.
6. Open the public Render URL after the deploy finishes.
7. Run the Local Test Checklist against the Render URL.
8. Run the smoke test against the Render URL:

```bash
npm run smoke -- https://your-iadss-service.onrender.com
```

Manual path:

1. Create a Render PostgreSQL database.
2. Copy its internal connection string.
3. Create a Render Web Service from this repo.
4. Build command: `npm install`.
5. Start command: `npm start`.
6. Add environment variable `DATABASE_URL` with the PostgreSQL connection string.
7. Optional: add `OPENFDA_API_KEY` for higher openFDA quota.
8. Run `npm run smoke -- https://your-iadss-service.onrender.com`.

If `DATABASE_URL` is not set, the app uses a local JSON file fallback. That is useful for local development, but Render should use PostgreSQL so transaction history survives service restarts.

## Alpha Testing Script

Send your public Render URL to 2-3 testers with this message:

```text
You are a pharmacist testing an antibiotic surveillance MVP.

1. Open the Hospital / Doctor Portal tab and create a prescription:
   Prescription ID: RX-2026-0001
   Patient ID: 12345
   Hospital / Clinic: National General Hospital
   Prescriber License Number: 98765
   Antibiotic Name: Amoxicillin
   Antibiotic Class: Penicillin
   Dosage: 500mg
   Quantity Limit: 20
   Treatment Duration: 5
   Expiry Date: any future date

2. Try selling Amoxicillin with fake prescription details:
   Prescription ID: RX-UNKNOWN
   Patient ID: 00000
   Hospital / Clinic: National General Hospital
   Prescriber License Number: 98765
   Antibiotic Class: Penicillin
   Dosage: 500mg
   Quantity: 1
   Treatment Duration: 5

3. Then try selling Amoxicillin with valid prescription details:
   Prescription ID: RX-2026-0001
   Patient ID: 12345
   Hospital / Clinic: National General Hospital
   Prescriber License Number: 98765
   Antibiotic Class: Penicillin
   Dosage: 500mg
   Quantity: 10
   Treatment Duration: 5

Please tell me:
- Did the system clearly block the invalid sale?
- Did the approved transaction message make sense?
- Was the POS form easy to use?
- Did the MOH Dashboard make suspicious activity easy to spot?
```

For a fuller Vietnamese tester script, feedback table, and pass criteria, use [docs/alpha-testing.vi.md](docs/alpha-testing.vi.md).

## API

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
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

## Public Medicine Data

The medicine search endpoint tries public APIs first and then falls back to the configured drug list:

1. openFDA Drug Label API
2. RxNorm/RxNav API
3. Local fallback drugs

The app does not scrape Long Chau or call private/hidden Long Chau endpoints.

This is a demo MVP only and is not a production medical system.
