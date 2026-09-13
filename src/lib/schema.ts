// Database schema. Every statement is idempotent, so it runs safely on every cold start
// and from `npm run db:setup`. Add new columns with ALTER TABLE ... ADD COLUMN IF NOT EXISTS.

export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS account (
    id text PRIMARY KEY,
    email text NOT NULL UNIQUE,
    display_name text NOT NULL,
    role text NOT NULL CHECK (role IN ('admin', 'judge')),
    password_hash text NOT NULL,
    failed_logins integer NOT NULL DEFAULT 0,
    locked_until timestamptz,
    disabled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS session (
    token_hash text PRIMARY KEY,
    account_id text NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS event (
    id text PRIMARY KEY,
    year integer NOT NULL,
    title text NOT NULL,
    status text NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'judging', 'finalised')),
    rubric jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    finalised_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS roll_import (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    kind text NOT NULL,
    file_name text NOT NULL,
    row_count integer NOT NULL,
    added integer NOT NULL,
    updated integer NOT NULL,
    uploaded_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS student (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    student_number text NOT NULL,
    email text NOT NULL,
    surname text NOT NULL,
    first_name text NOT NULL,
    middle_name text NOT NULL DEFAULT '',
    section text NOT NULL,
    sex text NOT NULL DEFAULT '',
    program_code text NOT NULL DEFAULT '',
    course_code text NOT NULL DEFAULT '',
    faculty text NOT NULL DEFAULT '',
    UNIQUE (event_id, student_number)
  )`,
  `CREATE TABLE IF NOT EXISTS adviser (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    name text NOT NULL,
    name_key text NOT NULL,
    email text NOT NULL DEFAULT '',
    UNIQUE (event_id, name_key)
  )`,
  `CREATE TABLE IF NOT EXISTS tgroup (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL,
    name_key text NOT NULL,
    section text NOT NULL DEFAULT '',
    adviser_id text REFERENCES adviser(id) ON DELETE SET NULL,
    UNIQUE (event_id, code),
    UNIQUE (event_id, name_key)
  )`,
  `CREATE TABLE IF NOT EXISTS group_member (
    event_id text NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    group_id text NOT NULL REFERENCES tgroup(id) ON DELETE CASCADE,
    student_id text NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, student_id),
    UNIQUE (event_id, student_id)
  )`,
  `CREATE TABLE IF NOT EXISTS event_judge (
    event_id text NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    account_id text NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, account_id)
  )`,
  `CREATE TABLE IF NOT EXISTS score_sheet (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    group_id text NOT NULL REFERENCES tgroup(id) ON DELETE CASCADE,
    half text NOT NULL CHECK (half IN ('defense', 'booth')),
    judge_id text NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'complete')),
    completed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (group_id, half, judge_id)
  )`,
  `CREATE TABLE IF NOT EXISTS score_value (
    sheet_id text NOT NULL REFERENCES score_sheet(id) ON DELETE CASCADE,
    criterion_key text NOT NULL,
    value double precision NOT NULL CHECK (value >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (sheet_id, criterion_key)
  )`,
  `CREATE TABLE IF NOT EXISTS member_score (
    sheet_id text NOT NULL REFERENCES score_sheet(id) ON DELETE CASCADE,
    student_id text NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    field text NOT NULL CHECK (field IN ('presentation', 'communication', 'qa')),
    value double precision NOT NULL CHECK (value >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (sheet_id, student_id, field)
  )`,
  `CREATE TABLE IF NOT EXISTS change_log (
    id text PRIMARY KEY,
    event_id text REFERENCES event(id) ON DELETE CASCADE,
    account_id text,
    action text NOT NULL,
    detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS score_sheet_event ON score_sheet(event_id, half)`,
  `CREATE INDEX IF NOT EXISTS student_event ON student(event_id, section)`,

  // ── Added 14 September 2026 (finalising, corrections, absences, private links). ──
  // Additive only: new nullable or defaulted columns and new tables. The first version of the app ignores all of it,
  // so these statements are safe to apply to its database before or after this version is deployed.
  `ALTER TABLE event ADD COLUMN IF NOT EXISTS released_at timestamptz`,
  // A group finalised without every score (decision 5), with the coordinator's reason.
  `ALTER TABLE tgroup ADD COLUMN IF NOT EXISTS accept_reason text, ADD COLUMN IF NOT EXISTS accepted_at timestamptz`,
  // A student on the roll deliberately left out of every group (decision 6).
  `ALTER TABLE student ADD COLUMN IF NOT EXISTS excluded_reason text, ADD COLUMN IF NOT EXISTS excluded_at timestamptz`,
  // A member absent from the defense (decision 6).
  `ALTER TABLE group_member ADD COLUMN IF NOT EXISTS absent_at timestamptz, ADD COLUMN IF NOT EXISTS absent_by text`,
  // A coordinator's correction of a judge's score (decision 7): who, when, why, and the judge's own value.
  `ALTER TABLE score_value ADD COLUMN IF NOT EXISTS corrected_by text, ADD COLUMN IF NOT EXISTS corrected_at timestamptz,
     ADD COLUMN IF NOT EXISTS correction_reason text, ADD COLUMN IF NOT EXISTS judge_value double precision`,
  `ALTER TABLE member_score ADD COLUMN IF NOT EXISTS corrected_by text, ADD COLUMN IF NOT EXISTS corrected_at timestamptz,
     ADD COLUMN IF NOT EXISTS correction_reason text, ADD COLUMN IF NOT EXISTS judge_value double precision`,
  // The short code the coordinator hands an adviser to open their private link (decision 8).
  `ALTER TABLE adviser ADD COLUMN IF NOT EXISTS link_code text NOT NULL DEFAULT ''`,
  // Private links (decision 8). Only a fingerprint of each link's code is stored.
  `CREATE TABLE IF NOT EXISTS access_link (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    recipient_type text NOT NULL CHECK (recipient_type IN ('student', 'adviser')),
    recipient_id text NOT NULL,
    code_hash text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    revoked_at timestamptz,
    failed_attempts integer NOT NULL DEFAULT 0,
    locked_at timestamptz,
    first_opened_at timestamptz,
    last_opened_at timestamptz,
    open_count integer NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS access_link_recipient ON access_link(event_id, recipient_type, recipient_id)`,
  `CREATE TABLE IF NOT EXISTS link_session (
    token_hash text PRIMARY KEY,
    link_id text NOT NULL REFERENCES access_link(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
];
