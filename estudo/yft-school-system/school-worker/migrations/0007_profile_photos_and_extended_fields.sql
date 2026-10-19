-- Student profile extensions
ALTER TABLE Students ADD COLUMN photo_url TEXT;
ALTER TABLE Students ADD COLUMN previous_school TEXT;
ALTER TABLE Students ADD COLUMN address TEXT;
ALTER TABLE Students ADD COLUMN emergency_contact_name TEXT;
ALTER TABLE Students ADD COLUMN emergency_contact_phone TEXT;
ALTER TABLE Students ADD COLUMN blood_group TEXT;
ALTER TABLE Students ADD COLUMN medical_notes TEXT;

-- User (teacher/staff) profile extensions
ALTER TABLE Users ADD COLUMN photo_url TEXT;
ALTER TABLE Users ADD COLUMN residential_address TEXT;
ALTER TABLE Users ADD COLUMN qualification TEXT;
ALTER TABLE Users ADD COLUMN years_experience INTEGER;
ALTER TABLE Users ADD COLUMN subjects_text TEXT;
ALTER TABLE Users ADD COLUMN ssnit_number TEXT;
ALTER TABLE Users ADD COLUMN marital_status TEXT;
ALTER TABLE Users ADD COLUMN emergency_contact_name TEXT;
ALTER TABLE Users ADD COLUMN emergency_contact_phone TEXT;
ALTER TABLE Users ADD COLUMN bank_name TEXT;
ALTER TABLE Users ADD COLUMN bank_account_number TEXT;
ALTER TABLE Users ADD COLUMN bank_account_holder TEXT;
ALTER TABLE Users ADD COLUMN date_of_birth TEXT;
ALTER TABLE Users ADD COLUMN gender TEXT;
