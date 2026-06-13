
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_entity_type TEXT := TG_ARGV[0];
  v_action TEXT;
  v_entity_id UUID;
  v_company_id UUID;
  v_actor UUID := auth.uid();
  v_meta jsonb := jsonb_build_object('op', TG_OP);
BEGIN
  IF TG_OP = 'INSERT' THEN v_action := 'create'; v_entity_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN v_action := 'update'; v_entity_id := NEW.id;
    v_meta := v_meta || jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  ELSE v_action := 'delete'; v_entity_id := OLD.id;
    v_meta := v_meta || jsonb_build_object('row', to_jsonb(OLD));
  END IF;

  BEGIN
    IF TG_OP = 'DELETE' THEN v_company_id := OLD.company_id;
    ELSE v_company_id := NEW.company_id;
    END IF;
  EXCEPTION WHEN undefined_column THEN v_company_id := NULL;
  END;

  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, summary, metadata)
  VALUES (v_company_id, v_actor, v_action, v_entity_type, v_entity_id,
          v_entity_type || ' ' || v_action, v_meta);
  RETURN COALESCE(NEW, OLD);
END $$;

-- Restore a deleted row from the latest delete audit entry
CREATE OR REPLACE FUNCTION public.restore_deleted_entity(_entity_type text, _entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _row jsonb;
  _table text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can restore deleted records' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT metadata->'row' INTO _row
  FROM public.audit_logs
  WHERE action='delete' AND entity_type=_entity_type AND entity_id=_entity_id
  ORDER BY created_at DESC LIMIT 1;

  IF _row IS NULL THEN RAISE EXCEPTION 'No deletion record found'; END IF;

  _table := CASE _entity_type
    WHEN 'customer' THEN 'customers'
    WHEN 'lead'     THEN 'crm_leads'
    WHEN 'quote'    THEN 'crm_quotes'
    ELSE NULL
  END;
  IF _table IS NULL THEN RAISE EXCEPTION 'Unknown entity type %', _entity_type; END IF;

  EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(null::public.%I, $1) ON CONFLICT (id) DO NOTHING', _table, _table)
    USING _row;
  RETURN _row;
END $$;
