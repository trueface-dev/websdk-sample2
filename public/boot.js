/**
 * Loads the hosted SDK.
 *
 * The version is not hardcoded here — it comes from /api/config, which reads
 * TRUEFACE_SDK_VERSION on the server, so the page and backend cannot drift.
 * Exposes a promise app.js awaits before touching TrueFaceLiveness.
 */
window.__TF_BOOT__ = (() => {
  const state = { config: null, sdkUrl: null };

  state.ready = (async () => {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(`/api/config returned ${res.status}`);
    const config = await res.json();
    state.config = config;
    state.sdkUrl = config.sdkUrl;

    await new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = config.sdkUrl;
      tag.async = false;
      tag.onload = resolve;
      // jsDelivr 404s until the release tag has propagated, so name the URL.
      tag.onerror = () => reject(new Error(`could not load ${config.sdkUrl}`));
      document.head.appendChild(tag);
    });

    if (typeof window.TrueFaceLiveness !== 'function') {
      throw new Error('SDK script loaded but TrueFaceLiveness is not defined');
    }
    return config;
  })();

  return state;
})();
