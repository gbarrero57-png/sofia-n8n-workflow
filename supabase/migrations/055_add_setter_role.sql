-- Migration 055: Add 'setter' value to staff_role enum
-- Needed for the outbound calling team member who only accesses the Leads CRM

ALTER TYPE staff_role ADD VALUE IF NOT EXISTS 'setter';
