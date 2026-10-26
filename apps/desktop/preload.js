// Nothing is exposed to the page from here: the page's own control hook (window.btai, in the editor) is switched on by the user agent
// ("BTAIDesktop") that main.js sets. The preload exists so a packaged build has one place to add a bridge later without changing the window setup.
