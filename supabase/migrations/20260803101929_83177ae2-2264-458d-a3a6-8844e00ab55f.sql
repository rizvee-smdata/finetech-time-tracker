CREATE OR REPLACE FUNCTION public.purge_company_data(
  _company_id uuid,
  _mode text DEFAULT 'data',
  _confirm text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super boolean;
  v_name text;
  v_keep text[] := ARRAY['company_members'];
  v_config text[] := ARRAY[
    'attendance_settings','followup_settings','narrative_settings','visit_analytics_settings',
    'whatsapp_settings','whatsapp_templates','company_gmail_config','crm_capture_keys',
    'crm_custom_field_defs','crm_document_templates','crm_message_templates','crm_oems',
    'crm_products','crm_territories','crm_saved_views','custom_object_defs','expense_categories',
    'expense_approver_assignments','form_field_defs','kb_oems','tms_task_statuses','tms_labels',
    'tms_saved_views','visit_frequency_rules','lead_routing_rules','workflows','company_holidays',
    'survey_templates','crm_competitors','gmail_accounts'
  ];
  v_tables text[];
  v_pending text[];
  v_next text[];
  t text;
  v_deleted bigint;
  v_result jsonb := '{}'::jsonb;
  v_total bigint := 0;
  v_pass int;
BEGIN
  SELECT COALESCE(is_super_admin, false) INTO v_is_super
  FROM public.profiles WHERE id = auth.uid();

  IF NOT COALESCE(v_is_super, false) THEN
    RAISE EXCEPTION 'Super admin access required';
  END IF;

  SELECT name INTO v_name FROM public.companies WHERE id = _company_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  IF _confirm IS DISTINCT FROM v_name THEN
    RAISE EXCEPTION 'Confirmation text does not match the company name';
  END IF;

  IF _mode NOT IN ('data','all') THEN
    RAISE EXCEPTION 'Invalid mode';
  END IF;

  SELECT array_agg(c.table_name ORDER BY c.table_name) INTO v_tables
  FROM information_schema.columns c
  JOIN information_schema.tables tb
    ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
   AND tb.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public'
    AND c.column_name = 'company_id'
    AND NOT (c.table_name = ANY(v_keep))
    AND (_mode = 'all' OR NOT (c.table_name = ANY(v_config)));

  v_pending := COALESCE(v_tables, ARRAY[]::text[]);

  -- Multiple passes so parent/child ordering resolves itself
  FOR v_pass IN 1..6 LOOP
    EXIT WHEN array_length(v_pending, 1) IS NULL;
    v_next := ARRAY[]::text[];
    FOREACH t IN ARRAY v_pending LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE company_id = $1', t) USING _company_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        IF v_deleted > 0 THEN
          v_result := v_result || jsonb_build_object(t, v_deleted);
          v_total := v_total + v_deleted;
        END IF;
      EXCEPTION WHEN others THEN
        v_next := array_append(v_next, t);
      END;
    END LOOP;
    EXIT WHEN array_length(v_next, 1) IS NULL
           OR array_length(v_next, 1) = array_length(v_pending, 1);
    v_pending := v_next;
  END LOOP;

  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, summary, metadata)
  VALUES (
    _company_id, auth.uid(), 'purge', 'company', _company_id,
    format('Purged %s rows from %s (mode: %s)', v_total, v_name, _mode),
    jsonb_build_object('mode', _mode, 'total_rows', v_total, 'per_table', v_result,
                       'skipped', COALESCE(to_jsonb(v_pending), '[]'::jsonb))
  );

  RETURN jsonb_build_object(
    'ok', true,
    'company', v_name,
    'mode', _mode,
    'total_rows', v_total,
    'per_table', v_result,
    'skipped', COALESCE(to_jsonb(v_pending), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_company_data(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.purge_company_data(uuid, text, text) TO authenticated, service_role;