import { compactTokenForBuildV1, templateProject } from './demo-server/template-v1';
import { notesStarter } from './demo-notes-starter';

/** Recognize exact template source, independently of user titles or version labels. */
export function revisionGuidance(mode: 'template' | 'ai' | undefined, html?: string) {
  const templateMode = mode === 'template';
  const canonical = html && templateMode
    ? compactTokenForBuildV1({ title: templateProject('', html).title, html }) !== undefined
    : false;
  const blocked = !!html && templateMode && !canonical;
  return {
    blocked,
    description: blocked
      ? html === notesStarter.html
        ? 'Write and save your notes in the preview. Changing this notes app needs AI mode. Choose New idea to make a template project.'
        : 'You can play and save this project. Changing its code needs AI mode. Choose New idea to make a template project.'
      : templateMode
        ? 'Try a named color or a space, ocean or garden theme. Memory, addition and collector games also support easier or harder challenges.'
        : 'Try a new color, add a character, or dream up a new twist.',
    placeholder: blocked ? 'Changes to this app need AI mode.' : templateMode ? 'Make it blue ocean…' : 'Make it feel like a magical forest…',
  };
}
