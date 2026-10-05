/** Adds the English sample content to a database seeded before English fields existed. Safe to re-run. */
import "dotenv/config";
import { db } from "../src/server/db";
import { applyEnglishContent } from "../prisma/seed-english";

applyEnglishContent(db)
  .then((n) => console.log(`English content: ${n} rows updated`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
