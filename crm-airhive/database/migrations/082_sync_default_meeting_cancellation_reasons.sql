-- Sync default cancellation reasons to the current UX catalog.
-- Keeps exactly 10 common active defaults including "motivo no especificado".

INSERT INTO meeting_cancellation_reasons (code, label, description, is_active, is_default, sort_order)
VALUES
    ('cliente_no_asistio', 'El cliente no asistió', 'El contacto externo no se conectó o no acudió.', TRUE, TRUE, 10),
    ('conflicto_agenda_cliente', 'Conflicto de agenda del cliente', 'El cliente tuvo traslape de agenda.', TRUE, TRUE, 20),
    ('conflicto_agenda_interno', 'Conflicto de agenda interno', 'Nuestro equipo tuvo traslape de agenda.', TRUE, TRUE, 30),
    ('reagenda_solicitada_cliente', 'Reprogramación solicitada por el cliente', 'El cliente pidió reprogramar la junta.', TRUE, TRUE, 40),
    ('reagenda_solicitada_interno', 'Reprogramación solicitada por nuestro equipo', 'Nuestro equipo pidió reprogramar.', TRUE, TRUE, 50),
    ('decision_maker_no_disponible', 'Persona decisora no disponible', 'La persona clave no estuvo disponible.', TRUE, TRUE, 60),
    ('problema_tecnico_conexion', 'Problemas técnicos o de conectividad', 'Falla de internet, audio/video o plataforma.', TRUE, TRUE, 70),
    ('falta_informacion_previa', 'Información previa insuficiente para realizar la reunión', 'No estaban listos documentos/insumos necesarios.', TRUE, TRUE, 80),
    ('cambio_prioridad_cliente', 'Cambio de prioridad del cliente', 'El cliente movió enfoque a otra prioridad interna.', TRUE, TRUE, 90),
    ('motivo_no_especificado', 'Motivo no especificado por la contraparte', 'No se proporcionó una razón concreta al momento de cancelar.', TRUE, TRUE, 100)
ON CONFLICT (code) DO UPDATE
SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    is_default = EXCLUDED.is_default,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

UPDATE meeting_cancellation_reasons
SET
    is_active = FALSE,
    is_default = FALSE,
    updated_at = NOW()
WHERE code = 'emergencia_imprevisto';
