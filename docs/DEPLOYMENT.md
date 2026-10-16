# Setup & deployment

## 1. Database
Any PostgreSQL 13+ works, for example Supabase, Neon, AWS RDS or a self-hosted server.
1. Create a database and a dedicated user that has rights **only** on that database.
2. Set `DATABASE_URL` (on Supabase, use the *pooled* connection string on serverless hosts, and set `DATABASE_SSL=true`).
3. Run `npm run migrate`.
4. Database access control: the app connects with one server-side role. Patient data is never sent to the browser except to signed-in staff through the authenticated `/api/staff/*` routes. If you use Supabase, **do not** expose these tables through Supabase's public API: enable RLS with no policies, or revoke access from `anon` and `authenticated`:
   ```sql
   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
   ```

## 2. Hosting
The app is a standard Next.js 15 project (`npm run build && npm start`). It runs on Vercel, Render, Railway, Fly.io or any Node 20+ server.
- Set the environment variables from `.env.example` in the host's dashboard. Never commit them.
- Serve over **HTTPS**. Staff session cookies are marked `Secure` in production.
- Rate limiting is in memory, per instance. For several instances, put Redis/Upstash behind `lib/rateLimit.ts` or use your host's firewall rate limits.
- Only trust `X-Forwarded-For` behind a proxy you control (Vercel, Render and similar hosts set it correctly).

## 3. Staff accounts
```bash
npm run create-admin -- --email person@clinic.example --name "Name" --role admin   # or --role staff
```
The password is typed in at the prompt (at least 12 characters, letters and numbers). Running the command again for the same email resets the password and signs out existing sessions.
- **admin**: everything, plus CSV export and deleting records.
- **staff**: view, search, update status, add notes, retry notifications.

## 4. Email notifications (optional)
Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `NOTIFY_FROM_EMAIL` and `STAFF_NOTIFICATION_EMAILS` (comma-separated). Use a sending provider such as Amazon SES, SendGrid, Brevo or Google Workspace SMTP. Use only addresses the clinic has given you. Until this is set, the dashboard shows email as *not configured* and each enquiry records a `not_configured` notification row.

## 5. WhatsApp Business Platform (optional)
The clinic's existing number **is not assumed** to be on the WhatsApp Business Platform. To connect a number:
1. Create a Meta Business account and a WhatsApp Business app in Meta for Developers, and register a phone number. A number already used in the WhatsApp app must be migrated first.
2. Create a permanent System User access token → `WHATSAPP_ACCESS_TOKEN`. Phone number ID → `WHATSAPP_PHONE_NUMBER_ID`. App secret → `WHATSAPP_APP_SECRET`. Choose any random string → `WHATSAPP_VERIFY_TOKEN`.
3. Webhook URL: `https://YOUR-APP-DOMAIN/api/whatsapp/webhook`, with the same verify token. Subscribe to the `messages` field.
4. Submit **templates** in WhatsApp Manager (category *Utility*):
   - Staff alert (`WHATSAPP_TEMPLATE_STAFF_ALERT`): e.g. "New home physiotherapy enquiry {{1}}: {{2}}, {{3}}, preferred {{4}} {{5}}, {{6}}. Please review in the dashboard."
   - Patient status (`WHATSAPP_TEMPLATE_PATIENT_STATUS`): e.g. "Update on your Physiotherapy Treatment at Home request {{1}}: {{2}}. Reply STOP to opt out."
5. Add staff numbers to `STAFF_WHATSAPP_NUMBERS`. Each staff member must agree to receive the alerts.

Behaviour:
- Replies to patients are free-form text, sent only in response to the patient's own message (inside the 24-hour customer-service window).
- Messages the clinic starts (staff alerts, patient status updates) use approved templates only. A patient status update is sent only when staff tick the box, and never to someone who has opted out.
- `STOP` or `UNSUBSCRIBE` opts a patient out, and `START` opts them back in.
- Duplicate webhook deliveries are ignored, using the message or status ID.
- A delivery failure reported by Meta (`statuses[].status = failed`) marks the notification as failed in the dashboard.

## 6. Scheduled jobs
- **Notification retry:** `POST /api/cron/notifications` with `Authorization: Bearer $CRON_SECRET`, every 5–15 minutes.
- **Retention:** `npm run retention` daily. It deletes cancelled or completed enquiries older than `RETENTION_DAYS` (default 365), stale chat sessions, old webhook IDs and expired staff sessions. Agree the retention period with the clinic.
- **Deletion requests:** an admin can delete a single enquiry from the dashboard. Every deletion is recorded in `audit_log` (reference only).

## 7. Database outage behaviour
- The chat greeting still loads. Submitting shows "your request has NOT been submitted — please try again or call 077158 77047". Nothing is falsely acknowledged.
- `/api/health` returns 503. The staff dashboard shows a "database unavailable" banner.
- Connect your host's uptime monitor to `/api/health` so staff are alerted.
