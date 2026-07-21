# CTS (Care Timesheet)
Staff clock-in/out app for UK healthcare (care homes, domiciliary, supported living).
Staff tap NFC tags (QR fallback) at locations; GPS verified against location radius.

## Stack
- Backend: Node.js/Express + PostgreSQL (schema in cts-schema.sql)
- Entry point: src/index.js (npm run dev)
- Mobile: React Native via Expo dev build (NFC requires dev build, not Expo Go)
- Admin dashboard: React web app

## Key rules
- attendance_events is insert-only (CQC audit trail); corrections go in attendance_corrections
- Shifts contain ordered shift_visits (domiciliary = many visits per shift)
- Clock-in validation: credential token + shift assignment + GPS within radius_metres
- GPS outside radius = flag for review, don't reject
- All queries scoped to the user's organization_id (multi-tenant isolation)
- UK GDPR: no real personal data in dev; UK data residency for hosting

## Dev fixtures
- staff@testcare.example (org 1, staff) / admin2@otherorg.example (org 2, admin)

## Build order
1. Backend: auth ✅, locations+credentials ✅, attendance/clock-in ⏳, status tracking
2. Admin dashboard
3. React Native app (NFC last)