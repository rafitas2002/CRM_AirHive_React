-- Registers technical handoff context in DB for continuity across sessions.
-- This persists a concise operational snapshot in crm_events metadata.

INSERT INTO crm_events (
    event_type,
    user_id,
    entity_type,
    entity_id,
    metadata
)
VALUES (
    'system_handoff_context',
    NULL,
    'engineering_handoff',
    '2026-02-18-ui-badges-insights',
    jsonb_build_object(
        'recorded_at', NOW(),
        'scope', jsonb_build_array('ui_design', 'hover_pointer_rules', 'badges', 'insights_correlations_forecast', 'race_rules'),
        'icon_standard', jsonb_build_object(
            'background', 'dark_blue',
            'glyph', 'white',
            'style_token', 'ah-icon-card',
            'notes', 'Keep this shell across settings/admin/main windows'
        ),
        'hover_pointer_rules', jsonb_build_object(
            'clickable_elements', 'must_use_pointer_and_hover_feedback',
            'non_clickable_elements', 'must_not_show_pointer'
        ),
        'team_role_color_rules', jsonb_build_object(
            'admin_card_hover_outline', 'yellow_orange',
            'seller_card_hover_outline', 'green',
            'admin_silhouette', 'yellow_orange',
            'area_filter', 'unique_color_palette_with_hover'
        ),
        'admin_badge_colors_by_name', jsonb_build_object(
            'Jesus Gracia', 'purple',
            'Rafael', 'red',
            'Alberto', 'blue',
            'Eduardo', 'green'
        ),
        'badge_runtime_rules', jsonb_build_object(
            'popup_component', 'GlobalBadgeCelebration',
            'popup_trigger_tables', jsonb_build_array('seller_badge_events', 'seller_special_badge_events'),
            'race_points_weights', jsonb_build_object('first', 3, 'second', 2, 'third', 1),
            'race_points_leader_states', jsonb_build_array('active', 'historic')
        ),
        'insights_rules', jsonb_build_object(
            'correlations_window', 'must_exist_and_be_functional',
            'forecast_window', 'must_exist_and_be_functional',
            'forecast_examples', 'postpone_or_cancel_probability_by_company_size',
            'header_position', 'Data & Correlaciones must stay at top'
        ),
        'race_visual_rules', jsonb_build_object(
            'ties_share_position', true,
            'zero_value_starts_at_position', 4,
            'race_info_button', 'must_have_standard_hover_and_pointer'
        ),
        'recent_fix_files', jsonb_build_array(
            'src/app/(app)/admin/correlaciones/page.tsx',
            'src/app/(app)/usuarios/UsersClient.tsx',
            'src/components/GlobalBadgeCelebration.tsx',
            'src/components/ProfileView.tsx',
            'src/components/SellerRace.tsx'
        ),
        'reference_doc', 'docs/HANDOFF_CONTEXT_2026-02-18.md'
    )
)
ON CONFLICT DO NOTHING;
