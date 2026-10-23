import { test } from "node:test";
import assert from "node:assert/strict";
import { copyProject, MAX_BACKUP_BYTES, MAX_HTML, MAX_PROJECTS, MAX_VERSIONS, parseBackup, serializeBackup, validProjects, type Project } from "../src/components/demo/project-backup";

function project(): Project {
  return { id: "original", title: "Ocean 🌊", emoji: "🐠", updatedAt: 1700000000001, versions: [
    { id: "first", html: "<!doctype html><h1>Ocean</h1>", prompt: "Make an ocean", createdAt: 1700000000000, mode: "template" },
    { id: "second", html: "<!doctype html><h1>Pink ocean</h1>", prompt: "Make it pink", createdAt: 1700000000001, mode: "ai" },
  ] };
}
const envelope = (value: unknown, version = 1) => JSON.stringify({ format: "vibekidding-project", version, project: value });

test("backup roundtrip preserves title, prompts, ordered history and generation labels", () => {
  const original = project();
  assert.deepEqual(parseBackup(serializeBackup(original)), original);
  assert.deepEqual(original, project());
});

test("duplicate and imported copies have independent project and version identities", () => {
  const original = project();
  const duplicate = copyProject(original, "Ocean (copy)");
  const imported = copyProject(parseBackup(serializeBackup(original)));
  const identities = [original, duplicate, imported].flatMap(p => [p.id, ...p.versions.map(v => v.id)]);
  assert.equal(new Set(identities).size, identities.length);
  for (const copy of [duplicate, imported]) {
    assert.deepEqual(copy.versions.map(v => [v.html, v.prompt, v.createdAt, v.mode]), original.versions.map(v => [v.html, v.prompt, v.createdAt, v.mode]));
    copy.versions[0].html = "changed";
  }
  assert.deepEqual(original, project());
  assert.equal(duplicate.title, "Ocean (copy)");
  assert.equal(imported.title, original.title);
});

test("malformed and foreign backup files return actionable validation errors", () => {
  assert.throws(() => parseBackup("invalid JSON"), /Choose a VibeKidding project backup/);
  assert.throws(() => parseBackup('{"format":"other"}'), /Use Export backup/);
  assert.throws(() => parseBackup(envelope(project(), 2)), /version 1/);
  for (const value of [null, [], {}, { ...project(), versions: [] }, { ...project(), updatedAt: -1 }, { ...project(), title: " " }]) {
    assert.throws(() => parseBackup(envelope(value)), /No projects were changed/);
  }
});

test("history, HTML, title, prompt and duplicate identity bounds reject corrupt backups", () => {
  const original = project();
  const invalid = [
    { ...original, title: "a".repeat(71) },
    { ...original, versions: Array.from({ length: MAX_VERSIONS + 1 }, (_, i) => ({ ...original.versions[0], id: String(i) })) },
    { ...original, versions: [original.versions[0], original.versions[0]] },
    { ...original, versions: [{ ...original.versions[0], html: "a".repeat(MAX_HTML + 1) }] },
    { ...original, versions: [{ ...original.versions[0], prompt: "a".repeat(4001) }] },
    { ...original, versions: [{ ...original.versions[0], mode: "unknown" }] },
    { ...original, versions: [{ ...original.versions[0], createdAt: Number.MAX_SAFE_INTEGER }] },
  ];
  for (const value of invalid) assert.throws(() => parseBackup(envelope(value)), /No projects were changed/);
  const boundary = { ...original, versions: Array.from({ length: MAX_VERSIONS }, (_, i) => ({ ...original.versions[0], id: String(i), html: "a".repeat(MAX_HTML) })) };
  assert.equal(parseBackup(serializeBackup(boundary)).versions.length, MAX_VERSIONS);
});

test("8 MB limits measure UTF-8 bytes on both import and export", () => {
  assert.throws(() => parseBackup(" ".repeat(MAX_BACKUP_BYTES + 1)), /too large/);
  const original = project();
  const large = { ...original, versions: Array.from({ length: MAX_VERSIONS }, (_, i) => ({ ...original.versions[0], id: String(i), html: "🌊".repeat(MAX_HTML / 2) })) };
  const encoded = envelope(large);
  assert.ok(encoded.length < MAX_BACKUP_BYTES);
  assert.ok(Buffer.byteLength(encoded) > MAX_BACKUP_BYTES);
  assert.throws(() => parseBackup(encoded), /too large/);
  assert.throws(() => serializeBackup(large), /too large/);
});

test("backup canonicalization drops unrecognized properties without executing HTML", () => {
  const original = project();
  const source = { ...original, unexpected: "ignored", versions: original.versions.map(v => ({ ...v, extra: "ignored" })) };
  assert.deepEqual(parseBackup(envelope(source)), original);
  assert.deepEqual(parseBackup(serializeBackup(source)), original);
});

test("shelf validation rejects duplicate projects and capacity overflow", () => {
  assert.equal(validProjects([project(), project()]), false);
  const shelf = Array.from({ length: MAX_PROJECTS }, (_, i) => ({ ...project(), id: String(i) }));
  assert.equal(validProjects(shelf), true);
  assert.equal(validProjects([...shelf, { ...project(), id: "overflow" }]), false);
});
