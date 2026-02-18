-- Quotes module: allows admins to manage corporate phrases with activate/deactivate and delete.

CREATE TABLE IF NOT EXISTS crm_quotes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quote_text TEXT NOT NULL,
    quote_author TEXT NOT NULL,
    quote_source TEXT,
    quote_author_context TEXT,
    contributed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    contributed_by_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    deleted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_quotes_active
    ON crm_quotes (is_active)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_quotes_created_at
    ON crm_quotes (created_at DESC)
    WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION set_crm_quotes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_crm_quotes_updated_at ON crm_quotes;
CREATE TRIGGER trg_set_crm_quotes_updated_at
    BEFORE UPDATE ON crm_quotes
    FOR EACH ROW
    EXECUTE FUNCTION set_crm_quotes_updated_at();

INSERT INTO crm_quotes (
    quote_text,
    quote_author,
    quote_source,
    quote_author_context,
    contributed_by_name,
    is_active
)
SELECT
    'Si no sacrificas por lo que quieres, lo que quieres se convierte en sacrificio.',
    'Rafael Sedas',
    'Declaración interna en Air Hive',
    'Director Operativo y Director Financiero de Air Hive',
    'Rafael Sedas',
    true
WHERE NOT EXISTS (
    SELECT 1
    FROM crm_quotes q
    WHERE q.quote_text = 'Si no sacrificas por lo que quieres, lo que quieres se convierte en sacrificio.'
      AND q.quote_author = 'Rafael Sedas'
      AND q.contributed_by_name = 'Rafael Sedas'
      AND q.deleted_at IS NULL
);

-- Historical catalog previously embedded in frontend (Dawkins + Jesus Gracia).
WITH legacy_quotes (quote_text, quote_author, quote_source, quote_author_context, contributed_by_name, is_active) AS (
    VALUES
        ('Science is the poetry of reality.', 'Richard Dawkins', 'The Magic of Reality (2011)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('We are going to die, and that makes us the lucky ones. Most people are never going to die because they are never going to be born.', 'Richard Dawkins', 'Unweaving the Rainbow (1998)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('The feeling of awed wonder that science can give us is one of the highest experiences of which the human psyche is capable.', 'Richard Dawkins', 'Unweaving the Rainbow (1998)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('Nature is not cruel, only pitilessly indifferent. This is one of the hardest lessons for humans to learn.', 'Richard Dawkins', 'River Out of Eden (1995)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('Cumulative selection is the key to understanding the complexity of life.', 'Richard Dawkins', 'The Blind Watchmaker (1986)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('The universe we observe has precisely the properties we should expect if there is, at bottom, no design, no purpose, no evil, no good, nothing but pitiless indifference.', 'Richard Dawkins', 'River Out of Eden (1995)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('The truth is more magical than any myth or made-up mystery or miracle.', 'Richard Dawkins', 'The Magic of Reality (2011)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('We are survival machines – robot vehicles blindly programmed to preserve the selfish molecules known as genes.', 'Richard Dawkins', 'The Selfish Gene (1976)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('The essence of life is statistical improbability on a colossal scale.', 'Richard Dawkins', 'The Blind Watchmaker (1986)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('Faith is the great cop-out, the great excuse to evade the need to think and evaluate evidence.', 'Richard Dawkins', 'The God Delusion (2006)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('Evolution is a fact. Beyond reasonable doubt, beyond serious doubt, beyond sane, informed, intelligent doubt, beyond doubt evolution is a fact.', 'Richard Dawkins', 'The Greatest Show on Earth (2009)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('The meme for blind faith secures its own perpetuation by the simple unconscious expedient of discouraging rational inquiry.', 'Richard Dawkins', 'The Selfish Gene (1976)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('Natural selection is the blind watchmaker, blind because it does not see ahead, does not plan consequences, has no purpose in view.', 'Richard Dawkins', 'The Blind Watchmaker (1986)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('DNA neither cares nor knows. DNA just is. And we dance to its music.', 'Richard Dawkins', 'River Out of Eden (1995)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('The total amount of suffering per year in the natural world is beyond all decent contemplation.', 'Richard Dawkins', 'River Out of Eden (1995)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('Science replaces private prejudice with publicly verifiable evidence.', 'Richard Dawkins', 'The God Delusion (2006), contexto de argumentación pública', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('If you don''t understand how something works, never mind: just give up and say God did it.', 'Richard Dawkins', 'The God Delusion (2006), crítica del God of the gaps', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('The God of the Old Testament is arguably the most unpleasant character in all fiction.', 'Richard Dawkins', 'The God Delusion (2006)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('Isn''t it enough to see that a garden is beautiful without having to believe that there are fairies at the bottom of it too?', 'Richard Dawkins', 'Unweaving the Rainbow (1998)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('The theory of evolution by cumulative natural selection is the only theory we know of that is in principle capable of explaining the existence of organized complexity.', 'Richard Dawkins', 'The Blind Watchmaker (1986)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('We admit that we are like apes, but we seldom realize that we are apes.', 'Richard Dawkins', 'The Ancestor''s Tale (2004)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('The human psyche has two great sicknesses: the urge to carry vendetta across generations, and the tendency to fasten group labels on people.', 'Richard Dawkins', 'The God Delusion (2006), contexto sociocultural', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('Let us try to teach generosity and altruism, because we are born selfish.', 'Richard Dawkins', 'The Selfish Gene (1976)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('The chances of each of us coming into existence are infinitesimally small, and even though we shall all die some day, we should count ourselves fantastically lucky to get our decades in the sun.', 'Richard Dawkins', 'Unweaving the Rainbow (1998)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('Science is interesting, and if you don''t agree, you can fk off.', 'Richard Dawkins', 'Conferencia pública/entrevista (frase atribuida en contexto divulgativo)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('The beauty of evolution is that it does explain, in a very simple way, the existence of extraordinary complexity.', 'Richard Dawkins', 'The Blind Watchmaker (1986), tesis central', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('My eyes are constantly wide open to the extraordinary fact of existence.', 'Richard Dawkins', 'The Magic of Reality (2011), tono autobiográfico', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('The world is divided into things that look as though somebody designed them and things that look as though they didn''t.', 'Richard Dawkins', 'The Blind Watchmaker (1986)', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('However many ways there may be of being alive, it is certain that there are vastly more ways of being dead.', 'Richard Dawkins', 'The Blind Watchmaker (1986), argumento de improbabilidad', 'Evolutionary Biologist & Author', 'Sistema AirHive (Migración histórica)', true),
        ('Quien gana la carrera no es necesariamente el más rápido, sino quien cruza la meta primero.', 'Jesús Gracia', 'Declaración interna en AirHive', 'Director Comercial de AirHive', 'Sistema AirHive (Migración histórica)', true),
        ('A la única persona que le gusta el cambio es a un bebé con un pañal sucio.', 'Jesús Gracia', 'Declaración interna en AirHive', 'Director Comercial de AirHive', 'Sistema AirHive (Migración histórica)', true)
)
INSERT INTO crm_quotes (
    quote_text,
    quote_author,
    quote_source,
    quote_author_context,
    contributed_by_name,
    is_active
)
SELECT
    lq.quote_text,
    lq.quote_author,
    lq.quote_source,
    lq.quote_author_context,
    lq.contributed_by_name,
    lq.is_active
FROM legacy_quotes lq
WHERE NOT EXISTS (
    SELECT 1
    FROM crm_quotes q
    WHERE q.quote_text = lq.quote_text
      AND q.quote_author = lq.quote_author
      AND q.deleted_at IS NULL
);

INSERT INTO crm_quotes (
    quote_text,
    quote_author,
    quote_source,
    quote_author_context,
    contributed_by_name,
    is_active
)
SELECT
    'Si tu y yo nos queremos, no necesitamos a nadie más.',
    'Enjambre',
    'Frase atribuida por colaborador',
    NULL,
    'Rafael Sedas',
    true
WHERE NOT EXISTS (
    SELECT 1
    FROM crm_quotes q
    WHERE q.quote_text = 'Si tu y yo nos queremos, no necesitamos a nadie más.'
      AND q.quote_author = 'Enjambre'
      AND q.contributed_by_name = 'Rafael Sedas'
      AND q.deleted_at IS NULL
);
