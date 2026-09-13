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
];
