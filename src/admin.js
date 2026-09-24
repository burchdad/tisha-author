const projectId = import.meta.env.VITE_SANITY_PROJECT_ID;
const dataset = import.meta.env.VITE_SANITY_DATASET || 'production';

if (!projectId) {
  document.querySelector('#setup-status').textContent = 'Your dashboard is awaiting account setup. Stephen needs to connect the content account before sign-in and publishing are available.';
} else {
  try {
    const [{ createElement }, { createRoot }, { Studio }, { makeStudioConfig }] = await Promise.all([
      import('react'), import('react-dom/client'), import('sanity'), import('../cms/config.js'),
    ]);
    document.querySelector('#setup').hidden = true;
    const target = document.querySelector('#studio');
    target.hidden = false;
    createRoot(target).render(createElement(Studio, { config: makeStudioConfig(projectId, dataset) }));
  } catch {
    document.querySelector('#setup-status').textContent = 'The dashboard could not load. Please refresh or contact Stephen to check the content account connection.';
  }
}
