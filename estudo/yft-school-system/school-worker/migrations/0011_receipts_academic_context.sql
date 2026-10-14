-- Academic period context for fee receipts (from school calendar when payment is recorded).
ALTER TABLE Receipts ADD COLUMN academic_year TEXT;
ALTER TABLE Receipts ADD COLUMN fee_term TEXT;
