-- Migration 004: Add structured KPI snapshot to analyses
alter table analyses add column if not exists kpis jsonb;
alter table analyses add column if not exists personal_records jsonb;
