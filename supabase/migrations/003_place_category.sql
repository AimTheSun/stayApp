-- Optional category / favorite for a place: Home, Work, Food, Friends, Other.
-- Nullable — a place doesn't have to be tagged.
alter table places add column if not exists category text;
