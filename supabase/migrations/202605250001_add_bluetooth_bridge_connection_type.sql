-- Add BLUETOOTH_BRIDGE printer connection type for bridge-based Bluetooth printing.

do $$
begin
  if exists (
    select 1
    from pg_type t
    where t.typname = 'printer_connection_type'
  ) and not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'printer_connection_type'
      and e.enumlabel = 'BLUETOOTH_BRIDGE'
  ) then
    alter type printer_connection_type add value 'BLUETOOTH_BRIDGE';
  end if;
end $$;
