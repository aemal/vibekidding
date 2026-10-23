# Dependency review

October 20 review uses npm registry metadata and `npm audit`; results can change as advisories are updated. Do not run `npm audit fix --force`: the suggested changes include a Next ESLint major downgrade and a Prisma major upgrade.

Prisma and its client were updated together from 6.19.1 to 6.19.3, a patch release whose config dependency uses Effect 3.21.0 instead of 3.18.4. A scoped compatibility-tested override now replaces only @prisma/config@6.19.3's deepmerge-ts with 8.0.2. The braces advisory affects the Next lint dependency chain; the registry currently reports 3.0.3 as latest, so no compatible patched braces release was identified in this review.

Runtime update: Node 22.23.3 is installed and pinned in `.nvmrc`; run `nvm use` in this checkout before starting development. Package engines and CI require >=22.22 within major 22, satisfying machina's declared requirement in the ElevenLabs dependency chain. The existing dev process was not restarted. Live voice remains disabled; compatible engines and a passing build do not establish voice SDK acceptance or resolve security advisories.

No deployment, database mutation or npm audit --force operation was performed. Re-run audit before release; retain the known findings as launch blockers pending review.

Verification: matching Prisma/client 6.19.3 and Effect 3.21.0 confirmed; production build and all 58 local tests passed. npm audit reports eight high-severity dependency entries, down from nine. These entries include transitive chains and are not eight distinct proven application exploits. No live database acceptance was performed.

Scoped override review: Prisma dynamically imports `deepmerge` only for its c12 configuration loader. The upstream 8.0.0 release changes Map merging and fixes circular-reference handling; this checkout has no custom Prisma config and uses ordinary schema generation. A regression fixture exercises the actual Prisma loader with nested plain configuration and verifies resolved schema/migration paths. The initial fixture comparison failed because macOS canonicalized /var to /private/var; the corrected fixture canonicalizes its temporary root and passes. Production generation/build, 77 existing tests, the added config-loader test, lint and types pass. This does not establish compatibility with future Map-valued/custom configs; re-review before adding those or upgrading Prisma.

Current audit: five high entries remain, all in the braces/fast-glob/micromatch/Next lint chain. The registry still reports braces 3.0.3 as latest; the audit advisory includes that version. The CI audit must continue to fail until a reviewed fix is available. This reduces findings; it is not production acceptance.

Upstream release notes: https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0 and https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.2 .

Rechecked October 20 after full lint cleanup: audit still reports five high entries in the same lint chain; registry latest braces is 3.0.3. The upstream advisory https://github.com/advisories/GHSA-vfj7-8cjw-p6xm lists affected versions <=3.0.3 and no patched version. No dependency downgrade or audit suppression was applied. The dependency-fix subtask is blocked on an upstream compatible fix or a separately reviewed replacement; local lint success does not clear this finding.
