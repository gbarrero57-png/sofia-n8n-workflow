-- ============================================================
-- SOFIA SaaS - Seed Data
-- Migration 004: Initial clinic + knowledge base
-- ============================================================

-- Insert the current clinic (Red Soluciones TI)
INSERT INTO clinics (
    id, name, subdomain, phone, address, timezone,
    calendar_id, chatwoot_account_id, chatwoot_inbox_id,
    branding_config, bot_config
) VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'Clínica Dental Red Soluciones',
    'redsoluciones',
    '+51 999 999 999',
    'Lima, Perú',
    'America/Lima',
    'family00280432052323677917@group.calendar.google.com',
    2,
    2,
    '{"primary_color": "#0066CC", "logo_url": null}'::jsonb,
    '{
        "max_bot_interactions": 3,
        "business_hours_start": 8,
        "business_hours_end": 22,
        "reminder_hours_before": 24,
        "escalation_message": "Te conecto con un agente de inmediato.",
        "welcome_message": "Hola! Soy SofIA, tu asistente virtual de la clinica."
    }'::jsonb
);

-- Migrate existing Knowledge Base into database
-- These match what was hardcoded in the n8n Code node
INSERT INTO knowledge_base (clinic_id, category, question, answer, keywords, priority) VALUES

-- SERVICIOS
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'servicios',
 '¿Qué servicios ofrecen?',
 'Ofrecemos: limpieza dental, blanqueamiento, ortodoncia, implantes, endodoncia, extracciones, carillas y consultas generales.',
 ARRAY['servicios', 'ofrecen', 'tratamientos', 'hacen'], 10),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'servicios',
 '¿Hacen blanqueamiento dental?',
 'Sí, ofrecemos blanqueamiento dental profesional. El procedimiento dura aproximadamente 1 hora.',
 ARRAY['blanqueamiento', 'blanco', 'dientes'], 5),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'servicios',
 '¿Hacen ortodoncia?',
 'Sí, ofrecemos ortodoncia tradicional y brackets estéticos. La primera consulta incluye evaluación completa.',
 ARRAY['ortodoncia', 'brackets', 'frenos'], 5),

-- PRECIOS
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'precios',
 '¿Cuánto cuesta una limpieza dental?',
 'La limpieza dental tiene un costo desde S/80. El precio exacto depende del tipo de limpieza necesaria.',
 ARRAY['cuesta', 'precio', 'limpieza', 'cuanto'], 10),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'precios',
 '¿Cuánto cuesta una consulta?',
 'La consulta general tiene un costo de S/50. Incluye evaluación completa y diagnóstico.',
 ARRAY['consulta', 'precio', 'costo', 'cuanto'], 8),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'precios',
 '¿Cuánto cuesta un blanqueamiento?',
 'El blanqueamiento dental profesional tiene un costo desde S/250.',
 ARRAY['blanqueamiento', 'precio', 'cuanto'], 5),

-- HORARIOS
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'horarios',
 '¿Cuáles son sus horarios de atención?',
 'Atendemos de lunes a viernes de 8:00 AM a 8:00 PM, y sábados de 9:00 AM a 2:00 PM.',
 ARRAY['horarios', 'atencion', 'hora', 'abren', 'cierran'], 10),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'horarios',
 '¿Atienden los domingos?',
 'No, los domingos no atendemos. Nuestro horario es de lunes a sábado.',
 ARRAY['domingos', 'fines', 'semana'], 5),

-- UBICACION
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'ubicacion',
 '¿Dónde están ubicados?',
 'Estamos ubicados en Lima, Perú. Contáctanos para la dirección exacta.',
 ARRAY['donde', 'ubicados', 'direccion', 'ubicacion', 'llegar'], 10),

-- PAGOS
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'pagos',
 '¿Qué métodos de pago aceptan?',
 'Aceptamos efectivo, tarjetas de débito/crédito, Yape y Plin.',
 ARRAY['pago', 'tarjeta', 'efectivo', 'yape', 'plin'], 10),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'pagos',
 '¿Aceptan Yape?',
 'Sí, aceptamos pagos por Yape. También aceptamos Plin, efectivo y tarjetas.',
 ARRAY['yape', 'plin'], 5),

-- SEGUROS
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'seguros',
 '¿Trabajan con seguros dentales?',
 'Sí, trabajamos con los principales seguros dentales. Consulta con nosotros para verificar tu cobertura.',
 ARRAY['seguro', 'seguros', 'cobertura'], 8),

-- PREPARACION
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'preparacion',
 '¿Necesito preparación antes de mi cita?',
 'Para la mayoría de procedimientos no necesitas preparación especial. Si es una cirugía o endodoncia, te daremos instrucciones específicas.',
 ARRAY['preparacion', 'antes', 'cita', 'instrucciones'], 5),

-- GENERAL
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'general',
 '¿Atienden emergencias?',
 'Sí, atendemos emergencias dentales durante nuestro horario de atención. Si tienes una urgencia, llámanos directamente.',
 ARRAY['emergencia', 'urgencia', 'dolor'], 10);
