const paths = {
  sidebar:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
  reader:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/>',
  controls:'<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  ai:'<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z"/>',
  move:'<path d="M12 3v18M3 12h18m-12-6 3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/>',
  select:'<path d="m5 3 14 10-7 1-3 7Z"/>',
  connect:'<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="m7 7 10 10m-1-6 1 6-6-1"/>',
  relation:'<path d="M4 5h16M12 5v14m-5 0h10"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  rectangle:'<rect x="3" y="5" width="18" height="14" rx="1"/>',
  ellipse:'<circle cx="12" cy="12" r="9"/>',
  note:'<path d="M7 3h10v18H7m-3-14h16M4 17h16"/>',
  group:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="7" y="7" width="10" height="10"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  fit:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  minus:'<path d="M5 12h14"/>', plus:'<path d="M5 12h14M12 5v14"/>',
  width:'<path d="M3 12h18m-14-4-4 4 4 4m10-8 4 4-4 4"/>',
};
export function panelIcon(name) {return `<svg class="panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.controls}</svg>`;}
export function panelButton(name,label,attributes='') {return `<button type="button" class="panel-toggle" aria-label="${label}" title="${label}" ${attributes}>${panelIcon(name)}</button>`;}
