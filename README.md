# Annasetu — Flask + MySQL edition

Annasetu is a surplus-food donation workflow connecting donors, NGOs and volunteers. This version keeps the existing HTML/CSS/JavaScript interface, 3D hero, map views, QR generation/scanning, pickup tracking, and analytics, while storing donation data and workflow events in MySQL through a Flask REST API.

## Stack

- Frontend: existing HTML, CSS and vanilla JavaScript (Three.js, QRCode.js, jsQR and Motion remain CDN-loaded)
- Backend: Python 3.10+, Flask, Flask-CORS
- Database: MySQL 8+

## 1. Create the database

1. Start MySQL Server and open MySQL Workbench.
2. Run `database/schema.sql` in Workbench. It creates the `annasetu` database and tables.
3. Create a database user for local development (recommended instead of using root):

```sql
CREATE USER 'annasetu_app'@'localhost' IDENTIFIED BY 'change_this_password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
ON annasetu.* TO 'annasetu_app'@'localhost';
FLUSH PRIVILEGES;
```

Use the same credentials in `backend/.env`.

## 2. Configure and seed the backend

Open a terminal in the project folder:

```bash
cd backend
python -m venv .venv
```

Activate it:

- Windows PowerShell: `.venv\Scripts\Activate.ps1`
- macOS/Linux: `source .venv/bin/activate`

Install packages and configure environment variables:

```bash
pip install -r requirements.txt
```

Copy `.env.example` to `.env`, then set `MYSQL_USER` and `MYSQL_PASSWORD` to the account you created. From the `backend` folder, run:

```bash
python seed.py
python app.py
```

The API runs at `http://127.0.0.1:5000`. Verify it at `http://127.0.0.1:5000/api/health` and open `http://127.0.0.1:5000/api/bootstrap` to inspect demo state.

If using a root MySQL account with no password locally, set `MYSQL_USER=root` and `MYSQL_PASSWORD=` in `.env` instead.

## 3. Run the frontend

In a second terminal, from the project folder (the parent of `backend`), run:

```bash
python -m http.server 8000
```

Open `http://127.0.0.1:8000`. Do not open the HTML directly as a `file://` URL. The frontend calls the API at `http://127.0.0.1:5000/api` by default. To change it, set `window.ANNASETU_API_BASE` before `app.js` loads in `index.html`.

## API routes

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | API/database health |
| GET | `/api/bootstrap` | Partners, donations, event history for the UI |
| POST | `/api/donations` | Create a donation with server-side validation |
| POST | `/api/donations/<id>/claim` | Claim donation; transaction and NGO capacity check |
| POST | `/api/donations/<id>/dispatch` | Assign an available volunteer |
| POST | `/api/pickup/verify` | Validate pickup QR/code and log verification |
| POST | `/api/donations/<id>/deliver` | Confirm delivery only after pickup |
| POST | `/api/expire` | Expire donations past their safe-to-eat time |
| POST | `/api/demo/reset` | Re-seed demo data for local development |

## Preserved workflow

`listed → claimed → enroute → picked → delivered`; listed/claimed/enroute donations can also expire. The app retains donor and NGO selectors for demo use, donation form validation, QR generation, camera/manual scanning, volunteer assignment, pickup tracking, expiry countdowns, Google Maps support and analytics. Records are loaded from MySQL; changes are applied through Flask endpoints.

## Important security note

This package is configured for local development and project demonstration. The existing UI uses “acting as” selectors and the API currently accepts those partner IDs without real user authentication. Do **not** deploy it publicly or use it with real personal data until authentication, role-based authorization, CSRF/CORS policy, rate limits, secure QR tokens, audit review and production secret management are implemented. The `/api/demo/reset` route must be disabled in production. The QR code is a demo pickup identifier, not an authentication secret.

Google Maps still requires your own API key for the live map/marker integration. Camera QR scanning normally requires localhost or HTTPS.
