import assert from 'node:assert/strict';
import test from 'node:test';
import { Script } from 'node:vm';
import { templateProject } from '../src/lib/demo-server/template';
import { createShareUrl } from '../src/lib/demo-share';

for (const [kind, prompts] of Object.entries({music:['musical garden','piano','music'],checklist:['daily checklist','to-do list','todo','habit tracker']})) {
  test(`${kind} routes, revises, compiles and shares`, async () => {
    for (const prompt of prompts) {
      const project=templateProject(prompt);
      assert.match(project.html,new RegExp(`"kind":"${kind}"`));
      new Script(project.html.match(/<script>([\s\S]*)<\/script>/)![1]);
      assert.doesNotMatch(project.html,/fetch\(|https?:\/\/|localStorage|sessionStorage|<script src/);
      assert.match(project.message,/Difficulty changes do not affect/);
      const revised=templateProject('make it blue ocean',project.html);
      assert.match(revised.html, /"theme":"ocean"/);
      assert.match(revised.html, /"color":"#2563eb"/);
      assert.match(revised.html,new RegExp(`"kind":"${kind}"`));
      assert.ok((await createShareUrl('https://vibekidding.example',project)).length<=8000);
    }
  });
}
test('custom HTML remains unchanged and prompt markup is not interpolated',()=>{
  assert.equal(templateProject('music','<h1>Mine</h1>').html,'<h1>Mine</h1>');
  assert.doesNotMatch(templateProject('checklist <img src=x onerror=alert(1)>').html,/onerror=alert/);
});
