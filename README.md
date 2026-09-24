# EOD Work Log

A small static website for recording daily work and preparing an end-of-day report for Teams.

- **Today:** enter a ticket or task title and an optional description. A title alone is enough; include results, quantities, blockers, or next steps only when useful. Ctrl+Enter or Cmd+Enter adds the update. Unadded titles and descriptions are saved as a draft. **Paste several updates or spreadsheet rows** groups and reviews batches; exact repeats start unchecked but can be included when they represent separate work. No row, ticket description, or status is required or inferred. Detailed entries and cable breakdowns remain available under an optional disclosure.
- **Report:** review a compact production table and share or download its PDF from the main report card. Acting lead appears only when a name is entered; crew names remain visible. The card shows the report date, update count, and Draft/Ready status. Missing details link back to the log. Full ticket descriptions and text-copy methods remain under **Report options & text copy**; older records retain all their fields.
- **History:** reopen days and export/import JSON backups. Imports keep existing dates and add missing dates.

The public repository contains only the app and synthetic test fixtures. It does not contain crew details or real work records. There are no analytics, external scripts, report-upload endpoints, or cloud accounts. App data is stored in this browser's localStorage, under `eod-work-log:v1`.

## Paste from your computer

For one update, paste or type into **Title / ticket** and add a description if useful. To import several updates, open **Paste several updates or spreadsheet rows**, then paste into **Paste your updates** with Ctrl+V (Windows) or Cmd+V (Mac). Choose the grouping that fits:

- **One update per line:** for short production lists. A single new line adds immediately; batches open a review first.
- **One whole ticket / note:** keeps a multiline ticket together. Trim the original request down to the reference and result during review.
- **Separate by blank lines:** keeps each ticket or note block together.
- **Spreadsheet rows (tabs):** for cells copied from Excel or another tab-separated table. Set **First row contains column names** to match what you copied. Quoted multiline cells are preserved. Unquoted line breaks are separate rows.

Use Ctrl+Enter or Cmd+Enter in the paste box to continue. In the review, edit or uncheck entries, then **Add N updates**. Back to paste keeps the original draft. Saving adds only checked entries and clears the paste box. Duplicate detection compares exact update text in the current day and pasted batch; it does not match ticket IDs or infer whether similar work is the same task. The app groups text locally; it does not automatically summarize ticket descriptions or invent completion statuses.

Download the PDF directly on your computer when finished. Saved days do not sync automatically to an iPhone; use History → Export backup / Import backup to transfer saved days if needed. Imports add missing dates and keep existing dates.

## Use on iPhone

Open the published website in Safari, then use Share → Add to Home Screen. Open the Home Screen icon before entering your details. Add short production updates, open **Report**, review it, and tap **Share PDF**. Choose Teams, select the conversation, and send. If Teams is not offered, tap **Download PDF**, then use **+ → Attach** in Teams to choose the file from Files or Downloads. Browsers without native sharing show Download PDF as the main action.

The PDF preserves table layout, embeds fonts, and numbers its pages. Compact reports omit original ticket descriptions by default; full details are optional. Draft reports remain labeled Draft. The app prevents repeated PDF taps while the share sheet is open and gives download instructions if native sharing fails. Closing sharing leaves the log intact. A PDF is an attachment, not an editable table in a chat message. The app does not send to Teams automatically or verify delivery; check the destination yourself.

**Copy table** uses native browser selection copying from the displayed report. This is a compatibility path for testing app-to-app paste; the browser must support the legacy copy command. **Select report** lets you use the device's native Copy action yourself. **Copy alternate format** writes both HTML and plain text through the Async Clipboard API. **Copy readable text** copies numbered entries with line breaks. These are separate methods; none promises that Teams will accept a table. A clipboard check in a desktop browser does not prove iPhone Teams behavior. Review every paste before sending.

Version 3.3 reads existing schema 1, 2, and 3 records and backups automatically, keeping the same storage key and website address. Reload the app to update; do not clear website data. New exports use schema 4 to retain title-only updates and title/description drafts. Older app versions cannot read schema 4 backups.

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
