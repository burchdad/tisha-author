import { defineField, defineType } from 'sanity';
import fields from './text-fields.json';
import { defaultSettings, photoSlots } from './defaults.js';

const required = (rule) => rule.required();
const title = defineField({ name: 'title', title: 'Title', type: 'string', validation: (r) => r.required().max(160) });
const description = defineField({ name: 'description', title: 'Description', type: 'text', rows: 3, validation: (r) => r.max(1500) });
const order = defineField({ name: 'order', title: 'Display order', type: 'number', initialValue: 10, validation: (r) => r.integer().min(0) });
const image = defineField({
  name: 'image', title: 'Upload photo', type: 'image', options: { hotspot: true, accept: 'image/jpeg,image/png,image/webp' },
});
const existingUrl = defineField({
  name: 'existingUrl', title: 'Original website file', type: 'string', readOnly: true, hidden: ({ value }) => !value,
  description: 'An uploaded file replaces this original file on the website.',
});
const alt = defineField({ name: 'alt', title: 'Describe the photo for readers using screen readers', type: 'string', validation: (r) => r.required().max(300) });
const assetRequired = (field) => (rule) => rule.custom((doc) => doc?.[field]?.asset || doc?.existingUrl ? true : 'Please upload a file.');

export const schemaTypes = [
  defineType({
    name: 'siteSettings', title: 'Prices & shipping', type: 'document',
    initialValue: defaultSettings,
    fields: [
      defineField({ name: 'shippingMessage', title: 'Shipping announcement', type: 'string', description: 'Updates the home page, checkout, footer, and copied order summary together.', validation: (r) => r.required().max(240) }),
      ...['paperback', 'hardcover'].map((format) => defineField({
        name: format + 'Price', title: format === 'paperback' ? 'Soft-cover price (USD)' : 'Hard-cover price (USD)', type: 'number',
        description: 'Updates the website checkout. Until Square is connected through its API, also update the corresponding price in Square.',
        validation: (r) => r.required().positive().max(1000).precision(2),
      })),
    ],
    preview: { prepare: () => ({ title: 'Prices & shipping' }) },
  }),
  defineType({
    name: 'siteCopy', title: 'Website text', type: 'document',
    groups: [{ name: 'home', title: 'Home page', default: true }, { name: 'curriculum', title: 'Curriculum page' }],
    initialValue: Object.fromEntries(fields.map((field) => [field.name, field.initialValue])),
    fields: fields.map((field) => defineField({
      name: field.name, title: field.title, type: 'text', rows: field.initialValue.length > 160 ? 4 : 2,
      group: field.page === 'index.html' ? 'home' : 'curriculum',
      validation: (r) => r.required().max(3000),
    })),
    preview: { prepare: () => ({ title: 'Website text' }) },
  }),
  defineType({
    name: 'curriculum', title: 'Curriculum PDFs', type: 'document', validation: assetRequired('pdf'),
    fields: [
      title, description,
      defineField({ name: 'pdf', title: 'Upload curriculum PDF', type: 'file', options: { accept: 'application/pdf' } }),
      existingUrl,
      defineField({ name: 'placement', title: 'Show in', type: 'string', initialValue: 'additional', options: { list: [{ title: 'Companion section', value: 'companion' }, { title: 'Gratitude section', value: 'gratitude' }, { title: 'More curriculum downloads', value: 'additional' }] }, validation: required }),
      order,
    ],
    orderings: [{ title: 'Display order', name: 'displayOrder', by: [{ field: 'order', direction: 'asc' }] }],
  }),
  defineType({
    name: 'mediaLink', title: 'Podcasts, blogs & features', type: 'document',
    fields: [
      title, description,
      defineField({ name: 'category', title: 'Category', type: 'string', options: { list: [{ title: 'Podcast', value: 'podcast' }, { title: 'Blog / article', value: 'blog' }, { title: 'Book feature', value: 'feature' }] }, validation: required }),
      defineField({ name: 'url', title: 'Episode or article link', type: 'url', validation: (r) => r.required().uri({ scheme: ['https'] }) }),
      order,
    ],
    preview: { select: { title: 'title', subtitle: 'category' } },
  }),
  defineType({
    name: 'sitePhoto', title: 'Website photos', type: 'document', validation: assetRequired('image'),
    fields: [
      title,
      defineField({ name: 'placement', title: 'Photo location', type: 'string', readOnly: true, options: { list: photoSlots.map((s) => ({ title: s.title, value: s.name })) }, validation: required }),
      image, alt, existingUrl,
    ],
    preview: { select: { title: 'title', media: 'image' } },
  }),
  defineType({
    name: 'eventPhoto', title: 'In the Wild: photos', type: 'document', validation: assetRequired('image'),
    fields: [title, description, image, alt, defineField({ name: 'date', title: 'Event date', type: 'date' }), order],
    preview: { select: { title: 'title', media: 'image', subtitle: 'date' } },
  }),
];
