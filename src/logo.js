// Logo Flowcity : trois immeubles reliés par un flux (le ruban qui circule de bâtiment en bâtiment).
export const LOGO_SVG = `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs>
<linearGradient id="fcbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3d7bff"/><stop offset=".55" stop-color="#2a9fd6"/><stop offset="1" stop-color="#18b98a"/></linearGradient>
<linearGradient id="fcflow" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff7a59"/></linearGradient>
</defs>
<rect x="24" y="24" width="464" height="464" rx="116" fill="url(#fcbg)"/>
<path d="M120 404V250a18 18 0 0 1 18-18h56a18 18 0 0 1 18 18v154z" fill="#fff" opacity=".92"/>
<path d="M228 404V150a18 18 0 0 1 18-18h56a18 18 0 0 1 18 18v254z" fill="#fff"/>
<path d="M336 404V214a18 18 0 0 1 18-18h40a18 18 0 0 1 18 18v190z" fill="#fff" opacity=".85"/>
<g fill="#2a7fd6" opacity=".45"><rect x="252" y="168" width="18" height="22" rx="4"/><rect x="280" y="168" width="18" height="22" rx="4"/><rect x="252" y="210" width="18" height="22" rx="4"/><rect x="280" y="210" width="18" height="22" rx="4"/><rect x="144" y="268" width="16" height="20" rx="4"/><rect x="170" y="268" width="16" height="20" rx="4"/><rect x="356" y="232" width="16" height="20" rx="4"/></g>
<path d="M88 352c52-44 96-50 140-16s92 40 148-12c22-20 40-44 52-70" fill="none" stroke="url(#fcflow)" stroke-width="30" stroke-linecap="round"/>
<circle cx="166" cy="320" r="17" fill="#fff"/><circle cx="292" cy="354" r="17" fill="#fff"/>
<path d="M404 238l42-20-6 46z" fill="#ff7a59"/>
<rect x="96" y="404" width="320" height="18" rx="9" fill="#0b2140" opacity=".35"/>
</svg>`;
export function logoSvg(size = 40) {
  const el = document.createElement('span');
  el.className = 'fc-logo-svg';
  el.style.width = el.style.height = `${size}px`;
  el.innerHTML = LOGO_SVG;
  return el;
}
