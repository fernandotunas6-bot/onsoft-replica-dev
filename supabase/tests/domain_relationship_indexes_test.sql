BEGIN;

SELECT plan(9);

SELECT has_index('public', 'profiles', 'profiles_school_id_idx',
  'profile lookup and school integrity are indexed');
SELECT has_index('public', 'attachments', 'attachments_school_id_idx',
  'attachment tenant filtering is indexed for every row');
SELECT has_index('public', 'person_documents', 'person_documents_school_person_idx',
  'person document joins are indexed');
SELECT has_index('public', 'person_roles', 'person_roles_school_person_idx',
  'person role joins are indexed');
SELECT has_index('public', 'person_relationships', 'person_relationships_school_person_idx',
  'outgoing person relationships are indexed');
SELECT has_index('public', 'person_relationships', 'person_relationships_school_related_idx',
  'incoming person relationships are indexed');
SELECT has_index('public', 'student_guardians', 'student_guardians_school_student_idx',
  'student guardian lookup is indexed in tenant order');
SELECT has_index('public', 'enrollments', 'enrollments_school_student_idx',
  'student enrollment lookup is indexed in tenant order');
SELECT has_index('public', 'enrollments', 'enrollments_school_year_idx',
  'academic-year enrollment lookup is indexed');

SELECT * FROM finish();
ROLLBACK;
