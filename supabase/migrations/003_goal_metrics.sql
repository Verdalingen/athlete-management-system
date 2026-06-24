-- Migration 003: Add computed goal metrics to analyses table
alter table analyses add column if not exists bench_e1rm_kg numeric;
alter table analyses add column if not exists predicted_5k_secs int;
