import { compactTokenForBuildV1, templateProject as frozenTemplateProject } from './template-v1';

// Keep the frozen renderer unchanged: shared links depend on its exact output.
// A marker identifies a candidate preset; it is not proof the source is still that preset.
export function templateProject(prompt: string, html?: string) {
  if (html) {
    const candidate = frozenTemplateProject('', html);
    const canonical = compactTokenForBuildV1({ title: candidate.title, html });
    // Support the known pre-kind collector representation only when EVERY other
    // byte matches the frozen collector render. Never normalize arbitrary edits.
    const legacyCollector = candidate.html.includes('"kind":"collector"') &&
      candidate.html.replace(',"kind":"collector"', '') === html;
    if (!canonical && !legacyCollector) return {
      html, title: 'My creation', mode: 'template' as const,
      message: 'AI is unavailable. Your existing project is unchanged. Offline templates cannot revise custom HTML, even when it retains a template marker.',
    };
  }
  return frozenTemplateProject(prompt, html);
}
