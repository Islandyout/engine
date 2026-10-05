// The editor's site view (0.75.0, defaults 0.76.0): which part of a scene
// with Sites the viewport shows -- "all", "home", or one Site's index. A
// scene with Sites opens on home (site-local children would otherwise pile
// onto the home layout), and selecting something that lives elsewhere --
// from the hierarchy, or a script error -- switches the view to its site.
export interface SiteViewState {
  view: string;
  // Set once the view was defaulted for this scene, so a choice of
  // "everything" sticks afterwards.
  defaulted: boolean;
}

export function nextSiteView(state: SiteViewState, hasSites: boolean, selectedSite: string | undefined, options: readonly string[]): SiteViewState {
  if (!hasSites) return { view: "all", defaulted: false };
  let { view, defaulted } = state;
  if (!defaulted) {
    view = "home";
    defaulted = true;
  }
  if (selectedSite !== undefined && view !== "all") view = selectedSite;
  if (!options.includes(view)) view = "all";
  return { view, defaulted };
}
