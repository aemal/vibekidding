// Script to migrate orphaned projects to have a creator
// Run with: npx ts-node --esm src/scripts/migrate-orphans.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find orphaned projects (no creator)
  const orphanedProjects = await prisma.project.findMany({
    where: { creatorId: null },
  });

  if (orphanedProjects.length === 0) {
    console.log("No orphaned projects found.");
    return;
  }

  console.log(`Found ${orphanedProjects.length} orphaned projects.`);

  // Create a system user for these projects
  let systemUser = await prisma.user.findFirst({
    where: { username: "LegacyCreator" },
  });

  if (!systemUser) {
    systemUser = await prisma.user.create({
      data: { username: "LegacyCreator" },
    });
    console.log("Created LegacyCreator user.");
  }

  // Update orphaned projects
  await prisma.project.updateMany({
    where: { creatorId: null },
    data: { creatorId: systemUser.id },
  });

  console.log(`Updated ${orphanedProjects.length} projects to use LegacyCreator.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

