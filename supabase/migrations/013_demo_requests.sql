CREATE TABLE IF NOT EXISTS demo_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  clinic_name text DEFAULT '',
  phone text DEFAULT '',
  preferred_datetime text DEFAULT '',
  notes text DEFAULT '',
  status text DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled')),
  reminder_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_demo_requests_status ON demo_requests(status);
CREATE INDEX IF NOT EXISTS idx_demo_requests_email ON demo_requests(email);
CREATE INDEX IF NOT EXISTS idx_demo_requests_reminder ON demo_requests(status,reminder_sent,preferred_datetime);
