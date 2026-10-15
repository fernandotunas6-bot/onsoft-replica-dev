-- Momento (ms desde 1970) em que a conta recebeu uma senha temporária.
-- NULL: a pessoa já escolheu a sua senha (ou a conta é anterior a esta regra).
-- Enquanto não for NULL, a app obriga a trocar a senha antes de continuar.
ALTER TABLE Users ADD COLUMN temp_password_issued_at INTEGER;
