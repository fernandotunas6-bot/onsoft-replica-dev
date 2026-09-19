BEGIN;

SELECT plan(6);

SELECT has_column('public', 'people', 'province', 'people has province');
SELECT has_column('public', 'people', 'municipality', 'people has municipality');
SELECT has_column('public', 'people', 'commune', 'people has commune');
SELECT has_column('public', 'people', 'address', 'people has address');
SELECT ok(
  to_regclass('public.people_school_province_idx') IS NOT NULL,
  'province filter index exists'
);
SELECT ok(
  to_regclass('public.people_school_province_municipality_idx') IS NOT NULL,
  'province and municipality filter index exists'
);

SELECT * FROM finish();
ROLLBACK;
