-- Harden QR token + staff-card auth artifacts for production:
-- - hashed secrets (no plaintext token/card codes required at rest)
-- - one-time QR token status lifecycle
-- - explicit card lifecycle statuses including lost
-- - indexes for secure lookup and cleanup jobs

alter table if exists pos_qr_login_tokens
  add column if not exists token_hash text,
  add column if not exists used_at timestamptz,
  add column if not exists revoked_at timestamptz;

update pos_qr_login_tokens
set status = 'used'
where status = 'consumed';

update pos_qr_login_tokens
set used_at = coalesce(used_at, consumed_at)
where status = 'used'
  and used_at is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pos_qr_login_tokens'
      and column_name = 'qr_token'
  ) then
    update pos_qr_login_tokens
    set token_hash = md5(qr_token)
    where token_hash is null
      and qr_token is not null;

    alter table if exists pos_qr_login_tokens
      alter column qr_token drop not null;

    update pos_qr_login_tokens
    set qr_token = null
    where token_hash is not null
      and qr_token is not null;
  end if;
end $$;

alter table if exists pos_qr_login_tokens
  drop constraint if exists pos_qr_login_tokens_status_check;

alter table if exists pos_qr_login_tokens
  add constraint pos_qr_login_tokens_status_check
  check (status in ('active', 'used', 'expired', 'revoked'));

do $$
begin
  if not exists (
    select 1
    from pos_qr_login_tokens
    where token_hash is null
  ) then
    alter table if exists pos_qr_login_tokens
      alter column token_hash set not null;
  end if;
end $$;

create unique index if not exists uq_pos_qr_login_tokens_token_hash
  on pos_qr_login_tokens(token_hash)
  where token_hash is not null;

create index if not exists idx_pos_qr_login_tokens_lookup
  on pos_qr_login_tokens(tenant_id, branch_id, status, expires_at desc);

create index if not exists idx_pos_qr_login_tokens_cleanup
  on pos_qr_login_tokens(status, expires_at, used_at);

alter table if exists pos_staff_cards
  add column if not exists card_hash text,
  add column if not exists lost_at timestamptz,
  add column if not exists revoked_at timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pos_staff_cards'
      and column_name = 'card_code'
  ) then
    update pos_staff_cards
    set card_hash = md5(card_code)
    where card_hash is null
      and card_code is not null;

    alter table if exists pos_staff_cards
      alter column card_code drop not null;

    update pos_staff_cards
    set card_code = null
    where card_hash is not null
      and card_code is not null;
  end if;
end $$;

alter table if exists pos_staff_cards
  drop constraint if exists pos_staff_cards_status_check;

alter table if exists pos_staff_cards
  add constraint pos_staff_cards_status_check
  check (status in ('active', 'inactive', 'lost', 'revoked'));

do $$
begin
  if not exists (
    select 1
    from pos_staff_cards
    where card_hash is null
  ) then
    alter table if exists pos_staff_cards
      alter column card_hash set not null;
  end if;
end $$;

create unique index if not exists uq_pos_staff_cards_card_hash
  on pos_staff_cards(card_hash)
  where card_hash is not null;

create index if not exists idx_pos_staff_cards_lookup
  on pos_staff_cards(tenant_id, branch_id, status, user_id);

create index if not exists idx_pos_staff_cards_status
  on pos_staff_cards(status, revoked_at, lost_at);

-- Optional maintenance (documented runbook):
--   delete from pos_qr_login_tokens
--   where status in ('used', 'expired', 'revoked')
--     and coalesce(used_at, expires_at) < now() - interval '30 days';
