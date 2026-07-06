-- Add support-staff platform role for the separated IT Backoffice surface.
-- `app.is_it_admin()` intentionally remains limited to full `it_admin`;
-- `it_support` is authorized by server-side IT API guards only.
alter type platform_role add value if not exists 'it_support';
