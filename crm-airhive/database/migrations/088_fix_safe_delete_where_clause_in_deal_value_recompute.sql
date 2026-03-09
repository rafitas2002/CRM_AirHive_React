-- Hotfix: some environments enforce safe-delete and reject DELETE without WHERE.
-- This patches recompute_seller_deal_value_tier_badges_usd to use WHERE TRUE
-- in temp-table resets, without changing the rest of the function body.

DO $$
DECLARE
    v_def TEXT;
BEGIN
    IF to_regprocedure('public.recompute_seller_deal_value_tier_badges_usd(uuid,bigint)') IS NULL THEN
        RAISE EXCEPTION 'Function public.recompute_seller_deal_value_tier_badges_usd(uuid,bigint) not found';
    END IF;

    v_def := pg_get_functiondef('public.recompute_seller_deal_value_tier_badges_usd(uuid,bigint)'::regprocedure);

    -- Patch current and potential legacy variants.
    v_def := replace(v_def, 'DELETE FROM tmp_deal_value_tier_badges_usd;', 'DELETE FROM tmp_deal_value_tier_badges_usd WHERE TRUE;');
    v_def := replace(v_def, 'delete from tmp_deal_value_tier_badges_usd;', 'delete from tmp_deal_value_tier_badges_usd WHERE TRUE;');

    EXECUTE v_def;
END $$;

-- Verification helper (returns true when patch is present)
SELECT position(
    'DELETE FROM tmp_deal_value_tier_badges_usd WHERE TRUE;' IN
    pg_get_functiondef('public.recompute_seller_deal_value_tier_badges_usd(uuid,bigint)'::regprocedure)
) > 0 AS safe_delete_patch_applied;
