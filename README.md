# IADSS MVP

Integrated Antibiotic Dispensing Surveillance System MVP built with Codex, Express, Vanilla JavaScript, and a Render-ready backend.

Vietnamese version: [README.vi.md](README.vi.md)

## Features

- Pharmacy POS transaction form.
- Hospital / Doctor Portal for creating valid prescription records.
- Prescription validation against prescriptions entered through the Hospital / Doctor Portal.
- MOH dashboard with approved and blocked transaction history.
- Settings tab for managing antibiotic and antibiotic class reference lists.
- PostgreSQL support through `DATABASE_URL`.
- Local file fallback database for quick development without external setup.
- Medicine search endpoint using public APIs with a configurable antibiotic fallback list.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Local Test Checklist

1. Open the Hospital / Doctor Portal tab.
2. Create a prescription:
   - Patient ID: `12345`
   - Hospital / Clinic: `National General Hospital`
   - Prescriber License Number: `98765`
   - Antibiotic Name: `Amoxicillin`
   - Antibiotic Class: `Penicillin`
   - Dosage: `500mg`
   - Quantity Limit: `20`
   - Treatment Duration: `5`
   - Expiry Date: any future date
3. Open the Pharmacy POS tab and submit a matching transaction:
   - Patient ID: `12345`
   - Hospital / Clinic: `National General Hospital`
   - Prescriber License Number: `98765`
   - Antibiotic Name: `Amoxicillin`
   - Antibiotic Class: `Penicillin`
   - Dosage: `500mg`
   - Quantity: `10`
   - Treatment Duration: `5`
4. Confirm the green message appears: `Transaction Approved. Data synced to MOH.`
5. Submit an invalid transaction:
   - Patient ID: `00000`
   - Hospital / Clinic: `National General Hospital`
   - Prescriber License Number: `98765`
   - Antibiotic Name: `Amoxicillin`
   - Antibiotic Class: `Penicillin`
   - Dosage: `500mg`
   - Quantity: `1`
   - Treatment Duration: `5`
6. Confirm the red message appears: `HIGH RISK ALERT: Invalid Prescription. Sale Blocked.`
7. Open the MOH Dashboard tab and confirm both transactions are logged.
8. Confirm the blocked row has a light red background.
9. Open Settings to add or remove antibiotics and antibiotic classes used by dropdowns.
10. Click `Clear Data` to reset the dashboard for another test run.

You can also run the automated smoke test:

```bash
npm run smoke
```

The smoke test verifies health, reference lists, doctor-created prescriptions, approved transactions, a blocked transaction, transaction history, a 33% misuse rate, and medicine lookup.

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
   Patient ID: 00000
   Hospital / Clinic: National General Hospital
   Prescriber License Number: 98765
   Antibiotic Class: Penicillin
   Dosage: 500mg
   Quantity: 1
   Treatment Duration: 5

3. Then try selling Amoxicillin with valid prescription details:
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
- `GET /api/prescriptions`
- `POST /api/prescriptions`
- `GET /api/medicines/search?q=amoxicillin`
- `GET /api/reference/antibiotics`
- `POST /api/reference/antibiotics`
- `DELETE /api/reference/antibiotics/:value`
- `GET /api/reference/antibioticClasses`
- `POST /api/reference/antibioticClasses`
- `DELETE /api/reference/antibioticClasses/:value`
- `GET /api/transactions`
- `POST /api/transactions`
- `DELETE /api/transactions`

## Public Medicine Data

The medicine search endpoint tries public APIs first and then falls back to the configured antibiotic list:

1. openFDA Drug Label API
2. RxNorm/RxNav API
3. Local fallback antibiotics

The app does not scrape Long Chau or call private/hidden Long Chau endpoints.

This is a demo MVP only and is not a production medical system.
