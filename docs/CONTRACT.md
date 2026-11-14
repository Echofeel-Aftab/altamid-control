# Lease contract version 1

Base URL example: `http://127.0.0.1:4100`

Public routes:

- `GET /v1/health`
- `GET /v1/keys` — verify keys. Products need the raw 32-byte Ed25519 key.
- `POST /v1/lease/check` — the check-in

Staff routes use `Authorization: Bearer`. They are for the dashboard, not for products.

## Check-in

Send JSON. Snake case is the canonical spelling. Camel case is accepted for the same fields.

```json
{
  "product": "crm",
  "license_key": "AS1.CRM.XXXX",
  "instance_id": "stable-id-for-this-install",
  "binding": "crm.client.com",
  "runtime": "php",
  "version": "1.3.9",
  "usage": { "seats": 8 }
}
```

`product` is the catalog code and must never be renamed.

`instance_id` is chosen by the product and must stay the same for that install. A server can use a stored UUID. A phone can use an app install id. Send it as `binding` for the host or device. `host` is accepted as an alias of `binding`.

`runtime` is a label such as `php`, `node`, `dotnet`, `react-native`, `android`, or `ios`. Control does not reject an unknown runtime.

`version` should be `MAJOR.MINOR.PATCH` when the product wants ordered updates. Other strings are stored and are not sorted.

## Reply

HTTP 200 means Control produced a signed answer. It does not mean the subscription is usable.

```json
{
  "ok": true,
  "alg": "Ed25519",
  "kid": "ed25519-1",
  "lease": {},
  "signature": ""
}
```

The signature is Ed25519 over the exact UTF-8 bytes of `canonicalJson(lease)`. Verify with the raw public key from `GET /v1/keys`. Reject the body if the signature fails, and treat that as “Control could not be reached”.

Canonical JSON rules are implemented in `packages/contract/canonical.ts` and `examples/php/canonical.php`. Tests require those two files to emit the same bytes.

## What the product obeys

`lease.usable` is the switch.

- `true`: the product runs normally
- `false`: the product restricts itself

`lease.verdict` explains why. Current verdicts:

`trialing`, `active`, `grace`, `past_due`, `not_started`, `suspended`, `expired`, `revoked`, `cancelled`, `unknown_key`, `unknown_product`, `product_mismatch`, `binding_mismatch`, `binding_unbound`, `instance_limit`, `seats_exceeded`, `update_required`, `unlicensed`, `invalid_request`

Products may show the verdict. They must not grow their own allow-list of verdict names. A later verdict is safe because `usable` already says what to do.

`lease.offline.until` is the last instant a previously usable lease may keep the product open while Control cannot be reached.

## Outlets

Some products (today `hrms-payroll`) run several outlets, such as Delhi Office and Bangalore Office, inside one install. Each outlet is a subscription of its own. Staff open it on the customer page as "One more outlet" on the main subscription. An outlet subscription has no key. The install keeps checking in with the main key.

For those products the lease carries:

```json
"outlets": {
  "allowed": 2,
  "units": [
    { "subscriptionId": "main-id", "main": true, "verdict": "active", "usable": true, "termEndsAt": "2027-03-31T23:59:59Z", "seatLimit": null, "seatsUsed": 14 },
    { "subscriptionId": "outlet-id", "main": false, "verdict": "expired", "usable": false, "termEndsAt": "2026-10-31T23:59:59Z", "seatLimit": 25, "seatsUsed": 9 }
  ]
}
```

- `allowed` counts the usable units. The product must not open more outlets than that.
- Each unit has its own `verdict` and `usable`. A unit that is not usable restricts only that outlet. A unit is never usable when the main lease is not.
- The product sends headcount per outlet as `usage.outlets`, an object from subscription id to a whole number, for example `{ "main-id": 14, "outlet-id": 9 }`. When the unit's subscription enforces its seat limit and the count is over it, that unit gets `seats_exceeded`.
- When the product sends `usage.outlets`, the main subscription's seat limit is checked against the main outlet's count, not the whole install. `usage.seats` stays the install total.
- A lease without `outlets` means the product runs one outlet.

## HTTP outcomes

| What happened | What the product does |
|---|---|
| 200 and the signature verifies | Replace the stored lease. Obey `usable` now. |
| 200 and the signature fails | Ignore the body. Use the offline rule. |
| 400, 429, 500, timeout, or no network | Offline rule. This is not a revoke. |

The offline rule is `decideAccess` in `packages/contract/policy.ts`. The PHP copy is `examples/php/decide.php`. Both are tested against `packages/contract/decisions.json`.

Port that function. Do not invent a second grace period in the product.

## Where the check runs

The check runs on the product's server. An Angular page, a React page, or a React Native app displays the result. It does not hold a private key and it does not decide access on its own. The product's API calls Control, verifies the lease, and tells the app whether it may continue.

## Compatibility promise

- Contract version stays `1` until a field changes meaning
- New fields may appear. Ignore unknown fields
- Existing fields do not change type or meaning
- Product codes and key tags do not change
- Keys are `AS1.<TAG>.<20 chars>` today. The check-in accepts future key text up to 120 characters, so a new key shape does not require a product release
