-- =====================================================================================
-- SIGA — DESFAZER A DEMONSTRAÇÃO DOS HORÁRIOS (DH26)
-- Gerado por scripts/siga/gen-demo-horarios-seed.py — não editar à mão.
--
-- Apaga só o que SEED_DEMO_HORARIOS_2026.sql criou (ids determinísticos) e o que a
-- aplicação gerou depois sobre as turmas DH26 (versões do horário, sessões de presença,
-- notas, entregas). Recusa correr se alguma turma DH26 tiver alunos que não sejam os
-- da demonstração. O professor real ligado ao Inglês fica intacto; só perde as aulas DH26.
-- =====================================================================================
DO $purge$
DECLARE
  v_groups uuid[] := ARRAY['5745226b-2490-1739-306e-feef6aaad823', '529be39d-947d-880e-118e-667bb2c67475']::uuid[];
  v_students uuid[] := ARRAY['c284ad92-7903-d912-07dc-c32a79272419', '53fc09ed-00b6-b7a8-84a6-eaaa4ea121da', '2c46783b-55ac-aab4-e0f0-6ff902fccd7a', 'dc43ad51-854f-2055-7292-433e6b05e845', 'a88249c6-fddc-e13f-af0e-bdf34d4de4f1', '760ef8f3-a0c6-688b-1614-96b5d3741966', '5372961b-aec5-5ac7-ae21-2b77c9c13f6d', '73f923fd-ff2a-5c83-aad1-3c864fc50d40', '884eb039-444f-3521-ee14-ae7a49a6472a', '34baf7d6-7162-5cc3-b6ec-e4f863d1ce59', '095b4925-cb34-eabc-57a6-ee236e0c544d', '43bbf76b-7795-99b1-df54-b44a0e9c1eef', '9b68b1c8-de4b-07e6-481a-b5bb00f158de', '8f6c440c-fa38-9442-2bf1-74c84e7ae214', '7efffd09-7574-f6f1-4daf-b8a3b4e0ea77', '9f1cf1cd-a196-13ec-57a4-51d082535413', '03b8ce9d-3207-d723-f216-c4e7909e084f', '1729d96b-c61e-c807-c3ea-32f72d1af659', 'b354b871-da50-ab66-c08c-f98459a5f893', 'c400e3c7-ca9b-572f-7032-f05c5ba29bc2', 'fe40085f-4c35-bf1c-aae0-d29327565730', 'dfc48ed8-ea7b-ccee-225e-b2fa7598a09f', 'c104665f-7fdf-f58b-06ec-74da49d2f317', 'b0810141-feff-36ca-6aeb-d07380c5df15', '331cb3c1-083d-179b-6135-ec5d2fb7e94b', 'ac333ab0-249f-c198-b0d5-04443ca750b2', '62efc07c-f656-d888-8c47-c5e99af3169b', '229168fe-4a30-d214-7e2e-835f70b62db6', 'eb9edd55-c96e-7b1b-73e9-3cbdfc481b48', 'a0db0b65-a066-44fa-a4b0-cc19182d0fad']::uuid[];
  v_people uuid[] := ARRAY['f81102c0-1563-13a7-a701-1a413c2ff2a8', '0f074009-290f-37d1-4c8f-c45f5ea98fea', '2c8ed00f-29fa-7c74-fcf1-887ee9dc5577', '4c66ec66-6be0-4960-1faf-65cce6bb3d6e', 'ad86e5e3-db28-a5b5-db3a-99d4781d6b20', '975d5fa8-45d5-d5a4-957a-ac20251a3db9', '2c5eed6e-e008-e995-ea69-cf47f380a976', '53da423d-ba9f-3515-ea06-321c1c61685e', 'a44ce51d-5972-bc1f-00b9-7c089720382f', 'f0596386-3aaa-73aa-1c6b-30408dd2369c', '0e65523a-91b8-63fc-c929-ecfaf82c4e7e', '4340a534-1003-6992-b39f-c66b602ebc39', '38b4ad9e-95e4-e48e-90e2-c3b8bf3ae7ea', 'e5344103-42ad-b6f8-c94e-b6ba5e09ccd7', 'd38a57ac-1512-10e1-6c78-62ba266bed6f', '6656a7ec-085b-9e43-aac5-b3cf8a4f1344', 'a5edf6a1-7998-7ea7-035f-93481cce27ea', 'acf340ce-e153-df85-587e-da9196c0d590', 'ae555bb3-43d2-a934-fcb3-c951b36237a4', '4cc69ca5-671d-aa79-394b-ba867153a0de', 'b3ffeb34-0f4c-5983-9ea9-9ae067125bdd', '0a39c9e4-22a2-6d7e-d5b4-1c71031023be', '61eeec38-76ea-dfc8-03a8-399c0f17648d', '46aa0086-a5d7-0255-0759-d10151122944', '2624568d-88d2-b2f7-7b76-8afb52f6cd29', 'e9ba298c-dd5f-0620-98de-84460643e059', '71c4701c-ee2b-c7c4-02f7-1b6045e89322', '21732634-944b-7fd6-f3b4-440178ede68f', '8056f0dc-15a5-c639-0ef6-a9ab4c497cdf', '0d4bcc83-a307-b2af-3603-64da279befe7', '85c853de-9572-dc41-1e75-0da02987d63a', '41624df1-ab04-74ec-f644-c6218f480716', '012d3bbb-b47a-8716-aea3-c99db2ed98c7', 'db204b1d-f0f9-aed9-b887-2d74436f970f', 'dfd36c26-890f-eada-a379-4eb60512d1fa', '624a8d84-85f9-c194-a187-15ed0d81af40', 'd9fcb5c1-a9dd-fdfa-17be-863ef887fc8e', '5be5a36a-b3f3-f2e9-58bd-269646b5a6b9']::uuid[];
  v_n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_group_id = ANY (v_groups) AND NOT e.student_id = ANY (v_students)) THEN
    RAISE EXCEPTION 'Há matrículas reais nas turmas DH26; mova-as antes de limpar a demonstração.';
  END IF;

  DELETE FROM public.siga_class_task_submissions s USING public.siga_class_tasks t, public.class_subjects cs
   WHERE s.task_id = t.id AND t.class_subject_id = cs.id AND cs.class_group_id = ANY (v_groups);
  DELETE FROM public.siga_class_tasks t USING public.class_subjects cs WHERE t.class_subject_id = cs.id AND cs.class_group_id = ANY (v_groups);
  DELETE FROM public.siga_assessment_scores s USING public.siga_assessment_items i WHERE s.item_id = i.id AND i.class_group_id = ANY (v_groups);
  DELETE FROM public.siga_assessment_items WHERE class_group_id = ANY (v_groups);
  DELETE FROM public.siga_attendance_records r USING public.siga_attendance_sessions a WHERE r.session_id = a.id AND a.class_group_id = ANY (v_groups);
  DELETE FROM public.siga_lesson_meetings m USING public.siga_attendance_sessions a WHERE m.attendance_session_id = a.id AND a.class_group_id = ANY (v_groups);
  DELETE FROM public.siga_attendance_sessions WHERE class_group_id = ANY (v_groups);
  DELETE FROM public.siga_calendar_events WHERE class_group_id = ANY (v_groups);
  DELETE FROM public.siga_timetable_slot_details d USING public.timetable_slots t, public.class_subjects cs
   WHERE d.timetable_slot_id = t.id AND t.class_subject_id = cs.id AND cs.class_group_id = ANY (v_groups);
  DELETE FROM public.timetable_slots t USING public.class_subjects cs WHERE t.class_subject_id = cs.id AND cs.class_group_id = ANY (v_groups);
  DELETE FROM public.academic_schedules WHERE class_group_id = ANY (v_groups);
  DELETE FROM public.class_subjects WHERE class_group_id = ANY (v_groups);
  UPDATE public.class_groups SET delegate_student_id = NULL, homeroom_teacher_id = NULL WHERE id = ANY (v_groups);
  DELETE FROM public.enrollments WHERE class_group_id = ANY (v_groups);
  DELETE FROM public.class_groups WHERE id = ANY (v_groups);
  DELETE FROM public.students WHERE id = ANY (v_students);
  DELETE FROM public.siga_exam_sessions WHERE id IN ('36befb03-0522-ec42-be85-713ca1496dd9', '9bf59a3a-6250-f967-6532-971c23ba81ab');
  DELETE FROM public.teachers WHERE id IN ('c2da6940-dc7a-0228-8558-ee9abb4f3b2d', 'f2914218-be68-ea48-33b6-e0856990468d', '3c5be3dc-7011-f8b2-e65e-c80cf4e9bfa1', '690ee62c-2cc6-303b-152b-b50c46d3fa17', '7de77c99-e0c6-a879-7de2-ffb93c59d1a7', 'ec260a30-49c4-a3ed-cf79-a4d03a1d8a83', '41d08683-96d8-0159-bbe4-ae1e2e2c0cbb', 'acbf0122-1e67-ecd1-cb1a-fde347fcf9b5');
  DELETE FROM public.rooms WHERE id IN ('8adddbb3-7e86-adf6-634f-24b13c5cc85e', '01ce6733-8988-8c0a-51bd-5bfb892a4260', '2b259b56-be62-5da6-ef65-54f3a3873dd2', '1b93c140-ddd6-b434-b0c7-8c08c925f101', 'df160402-1f4a-0a2a-94e9-5a62bbc88d4c', '7bed8eb3-6de6-fdbb-3f8b-bf8e0c2b6f54');
  DELETE FROM public.people WHERE id = ANY (v_people);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Demonstração DH26 removida (% pessoas).', v_n;
END
$purge$;
