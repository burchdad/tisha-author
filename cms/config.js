import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { schemaTypes } from './schema.js';
import { photoSlots } from './defaults.js';

const fixedTypes = new Set(['siteSettings', 'siteCopy', 'sitePhoto']);
const allowedActions = new Set(['publish', 'discardChanges', 'restore']);
export function makeStudioConfig(projectId, dataset) {
  return defineConfig({
    name: 'riders-magic-mark', title: "Rider's Magic Mark",
    projectId, dataset, basePath: '/admin',
    plugins: [structureTool({
      structure: (S) => S.list().title('Manage your website').items([
        ...[['siteCopy', 'Website text'], ['siteSettings', 'Prices & shipping']].map(([id, name]) =>
          S.listItem().id(id).title(name).child(S.document().schemaType(id).documentId(id))),
        S.divider(),
        S.documentTypeListItem('curriculum').title('Curriculum PDFs'),
        S.documentTypeListItem('mediaLink').title('Podcasts, blogs & features'),
        S.listItem().title('Website photos').child(S.list().title('Choose a photo').items(photoSlots.map((slot) =>
          S.listItem().id(slot.name).title(slot.title).child(S.document().schemaType('sitePhoto').documentId('photo-' + slot.name))))),
        S.documentTypeListItem('eventPhoto').title('In the Wild: photos'),
      ]),
    })],
    schema: { types: schemaTypes, templates: (items) => items.filter((item) => !fixedTypes.has(item.schemaType)) },
    document: {
      actions: (items, context) => fixedTypes.has(context.schemaType) ? items.filter((item) => allowedActions.has(item.action)) : items,
    },
  });
}
