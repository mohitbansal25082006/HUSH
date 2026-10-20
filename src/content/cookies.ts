/**
 * Cookie consent auto-reject. Detects common consent management platforms (CMPs) and clicks
 * their "reject all" / "necessary only" button. Cosmetic filters already hide most banners; this
 * makes sure the site also records a refusal instead of silently assuming consent.
 */

interface Cmp {
  name: string;
  /** Present when the CMP is on the page. */
  detect: string;
  /** Buttons to click, in order; first visible one wins. Use `>>>` to pierce a shadow root. */
  reject: string[];
}

const CMPS: Cmp[] = [
  { name: 'OneTrust', detect: '#onetrust-banner-sdk', reject: ['#onetrust-reject-all-handler', '.ot-pc-refuse-all-handler', 'button.onetrust-close-btn-handler'] },
  { name: 'Cookiebot', detect: '#CybotCookiebotDialog', reject: ['#CybotCookiebotDialogBodyButtonDecline', '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll'] },
  { name: 'Didomi', detect: '#didomi-notice', reject: ['#didomi-notice-disagree-button', '.didomi-continue-without-agreeing'] },
  { name: 'Quantcast', detect: '.qc-cmp2-container', reject: ['.qc-cmp2-summary-buttons button[mode="secondary"]', 'button[aria-label="REJECT ALL"]'] },
  { name: 'TrustArc', detect: '#truste-consent-track', reject: ['#truste-consent-required', 'button.truste-button2'] },
  { name: 'Usercentrics', detect: '#usercentrics-root', reject: ['#usercentrics-root >>> button[data-testid="uc-deny-all-button"]'] },
  { name: 'Usercentrics CMP v3', detect: '#usercentrics-cmp-ui', reject: ['#usercentrics-cmp-ui >>> button#deny', '#usercentrics-cmp-ui >>> button[data-action-type="deny"]'] },
  { name: 'Complianz', detect: '.cmplz-cookiebanner', reject: ['.cmplz-btn.cmplz-deny'] },
  { name: 'CookieYes', detect: '.cky-consent-container', reject: ['.cky-btn-reject'] },
  { name: 'Osano', detect: '.osano-cm-window', reject: ['.osano-cm-denyAll', '.osano-cm-button--type_denyAll'] },
  { name: 'Iubenda', detect: '#iubenda-cs-banner', reject: ['.iubenda-cs-reject-btn'] },
  { name: 'Klaro', detect: '.klaro .cookie-notice', reject: ['.klaro .cn-decline'] },
  { name: 'Termly', detect: '[data-testid="termly-banner"]', reject: ['[data-tid="banner-decline"]'] },
  { name: 'Borlabs', detect: '#BorlabsCookieBox', reject: ['#BorlabsCookieBox a[data-cookie-refuse]', '#BorlabsCookieBox ._brlbs-refuse-btn a'] },
  { name: 'Sourcepoint', detect: 'div[id^="sp_message_container"]', reject: [] },
  { name: 'Axeptio', detect: '#axeptio_overlay', reject: ['#axeptio_btn_dismiss'] },
  { name: 'Google Funding Choices', detect: '.fc-consent-root', reject: ['.fc-cta-do-not-consent', 'button.fc-cta-manage-options ~ button.fc-secondary-button'] },
  { name: 'Ezoic', detect: '#ez-cookie-dialog', reject: ['#ez-reject-all'] },
  { name: 'Civic', detect: '#ccc-notify', reject: ['#ccc-reject-settings', '.ccc-reject-button'] },
  { name: 'Moove GDPR', detect: '#moove_gdpr_cookie_info_bar', reject: ['.moove-gdpr-infobar-reject-btn'] },
  { name: 'CookieFirst', detect: '.cookiefirst-root', reject: ['[data-cookiefirst-action="reject"]'] },
  { name: 'Consentmanager', detect: '#cmpbox', reject: ['#cmpbox a.cmpboxbtnno', '#cmpwelcomebtnno a'] },
  { name: 'Shopify', detect: '#shopify-pc__banner', reject: ['#shopify-pc__banner__btn-decline'] },
  { name: 'Wix', detect: '[data-hook="consent-banner-root"]', reject: ['[data-hook="consent-banner-decline-button"]'] },
  { name: 'HubSpot', detect: '#hs-eu-cookie-confirmation', reject: ['#hs-eu-decline-button'] },
  { name: 'Amazon', detect: '#sp-cc', reject: ['#sp-cc-rejectall-link'] },
  { name: 'Reddit', detect: 'reddit-cookie-banner', reject: ['reddit-cookie-banner >>> #reject-nonessential-cookies-button button'] },
  { name: 'Google', detect: 'form[action*="consent.google"]', reject: ['form[action*="consent.google"] button[aria-label^="Reject"]'] },
];

function query(sel: string): HTMLElement | null {
  try {
    if (!sel.includes('>>>')) return document.querySelector<HTMLElement>(sel);
    let root: Document | ShadowRoot | Element = document;
    let el: Element | null = null;
    for (const part of sel.split('>>>').map((s) => s.trim())) {
      el = root.querySelector(part);
      if (!el) return null;
      root = el.shadowRoot ?? el;
    }
    return el as HTMLElement | null;
  } catch {
    return null;
  }
}

const visible = (el: HTMLElement) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

export function startCookieAutoReject(): void {
  const done = new Set<string>();
  let attempts = 0;
  const tick = () => {
    attempts++;
    for (const cmp of CMPS) {
      if (done.has(cmp.name)) continue;
      const host = query(cmp.detect.split('>>>')[0]);
      if (!host) continue;
      for (const sel of cmp.reject) {
        const btn = query(sel);
        if (btn && visible(btn)) {
          btn.click();
          done.add(cmp.name);
          break;
        }
      }
    }
    if (attempts < 20) setTimeout(tick, attempts < 5 ? 400 : 1000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(tick, 300), { once: true });
  else setTimeout(tick, 300);
}
