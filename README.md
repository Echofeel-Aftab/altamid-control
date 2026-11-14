# Altamid Control

Team desk for every Altamid product. It issues subscribers, license keys, and version records. Each product, in any language, checks in over HTTPS and obeys a signed lease.

This folder is a separate product. It does not modify the public website or the CRM.

## Run it locally

1. Start MariaDB or MySQL from XAMPP (port 3306).
2. In `apps/api`, run `npm run dev`.
3. In `apps/dashboard`, run `npm start`.
4. Open `http://localhost:4200`.

The first owner password is written once to `apps/api/storage/admin.txt`. Sign in, then keep that file private. The default email is `admin@altamidsolutions.com`.

Control creates its own database, `altamid_control`. It does not read or write the CRM database or the website database.

## What is already in place

- Product catalog: CRM, HRMS & Payroll, ShopSuite, Invoice & Billing, Projects, Desk
- Customers, subscriptions, license keys, install check-ins
- Signed lease at `POST /v1/lease/check`
- The same access rule in TypeScript and PHP, locked by tests
- Releases as version records (the install file itself comes in a later phase)
- Audit log
- Connection lab, so a key can be proved before any product is wired up

## What is deliberately not connected yet

No live CRM, website, or HRMS install points at Control. Connecting them is a later phase and starts with a test install.

Read `docs/PHASES.md` for the order of work, and `docs/CONNECTING.md` before any product is attached.
