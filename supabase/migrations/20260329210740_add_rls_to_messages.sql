-- Включаем Row Level Security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Разрешаем читать всем (для админки через anon key)
-- Edge Function пишет через service_role — RLS на неё не действует
CREATE POLICY "Allow public read" ON messages
  FOR SELECT USING (true);