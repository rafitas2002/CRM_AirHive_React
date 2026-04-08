-- Extend and normalize the meeting reason catalog for both "no realizada" and "reprogramada" flows.
-- Same catalog is consumed by both popups for analytics consistency.

INSERT INTO meeting_cancellation_reasons (code, label, description, is_active, is_default, sort_order)
VALUES
    ('cliente_no_asistio', 'Cliente no asistió a la reunión', 'El cliente no acudió o no respondió a la convocatoria.', TRUE, TRUE, 10),
    ('cliente_no_se_conecto', 'Cliente no se conectó a la reunión virtual', 'El cliente no ingresó a la videollamada en la hora acordada.', TRUE, TRUE, 20),
    ('equipo_no_se_conecto', 'Nuestro equipo no se conectó a la reunión virtual', 'El responsable interno no ingresó a la videollamada en la hora acordada.', TRUE, TRUE, 30),
    ('conflicto_agenda_cliente', 'Conflicto de agenda del cliente', 'El cliente reportó un traslape de agenda.', TRUE, TRUE, 40),
    ('conflicto_agenda_interno', 'Conflicto de agenda de nuestro equipo', 'Nuestro equipo reportó un traslape de agenda.', TRUE, TRUE, 50),
    ('reagenda_solicitada_cliente', 'Reprogramación solicitada por el cliente', 'El cliente pidió mover la junta a otra fecha u hora.', TRUE, TRUE, 60),
    ('reagenda_solicitada_interno', 'Reprogramación solicitada por nuestro equipo', 'Nuestro equipo pidió mover la junta a otra fecha u hora.', TRUE, TRUE, 70),
    ('decision_maker_no_disponible', 'Persona decisora no disponible', 'La persona con poder de decisión no estuvo disponible.', TRUE, TRUE, 80),
    ('problema_tecnico_conexion', 'Incidencia técnica o de conectividad', 'Hubo fallas de internet, audio/video o plataforma.', TRUE, TRUE, 90),
    ('falta_informacion_previa', 'Información previa insuficiente para la reunión', 'No estaban listos documentos o insumos requeridos.', TRUE, TRUE, 100),
    ('cambio_prioridad_cliente', 'Cambio de prioridad del cliente', 'El cliente pospuso el tema por cambio de prioridades internas.', TRUE, TRUE, 110),
    ('sin_registro_impacto_menor', 'No registrar motivo (ajuste menor sin impacto relevante)', 'Se omite detalle por tratarse de un ajuste operativo menor.', TRUE, TRUE, 120),
    ('motivo_no_especificado', 'Motivo no especificado por la contraparte', 'No se proporcionó una razón concreta al momento del cambio.', TRUE, TRUE, 130)
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
