-- RUN THIS TO FIX THE "RELATIONSHIP NOT FOUND" ERROR

-- 1. Drop the incorrect foreign key to auth.users
ALTER TABLE tareas
DROP CONSTRAINT IF EXISTS tareas_asignado_a_fkey;

-- 2. Add the correct foreign key to public.profiles
ALTER TABLE tareas
ADD CONSTRAINT tareas_asignado_a_fkey
FOREIGN KEY (asignado_a)
REFERENCES public.profiles(id);

-- 3. (Optional) Force the comment to help PostgREST find it if needed
COMMENT ON CONSTRAINT tareas_asignado_a_fkey ON tareas IS 'Asignado a Profiles';
