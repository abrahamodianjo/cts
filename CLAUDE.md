# CTS (Care Timesheet)
Staff clock-in/out app for UK healthcare (care homes, domiciliary, supported living).
Staff tap NFC tags (QR fallback) at locations; GPS verified against location radius.

## Stack
- Backend: Node.js/Express + PostgreSQL (schema in cts-schema.sql)
- Mobile: React Native via Expo dev build (NFC requires dev build, not Expo Go)
- Admin dashboard: React web app

## Key rules
- attendance_events is insert-only (CQC audit trail); corrections go in attendance_corrections
- Shifts contain ordered shift_visits (domiciliary = many visits per shift)
- Clock-in validation: credential token + shift assignment + GPS within radius_metres
- GPS outside radius = flag for review, don't reject
- UK GDPR: no real personal data in dev; UK data residency for hosting

## Build order
1. Backend: auth ✅ (in src/), then locations+credentials, then clock-in endpoint
2. Admin dashboard
3. React Native app (NFC last)