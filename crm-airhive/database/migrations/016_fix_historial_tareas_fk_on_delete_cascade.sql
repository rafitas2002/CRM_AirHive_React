-- Fix: allow deleting leads (clientes) with cascading tareas without FK blockage from historial_tareas
-- This changes historial_tareas.tarea_id FK to ON DELETE CASCADE.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'historial_tareas'
    ) THEN
        ALTER TABLE public.historial_tareas
            DROP CONSTRAINT IF EXISTS historial_tareas_tarea_id_fkey;

        ALTER TABLE public.historial_tareas
            ADD CONSTRAINT historial_tareas_tarea_id_fkey
            FOREIGN KEY (tarea_id)
            REFERENCES public.tareas(id)
            ON DELETE CASCADE;
    END IF;
END $$;
