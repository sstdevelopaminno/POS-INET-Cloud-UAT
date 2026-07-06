-- Allow branch-scope QR challenge tokens before mobile-side user approval.
alter table if exists pos_qr_login_tokens
  alter column user_id drop not null;
