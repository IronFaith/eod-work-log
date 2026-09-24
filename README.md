# EOD Work Log

A small static website for recording daily work and preparing an end-of-day report for Teams.

- **Today:** shift details, crew defaults, tasks, quantities, cable-length groups, blockers, and carryover.
- **Report:** review tables, copy formatted HTML for Teams, or copy plain text.
- **History:** reopen days and export/import JSON backups. Imports keep existing dates and add missing dates.

The public repository contains only the app and synthetic test fixtures. It does not contain crew details or real work records. There are no analytics, external scripts, report-upload endpoints, or cloud accounts. App data is stored in this browser's localStorage, under `eod-work-log:v1`.

## Use on iPhone

Open the published website in Safari, then use Share → Add to Home Screen. Open the Home Screen icon before entering your details. Record a dummy task, reopen the app, and paste a copied report into Teams to check the actual device behavior. Review every report before sending.

An internet connection is needed to launch the app. There is no service worker or offline-launch support. Storage is tied to this website and browser context; it is not encrypted cloud storage or automatic iCloud sync. Clearing browser data can remove reports. Keep periodic backup exports in a private location such as Files or iCloud Drive. Do not commit backups to this repository.

## Local development

No dependency installation or build system is required. With Node.js 20+ and Python 3:

```text
npm run check
python -m http.server 8765 --bind 127.0.0.1
```

Visit http://127.0.0.1:8765. Serve through HTTP for module loading instead of opening index.html from a file preview.

## Deploy

Publish the repository root through GitHub Pages. Files are plain HTML, CSS, and JavaScript modules. `.nojekyll` disables Jekyll processing.

This implementation was reconstructed from the EOD workflow requirements because the original generated download was unavailable. Actual iPhone-to-Teams formatting must be checked on the user's device; a desktop browser check is not equivalent.
