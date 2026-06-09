-- Live stays: a stay with left_at NULL is in progress (the running timer).
-- The client closes it by setting left_at + duration_s.
alter table stays alter column left_at drop not null;
alter table stays alter column duration_s drop not null;
