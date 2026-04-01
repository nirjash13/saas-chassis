SET search_path TO iam;

-- Seed a platform admin user (password: Admin@123456)
INSERT INTO users (id, email, email_verified, password_hash, display_name, is_platform_admin) VALUES
  ('b0000000-0000-0000-0000-000000000001',
   'admin@saaschassis.local',
   true,
   '$2a$12$LJ3m4ys2Ku0RdL3NpBi/SOXpCgCmqZzJVHFh.YYA/XwPphiZxXBLK',
   'Platform Admin',
   true);
