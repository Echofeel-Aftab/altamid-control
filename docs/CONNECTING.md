# Connecting a product later

Do this only when that product is ready to call Control. Phase 1 does not connect the CRM, the website, or HRMS.

## Before writing any product code

1. Create the customer and subscription in the Control dashboard.
2. Issue a key and copy it once.
3. Open Connection lab and check in with that product code, the key, a stable instance id, and the host or device id.
4. Confirm `usable` is true and the browser reports the signature verified.
5. Revoke the key in a test subscription and confirm the next check-in returns `usable: false`.
6. Set the product connection state to Ready only after that lab run is clean.

## What to add inside the product

Add a small client next to that product's server code. It is not part of the UI project.

1. On a timer, `POST /v1/lease/check` with the body in `docs/CONTRACT.md`.
2. Load the raw public key from `GET /v1/keys` and cache it.
3. Build the canonical JSON and verify the Ed25519 signature.
4. Pass the verified lease to the same decision as `decideAccess`.
5. Store the last verified lease on disk or in that product's own database.
6. If the request fails, time out, or the signature is bad, call `decideAccess` with `transportFailed: true` and the stored lease. Do not treat the failure as a revoke.
7. If the fresh lease verifies, obey `usable` immediately.

PHP products can follow `examples/php/canonical.php`, `examples/php/decide.php`, and `examples/php/verify_sig.php`. PHP needs the sodium extension (`extension=sodium`, or `php -d extension=sodium` for a one-off check).

Node products import `packages/contract/canonical.ts` and `packages/contract/policy.ts`.

A React, Angular, or React Native app asks its own backend. The backend is the piece that talks to Control.

## What Control will not do

Control will not open a product database, import that product's customers, or change that product's screens. Binding, seats, and revoke arrive on the next check-in. An install that is switched off learns about a revoke when it checks in again, or when `offline.until` passes, whichever comes first.

## CRM, when that phase starts

The CRM already checks a license desk over HTTP. The later connection is a compatibility route inside Control plus a new `hq_url` on a test CRM. CRM screens stay as they are. That work is not part of this build.
