-- Applied in SGA as migration 20260924014124.
-- Replace row-by-row auth.uid() evaluation with an init-plan-safe scalar subquery.

DROP POLICY IF EXISTS "Read own calendar feed token" ON public.calendar_feed_tokens;
CREATE POLICY "Read own calendar feed token" ON public.calendar_feed_tokens
FOR SELECT TO authenticated
USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Revoke own calendar feed token" ON public.calendar_feed_tokens;
CREATE POLICY "Revoke own calendar feed token" ON public.calendar_feed_tokens
FOR DELETE TO authenticated
USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "auth_view_own_contact_profile" ON public.contact_verification_profiles;
CREATE POLICY "auth_view_own_contact_profile" ON public.contact_verification_profiles
FOR SELECT TO authenticated
USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Send school direct messages" ON public.siga_direct_messages;
CREATE POLICY "Send school direct messages" ON public.siga_direct_messages
FOR INSERT TO authenticated
WITH CHECK (is_school_member(school_id) AND sender_id = (select auth.uid()));

DROP POLICY IF EXISTS "Write school file events" ON public.siga_file_events;
CREATE POLICY "Write school file events" ON public.siga_file_events
FOR INSERT TO authenticated
WITH CHECK (is_school_member(school_id) AND actor_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Write school files" ON public.siga_files;
CREATE POLICY "Write school files" ON public.siga_files
FOR ALL TO authenticated
USING (is_school_member(school_id))
WITH CHECK (is_school_member(school_id) AND owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "auth_view_own_communication_prefs" ON public.user_communication_preferences;
CREATE POLICY "auth_view_own_communication_prefs" ON public.user_communication_preferences
FOR SELECT TO authenticated
USING (user_id = (select auth.uid()));
