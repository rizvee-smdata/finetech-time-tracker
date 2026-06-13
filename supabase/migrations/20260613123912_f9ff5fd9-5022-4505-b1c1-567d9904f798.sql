WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY company_id,
                        LOWER(TRIM(customer_name)),
                        LOWER(TRIM(COALESCE(email,''))),
                        REGEXP_REPLACE(COALESCE(phone,''),'\D','','g')
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.customers
)
DELETE FROM public.customers c
USING ranked r
WHERE c.id = r.id AND r.rn > 1;