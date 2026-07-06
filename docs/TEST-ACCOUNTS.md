# Test Accounts

Use this document for local multi-tenant login testing on unified `backoffice-web` login + POS flows.

## Store Codes

| Store Code | Brand |
| --- | --- |
| `NDL-TH-001` | Noodle demo (legacy) |
| `CAF-TH-001` | Cafe Atlas |
| `BBQ-TH-002` | Bangkok BBQ Lab |
| `SFD-TH-003` | Seafood Dock |
| `BAK-TH-004` | Baker Street 24 |
| `TEA-TH-005` | Tea Time House |
| `PIZ-TH-006` | Pizza Factory |

## Branch Codes

| Store Code | Branch Codes |
| --- | --- |
| `NDL-TH-001` | `BKK-01`, `BKK-02` |
| `CAF-TH-001` | `CAF-BKK-01`, `CAF-CNX-01` |
| `BBQ-TH-002` | `BBQ-BKK-01`, `BBQ-PKT-01` |
| `SFD-TH-003` | `SFD-BKK-01`, `SFD-HDY-01` |
| `BAK-TH-004` | `BAK-BKK-01`, `BAK-KKN-01` |
| `TEA-TH-005` | `TEA-BKK-01`, `TEA-URT-01` |
| `PIZ-TH-006` | `PIZ-BKK-01`, `PIZ-CBI-01` |

## Demo Login Accounts

For the 6 new stores, use role-based credentials per brand slug:

| Role | Email Pattern | Password | PIN (profile) |
| --- | --- | --- | --- |
| Owner | `owner.<slug>@demo.local` | `Owner#2026` | `111111` |
| Manager | `manager.<slug>@demo.local` | `Manager#2026` | `222222` |
| Staff | `staff.<slug>@demo.local` | `Staff#2026` | `333333` |

Supported slugs: `caf`, `bbq`, `sfd`, `bak`, `tea`, `piz`

Examples:
- `owner.caf@demo.local` / `Owner#2026`
- `manager.bbq@demo.local` / `Manager#2026`
- `staff.piz@demo.local` / `Staff#2026`

Legacy noodle users:
- `owner@noodle.local` / `Owner#1234`
- `manager@noodle.local` / `Manager#1234`
- `staff@noodle.local` / `Staff#1234`

## Seed Source

All accounts and store codes above are defined in:
- `supabase/seed.sql`
- `supabase/seeds/seed_demo_noodle_shop.sql`
