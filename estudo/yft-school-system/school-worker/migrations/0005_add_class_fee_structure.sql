ALTER TABLE Classes ADD COLUMN fee_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE Classes ADD COLUMN fee_collection_cycle TEXT NOT NULL DEFAULT 'term';
ALTER TABLE Classes ADD COLUMN fee_last_applied_period TEXT;

ALTER TABLE Transactions ADD COLUMN class_id TEXT;
ALTER TABLE Transactions ADD COLUMN fee_collection_cycle TEXT;
ALTER TABLE Transactions ADD COLUMN fee_period_key TEXT;