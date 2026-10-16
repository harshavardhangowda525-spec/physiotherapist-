# Delivery checklist

## ✅ Implemented and tested
These are covered by automated tests (`npm test`, 35 passing on a local PostgreSQL 16), plus a browser test on a production build (`next build && next start`).

| # | Scenario | Evidence |
|---|---|---|
| 1 | Complete enquiry: saved, reference created, notifications logged | `integration.test.ts` scenario 1, chat API end-to-end, browser test (screenshots in `docs/`) |
| 2 | Incomplete or invalid details (phone, name, past or impossible date, no consent) | `conversation.test.ts` scenario 2/2b, `integration.test.ts` scenario 2 |
| 3 | Unverified date: stored as a *preference*, with an explicit "clinic will confirm" message | `conversation.test.ts` scenarios 3 & 4 |
| 4 | Clinic hasn't confirmed: patient status says "not yet a confirmed appointment" until staff confirm | `integration.test.ts` scenario 4 |
| 5 | Duplicate WhatsApp webhook event processed once | `integration.test.ts` scenario 5 |
| 6 | Notification provider fails (error result or exception): enquiry kept, failure logged, retry works | `integration.test.ts` scenarios 6, 6b |
| 7 | Patient cancel / reschedule (needs reference and matching phone) | `conversation.test.ts`, `integration.test.ts` scenario 7 |
| 8 | Unknown prices, areas or services → standard fallback | `conversation.test.ts` scenario 8 |
| 9 | Diagnosis requests refused; urgent symptoms → emergency advice and flag | `conversation.test.ts` scenario 9 + urgent test |
| 10 | Unauthorised dashboard access (no or forged session → 401; staff blocked from export/delete → 403; cross-origin changes → 403; login brute force → 429) | `integration.test.ts` scenarios 10, 10b |
| 11 | WhatsApp credentials missing → webhook returns 503 "not configured", notifications recorded as `not_configured` | `integration.test.ts` scenario 11 |
| 12 | Database unreachable → `DatabaseUnavailableError`, HTTP 503 with the clinic's phone number, chat says "NOT submitted" | `integration.test.ts` + `conversation.test.ts` scenario 12 |

Also tested: WhatsApp signature check, handshake, full WhatsApp request flow with numbered replies, STOP opt-out, delivery-failure callbacks, CSV formula-injection escaping, chat rate limiting, HttpOnly session cookie.

## ⚙️ Integrations: built, but NOT live (no credentials supplied)
| Integration | State | Note |
|---|---|---|
| Email (SMTP) | Built, tested with a simulated transport only | Real sending **not tested**. Needs SMTP details and staff addresses from the clinic. |
| WhatsApp Cloud API | Built, tested with simulated payloads and send function | **No real Meta account connected.** Needs a registered number, token, app secret and approved templates. |
| AI provider (Groq) | Built, optional | **No API key supplied, so no live calls were made.** The assistant runs on rules without it. |
| Hosting | Production build passes | Not deployed anywhere yet. |

## 📝 Remaining setup tasks for the clinic
1. Choose hosting and a managed PostgreSQL. Set `DATABASE_URL` and run `npm run migrate`.
2. Create real staff accounts with `npm run create-admin`.
3. Add the `<script>` tag to physiotherapytreatmentathome.com and set `CHAT_EMBED_ALLOWED_ORIGINS`.
4. Give staff email addresses and SMTP details, then send a test enquiry.
5. (Optional) Register a number on the WhatsApp Business Platform, get templates approved, set the variables, then send a test message.
6. (Optional) Add a Groq API key.
7. Schedule the notification-retry job and `npm run retention`, and agree the retention period.
8. **Clinic to confirm before any of it is added to the assistant:** service areas, treatments offered, charges, therapist availability (including female or male therapists) and appointment slots. Until then the assistant says the clinic team will confirm.
9. Have the clinic review the consent and privacy wording in `lib/business.ts` (e.g. against India's DPDP Act 2023 obligations).
