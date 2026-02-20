-- Reactions for CRM quotes (like/dislike per user).

CREATE TABLE IF NOT EXISTS crm_quote_reactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quote_id BIGINT NOT NULL REFERENCES crm_quotes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'dislike')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (quote_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_quote_reactions_quote
    ON crm_quote_reactions (quote_id);

CREATE INDEX IF NOT EXISTS idx_crm_quote_reactions_type
    ON crm_quote_reactions (reaction_type);

CREATE OR REPLACE FUNCTION set_crm_quote_reactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_crm_quote_reactions_updated_at ON crm_quote_reactions;
CREATE TRIGGER trg_set_crm_quote_reactions_updated_at
    BEFORE UPDATE ON crm_quote_reactions
    FOR EACH ROW
    EXECUTE FUNCTION set_crm_quote_reactions_updated_at();
