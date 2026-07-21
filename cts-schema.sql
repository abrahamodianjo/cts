-- ============================================
-- CTS (Care Timesheet) — Database Schema v0.1
-- PostgreSQL 15+
-- Supports: care homes (fixed location) AND
-- domiciliary care (multiple visits per shift)
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------- ORGANIZATIONS ----------
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    care_type       TEXT NOT NULL CHECK (care_type IN
                      ('care_home','residential','domiciliary','supported_living','mixed')),
    cqc_number      TEXT,                -- CQC registration, optional
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- USERS (staff + admins) ----------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('admin','manager','staff')),
    phone           TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- LOCATIONS ----------
-- A care home building OR a client's home address
CREATE TABLE locations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            TEXT NOT NULL,        -- "Sunrise Care Home" or "Client: J.D. (Flat 2)"
    location_type   TEXT NOT NULL CHECK (location_type IN ('facility','client_home')),
    address_line1   TEXT NOT NULL,
    address_line2   TEXT,
    city            TEXT NOT NULL,
    postcode        TEXT NOT NULL,
    latitude        DOUBLE PRECISION NOT NULL,
    longitude       DOUBLE PRECISION NOT NULL,
    radius_metres   INTEGER NOT NULL DEFAULT 100,  -- allowed GPS radius
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- CREDENTIALS (NFC tag or QR code per location) ----------
CREATE TABLE credentials (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id     UUID NOT NULL REFERENCES locations(id),
    type            TEXT NOT NULL CHECK (type IN ('nfc','qr')),
    token           TEXT NOT NULL UNIQUE,   -- random secret written to tag / encoded in QR
    is_active       BOOLEAN NOT NULL DEFAULT true,
    rotated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_credentials_token ON credentials(token) WHERE is_active;

-- ---------- SHIFTS ----------
-- A shift is a staff member's scheduled working period.
-- For care homes: one shift = one visit at one location.
-- For domiciliary: one shift contains MANY visits (see shift_visits).
CREATE TABLE shifts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    staff_id        UUID NOT NULL REFERENCES users(id),
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end   TIMESTAMPTZ NOT NULL,
    status          TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled','in_progress','completed','missed','cancelled')),
    notes           TEXT,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (scheduled_end > scheduled_start)
);
CREATE INDEX idx_shifts_staff_date ON shifts(staff_id, scheduled_start);

-- ---------- SHIFT VISITS ----------
-- The planned stops within a shift. Care home shift = 1 row.
-- Domiciliary shift = many rows (one per client address), ordered.
CREATE TABLE shift_visits (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_id        UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    location_id     UUID NOT NULL REFERENCES locations(id),
    visit_order     INTEGER NOT NULL DEFAULT 1,       -- sequence within the shift
    planned_start   TIMESTAMPTZ NOT NULL,
    planned_end     TIMESTAMPTZ NOT NULL,
    status          TEXT NOT NULL DEFAULT 'planned'
                      CHECK (status IN ('planned','in_progress','completed','missed')),
    UNIQUE (shift_id, visit_order),
    CHECK (planned_end > planned_start)
);
CREATE INDEX idx_shift_visits_shift ON shift_visits(shift_id);

-- ---------- ATTENDANCE EVENTS ----------
-- Immutable log. One row per tap/scan (clock_in OR clock_out).
-- NEVER updated after insert — corrections go in attendance_corrections.
CREATE TABLE attendance_events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_visit_id      UUID NOT NULL REFERENCES shift_visits(id),
    staff_id            UUID NOT NULL REFERENCES users(id),
    location_id         UUID NOT NULL REFERENCES locations(id),
    credential_id       UUID REFERENCES credentials(id),
    event_type          TEXT NOT NULL CHECK (event_type IN ('clock_in','clock_out')),
    event_time          TIMESTAMPTZ NOT NULL DEFAULT now(),
    gps_latitude        DOUBLE PRECISION,
    gps_longitude       DOUBLE PRECISION,
    distance_metres     DOUBLE PRECISION,   -- computed distance from location at event time
    method              TEXT NOT NULL CHECK (method IN ('nfc','qr','manual_admin')),
    flagged             BOOLEAN NOT NULL DEFAULT false,
    flag_reason         TEXT,               -- e.g. 'gps_outside_radius', 'early_clock_in'
    device_info         TEXT                -- app version / device model, for auditing
);
CREATE INDEX idx_attendance_staff_time ON attendance_events(staff_id, event_time);
CREATE INDEX idx_attendance_flagged ON attendance_events(flagged) WHERE flagged;

-- ---------- ATTENDANCE CORRECTIONS ----------
-- Admin adjustments — original events remain untouched (CQC audit trail).
CREATE TABLE attendance_corrections (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attendance_event_id UUID REFERENCES attendance_events(id),
    shift_visit_id      UUID NOT NULL REFERENCES shift_visits(id),
    corrected_by        UUID NOT NULL REFERENCES users(id),
    correction_type     TEXT NOT NULL CHECK (correction_type IN
                          ('adjust_time','add_missing_event','void_event')),
    corrected_time      TIMESTAMPTZ,
    reason              TEXT NOT NULL,       -- mandatory: why the correction was made
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- STATUS LOG (Teams-style presence) ----------
CREATE TABLE status_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id        UUID NOT NULL REFERENCES users(id),
    shift_id        UUID REFERENCES shifts(id),
    status          TEXT NOT NULL CHECK (status IN
                      ('available','with_client','on_break','traveling','off_shift')),
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_status_staff ON status_log(staff_id, changed_at);

-- ---------- REFRESH TOKENS (auth) ----------
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked         BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
