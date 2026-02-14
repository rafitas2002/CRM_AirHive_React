-- RUN THIS TO ADD THE "ACTIVITY TYPE" COLUMN

-- 1. Add 'tipo_actividad' to 'tareas'
ALTER TABLE tareas 
ADD COLUMN IF NOT EXISTS tipo_actividad TEXT DEFAULT 'Otro';

-- 2. Add 'tipo_actividad' to 'historial_tareas'
ALTER TABLE historial_tareas 
ADD COLUMN IF NOT EXISTS tipo_actividad TEXT DEFAULT 'Otro';
