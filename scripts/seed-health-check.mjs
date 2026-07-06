import fs from "node:fs/promises";
import path from "node:path";

const seedPath = path.resolve("supabase/seed.sql");

const requiredStoreCodes = [
  "NDL-TH-001",
  "CAF-TH-001",
  "BBQ-TH-002",
  "SFD-TH-003",
  "BAK-TH-004",
  "TEA-TH-005",
  "PIZ-TH-006"
];

const requiredBranchCodes = [
  "BKK-01",
  "BKK-02",
  "CAF-BKK-01",
  "CAF-CNX-01",
  "BBQ-BKK-01",
  "BBQ-PKT-01",
  "SFD-BKK-01",
  "SFD-HDY-01",
  "BAK-BKK-01",
  "BAK-KKN-01",
  "TEA-BKK-01",
  "TEA-URT-01",
  "PIZ-BKK-01",
  "PIZ-CBI-01"
];

const requiredEmails = [
  "owner@noodle.local",
  "manager@noodle.local",
  "staff@noodle.local",
  "owner.caf@demo.local",
  "manager.caf@demo.local",
  "staff.caf@demo.local",
  "owner.bbq@demo.local",
  "manager.bbq@demo.local",
  "staff.bbq@demo.local",
  "owner.sfd@demo.local",
  "manager.sfd@demo.local",
  "staff.sfd@demo.local",
  "owner.bak@demo.local",
  "manager.bak@demo.local",
  "staff.bak@demo.local",
  "owner.tea@demo.local",
  "manager.tea@demo.local",
  "staff.tea@demo.local",
  "owner.piz@demo.local",
  "manager.piz@demo.local",
  "staff.piz@demo.local"
];

function findMissing(content, required) {
  return required.filter((item) => !content.includes(`'${item}'`));
}

function extractUniqueStoreCodes(content) {
  const matches = content.match(/'[A-Z]{3}-TH-\d{3}'/g) ?? [];
  return new Set(matches.map((value) => value.slice(1, -1)));
}

async function main() {
  const content = await fs.readFile(seedPath, "utf8");
  const missingStoreCodes = findMissing(content, requiredStoreCodes);
  const missingBranchCodes = findMissing(content, requiredBranchCodes);
  const missingEmails = findMissing(content, requiredEmails);

  const requiredSections = [
    "insert into merchant_channels",
    "insert into products",
    "insert into dine_in_tables",
    "insert into user_branch_roles"
  ];
  const missingSections = requiredSections.filter((section) => !content.includes(section));

  const discoveredStoreCodes = extractUniqueStoreCodes(content);

  const failures = [
    ...missingStoreCodes.map((code) => `missing store code: ${code}`),
    ...missingBranchCodes.map((code) => `missing branch code: ${code}`),
    ...missingEmails.map((email) => `missing email: ${email}`),
    ...missingSections.map((section) => `missing section: ${section}`)
  ];

  if (failures.length > 0) {
    console.error("Seed health check failed.");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Seed health check passed.");
  console.log(`- file: ${seedPath}`);
  console.log(`- store codes discovered: ${discoveredStoreCodes.size}`);
  console.log(`- required store codes: ${requiredStoreCodes.length}`);
  console.log(`- required branch codes: ${requiredBranchCodes.length}`);
  console.log(`- required login emails: ${requiredEmails.length}`);
}

main().catch((error) => {
  console.error("Seed health check crashed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
