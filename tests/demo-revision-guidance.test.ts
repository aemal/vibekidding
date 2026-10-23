import assert from 'node:assert/strict';
import test from 'node:test';
import { revisionGuidance } from '../src/lib/demo-revision-guidance';
import { notesStarter } from '../src/lib/demo-notes-starter';
import { templateProject } from '../src/lib/demo-server/template';

test('canonical source permits supported revision without relying on project title or provenance', () => {
  const original = templateProject('purple space memory');
  const guidance = revisionGuidance('template', original.html);
  assert.equal(guidance.blocked, false);
  assert.notEqual(templateProject(guidance.placeholder, original.html).html, original.html);
});
test('notes and custom HTML explain template restriction before submission', () => {
  const notes = revisionGuidance('template', notesStarter.html);
  assert.equal(notes.blocked, true);
  assert.match(notes.description, /Write and save your notes/);
  assert.equal(revisionGuidance('template', '<html>My app</html>').blocked, true);
});
test('a copied template marker does not establish canonical capability', () => {
  const original = templateProject('space collector');
  assert.equal(revisionGuidance('template', original.html.replace('Star Collector', 'Custom title')).blocked, true);
  assert.equal(revisionGuidance('template', original.html + '<script>window.custom=true</script>').blocked, true);
});
test('AI configuration permits arbitrary source and new ideas remain enabled', () => {
  assert.equal(revisionGuidance('ai', notesStarter.html).blocked, false);
  assert.equal(revisionGuidance('ai', '<html>Custom</html>').blocked, false);
  assert.equal(revisionGuidance('template').blocked, false);
  assert.equal(revisionGuidance(undefined, notesStarter.html).blocked, false);
});
