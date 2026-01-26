-- Create pre_leads table
CREATE TABLE IF NOT EXISTS pre_leads (
    id BIGSERIAL PRIMARY KEY,
    nombre_empresa TEXT NOT NULL,
    correos TEXT[] DEFAULT '{}',
    nombre_contacto TEXT,
    telefonos TEXT[] DEFAULT '{}',
    ubicacion TEXT,
    giro_empresa TEXT,
    vendedor_id UUID REFERENCES profiles(id) ON DELETE CASCADE DEFAULT auth.uid(),
    vendedor_name TEXT,
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE pre_leads ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can do everything on pre_leads') THEN
        CREATE POLICY "Admins can do everything on pre_leads"
        ON pre_leads FOR ALL
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Sellers can manage their own pre_leads') THEN
        CREATE POLICY "Sellers can manage their own pre_leads"
        ON pre_leads FOR ALL
        TO authenticated
        USING (vendedor_id = auth.uid())
        WITH CHECK (vendedor_id = auth.uid());
    END IF;
END $$;
