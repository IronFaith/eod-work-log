# EOD Work Log

A small static website for recording daily work and preparing an end-of-day report for Teams.

- **Today:** shift details, crew defaults, field work, tickets, general tasks, optional quantities and cable-length groups, blockers, and carryover. Tickets have a title, reference number, request description, work performed, and status. Rows and endpoints are optional for every entry.
- **Report:** review tables, copy formatted HTML, copy readable text, or download/share a PDF with fixed table formatting.
- **History:** reopen days and export/import JSON backups. Imports keep existing dates and add missing dates.

The public repository contains only the app and synthetic test fixtures. It does not contain crew details or real work records. There are no analytics, external scripts, report-upload endpoints, or cloud accounts. App data is stored in this browser's localStorage, under `eod-work-log:v1`.

## Use on iPhone

Open the published website in Safari, then use Share → Add to Home Screen. Open the Home Screen icon before entering your details. To preserve tables in Teams, use **Share PDF** if available, or **Download PDF** and attach the file from Files → Downloads. A PDF is an attachment, not an editable table in a chat message. The app never sends a Teams message for you.

**Copy formatted** writes both HTML tables and a readable text fallback to the clipboard. **Copy readable text** explicitly copies numbered entries with line breaks. Teams chooses what formatting to accept and may flatten pasted content, especially on mobile. A clipboard check in a desktop browser does not prove iPhone Teams behavior. Review every paste before sending.

Version 2 reads existing version 1 records and backups automatically, keeping the same storage key and website address. Reload the app to update; do not clear website data. New exports use schema 2 to retain ticket fields. Old app versions cannot read schema 2 backups.

An internet connection is needed to launch the app. There is no service worker or offline-launch support. Storage is tied to this website and browser context; it is not encrypted cloud storage or automatic iCloud sync. Clearing browser data can remove reports. Keep periodic backup exports in a private location such as Files or iCloud Drive. Do not commit backups to this repository.

## Local development

No build is required to serve the app. With Node.js 20+ and Python 3, install the pinned test dependencies before running checks:

```text
npm ci --ignore-scripts
npm run check
python -m http.server 8765 --bind 127.0.0.1
```

Visit http://127.0.0.1:8765. Serve through HTTP for module loading instead of opening index.html from a file preview.

PDF generation runs on the device using bundled jsPDF 4.2.1, AutoTable 5.0.8, and Noto Sans fonts. Licenses are in `vendor/`. `npm run vendor` refreshes the checked-in browser files and downloads the fonts from a pinned official source revision. No runtime CDN or report upload is used.

## Deploy

Publish the repository root through GitHub Pages. Files are plain HTML, CSS, and JavaScript modules. `.nojekyll` disables Jekyll processing.

This implementation was reconstructed from the EOD workflow requirements because the original generated download was unavailable. Actual iPhone-to-Teams formatting must be checked on the user's device; a desktop browser check is not equivalent.
