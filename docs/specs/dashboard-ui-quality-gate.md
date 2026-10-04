# Dashboard UI quality gate

The dashboard quality gate runs entirely against the local production build and bundled synthetic fixtures. It makes no external API, CDN, font, analytics, or customer-data request.

## Commands

From the repository root:

```sh
npm run quality -w @ghec/dashboard
npm run check:bundle -w @ghec/dashboard
npm run test:a11y -w @ghec/dashboard
npm run test:visual -w @ghec/dashboard
```

When an intentional visual change has been reviewed in both themes and all viewport sizes, update baselines with:

```sh
npm run test:visual:update -w @ghec/dashboard
```

Review every changed PNG before committing it. Playwright uses its pinned Chromium build; install it once with `npx playwright install chromium`.

## Production bundle budget

The dashboard build fails when any of these measured limits is exceeded:

| Measurement                            |  Budget | 2026-10-04 baseline |
| -------------------------------------- | ------: | ------------------: |
| Largest JavaScript chunk, uncompressed | 600 KiB |           520.9 KiB |
| Initial JavaScript, gzip total         | 270 KiB |           254.1 KiB |
| Initial CSS, gzip total                |  80 KiB |            73.0 KiB |

Feature pages load on demand. PDF generation and its rendering/sanitization
dependencies must remain outside the initial HTML asset graph. The budget check
runs after every production build, including the root CI quality gate. Budget
changes require an intentional documentation update and review; do not raise a
limit merely to accommodate an unexplained regression.

## Release checklist

- [ ] Production build, bundle budget, type checking, style guard, interaction tests, axe scan, and visual comparison pass.
- [ ] Keyboard-only flow reaches the skip link, app bar, navigation, filters, tables, exports, and Close File without a trap or lost focus.
- [ ] Mobile drawer, organization dropdown, global search, settings, and confirmation dialogs open, contain focus, close with Escape, and return focus.
- [ ] Virtualized rows accept keyboard focus and preserve focus after view changes.
- [ ] Serious and critical axe violations are zero on upload, every destination, and remediation comparison.
- [ ] Status meaning includes visible text or an icon and never relies only on color.
- [ ] Light and dark screenshots are reviewed at 320×568, 768×1024, 1024×768, 1440×900, and 1920×1080.
- [ ] Empty, error, loaded, filtered, incomplete-collection, modal, drawer, and remediation states match approved baselines.
- [ ] Text and controls meet WCAG AA contrast in both themes.
- [ ] Touch controls are at least 44×44px or their associated label supplies that target.
- [ ] Content remains operable at 200% zoom and with enlarged browser text; required data stays available through contained scrolling.
- [ ] Reduced-motion mode removes nonessential transitions and no action exists only on hover.
- [ ] Browser network inspection shows no remote requests; imports, analysis, search, settings, comparison, and exports work offline.

CI uploads the Playwright HTML report and failure artifacts when the gate fails. Visual baseline changes require human review rather than automatic CI approval.
