import { readFile } from 'node:fs/promises';
import { defaultSettings, defaultCurricula, defaultMedia, defaultPhotos } from '../cms/defaults.js';

const projectId = process.env.VITE_SANITY_PROJECT_ID;
const dataset = process.env.VITE_SANITY_DATASET || 'production';
const token = process.env.SANITY_API_TOKEN;
if (!projectId || !token) throw new Error('Set VITE_SANITY_PROJECT_ID and SANITY_API_TOKEN in your local environment before seeding.');
if (!/^[a-z0-9-]+$/.test(projectId) || !/^[a-z0-9_-]+$/.test(dataset)) throw new Error('Invalid project or dataset name.');
const fields = JSON.parse(await readFile(new URL('../cms/text-fields.json', import.meta.url), 'utf8'));
const documents = [
  defaultSettings,
  { _id: 'siteCopy', _type: 'siteCopy', ...Object.fromEntries(fields.map((field) => [field.name, field.initialValue])) },
  ...defaultCurricula, ...defaultMedia, ...defaultPhotos,
];
const response = await fetch('https://' + projectId + '.api.sanity.io/v2026-09-01/data/mutate/' + dataset, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ mutations: documents.map((document) => ({ createIfNotExists: document })) }),
});
if (!response.ok) throw new Error('Content initialization failed (HTTP ' + response.status + '). Check the project, dataset, and token permissions.');
console.log('Initialized ' + documents.length + ' content records. Existing content was preserved.');
