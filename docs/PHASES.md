# Build phases

Control is the authority. Each Altamid product stays in its own codebase and only calls Control. The website and the CRM are not edited during phases 1 to 3.

## Phase 1 — Foundation (this build)

A separate Node and TypeScript API, an Angular team dashboard, and a MySQL database named `altamid_control`.

Shipped now:

- Permanent product codes: `crm`, `hrms-payroll`, `shopsuite`, `invoice-billing`, `projects`, `desk`
- Customers and one subscription per product
- License keys shown once, stored only as a hash
- `POST /v1/lease/check`, the only call a product needs
- Ed25519 signature over canonical JSON
- One access function, `decideAccess`, with the same results in TypeScript and PHP
- Host or device binding, seat limits, grace, revoke, and version pinning
- Release records: draft, publish, yank. No binary package yet
- Connection lab
- Staff roles: owner, support, release manager, viewer
- Audit log

Not shipped in this phase: uploadable update zips, a change inside the CRM, a change inside the website, instant demos.

## Phase 2 — Release packages

- Upload a package per product and version
- Store it outside the public web root
- Put `hasPackage: true` and a short-lived download token on the lease
- Keep every older package
- A yanked build stops being offered
- A subscriber can stay pinned to an older version

The CRM installer must keep its current safety rule when this is later connected: database, license config, and storage are not overwritten.

## Phase 3 — Language kits

The contract is already language-neutral. This phase only packages it:

- A small TypeScript client for Node backends behind Angular, React, or React Native
- A small PHP client for PHP products
- Further languages only when a product in that language is about to ship

Each kit does three things: send the check-in, verify the signature, call the same `decideAccess` rule. Kits do not contain product screens.

## Phase 4 — Connect the CRM, on a test install first

Still no rewrite of CRM screens.

- Add a compatibility route inside Control that answers today's CRM `POST /v1/heartbeat` and `POST /v1/update-package`
- Point one non-production CRM `hq_url` at Control
- Prove check-in, renew, revoke, seats, and update install
- Only then point a sold CRM at Control

Until that test passes, customer CRMs stay on the current CRM license desk.

## Phase 5 — Connect HRMS and later products

Each new product uses `POST /v1/lease/check` from its own backend. The browser or the phone never holds the signing secret and never decides the license by itself.

The product chooses what “restrict” means. Control only says `usable: false` and a verdict. HRMS might block new employees and payroll runs while old records stay readable. That choice stays in HRMS.

## Phase 6 — Public catalog and instant demos

The public website reads the product list from Control. “Try this product” asks Control for a short-lived demo subscription and a demo address. That needs each product to be able to create an empty tenant. It starts only after the team desk is in daily use.

## Rules that later phases must not break

- Product `code` and `keyTag` never change
- Lease field meanings never change. New fields may be added. Products ignore fields they do not know
- `usable` stays the switch. A new verdict must still set `usable` correctly
- A failed signature, HTTP error, or timeout is not a revoke. The product keeps the last valid lease until `offline.until`
- A verified lease is applied immediately
- Control never writes into a product database
