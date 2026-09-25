# EOD Work Log

A small static website for recording daily work and preparing an end-of-day report for Teams.

- **Today:** one visible workspace, with **Paste tasks & updates** and **Add one update** alongside each other on desktop and stacked on smaller screens. Review pasted titles and descriptions beside the paste box. Matching tickets offer a choice to update existing work, add separate work, or skip. Exact repeats and repeated ticket references within a batch start skipped. For one update, a ticket or task title is enough, with an optional description. Ctrl+Enter or Cmd+Enter continues either form. Unadded notes, review edits, and titles/descriptions are saved as drafts. No row, ticket description, or status is required or inferred. Detailed entries and cable breakdowns remain available under an optional disclosure.
- **Report:** review a compact production table and share or download its PDF from the main report card. Acting lead appears only when a name is entered; crew names remain visible. The card shows the report date, update count, and Draft/Ready status. Missing details link back to the log. Full ticket descriptions and text-copy methods remain under **Report options & text copy**; older records retain all their fields.
- **History:** reopen days and export/import JSON backups. Imports keep existing dates and add missing dates.

The public repository contains only the app and synthetic test fixtures. It does not contain crew details or real work records. There are no analytics, external scripts, report-upload endpoints, or cloud accounts. App data is stored in this browser's localStorage, under `eod-work-log:v1`.

## Paste from your computer

Paste into **Paste your updates** with Ctrl+V (Windows) or Cmd+V (Mac). The paste box and all four grouping options are always visible. Choose the grouping that fits:

- **One update per line:** for short production lists. Each line becomes a suggested title in the review.
- **One whole ticket / note:** keeps a multiline ticket together. Trim the original request down to the reference and result during review.
- **Separate by blank lines:** keeps each ticket or note block together.
- **Spreadsheet rows (tabs):** for cells copied from Excel or another tab-separated table. Set **First row contains column names** to match what you copied. Quoted multiline cells are preserved. Unquoted line breaks are separate rows.

Use Ctrl+Enter or Cmd+Enter in the paste box to review on the same screen. The first line is suggested as the title and remaining lines as the description. If the first line is too long for a title, all text stays in the description for you to name. Edit each entry and choose how to save it, then **Save N updates**. **Keep draft & close** retains edits; reopening or reloading restores them. Changing the source or grouping requires **Refresh review**, which replaces review edits with fresh suggestions. **Finish without adding** clears an all-skipped review. Your last grouping and column-header preference carry into new days; saved days retain their own settings.

Ticket matching looks only at today's log, using an explicit ticket field or a single reference in the title/first line. It recognizes common prefixed IDs such as INC204, REQ-204, WO-42, and ABC-123; case and separator differences are ignored, while digits (including leading zeros) remain exact. Multiple references and row/rack labels are not used to choose a match. References buried only in descriptions are not matched. Matching never updates automatically: select an existing entry or **Add separate work**. Updating replaces the title and progress, preserving the original request, quantities, status, and other detailed fields. Only one update per existing entry is allowed in each batch. The app groups text locally; it does not summarize descriptions or infer completion.

To write one update yourself, use **Title / ticket** in the adjacent **Add one update** form. Add a description if useful. Both forms add to the same daily log; you only need to use one for each piece of work.

Download the PDF directly on your computer when finished. Saved days do not sync automatically to an iPhone; use History → Export backup / Import backup to transfer saved days if needed. Imports add missing dates and keep existing dates.

## Use on iPhone

Open the published website in Safari, then use Share → Add to Home Screen. Open the Home Screen icon before entering your details. Add short production updates, open **Report**, review it, and tap **Share PDF**. Choose Teams, select the conversation, and send. If Teams is not offered, tap **Download PDF**, then use **+ → Attach** in Teams to choose the file from Files or Downloads. Browsers without native sharing show Download PDF as the main action.

The PDF preserves table layout, embeds fonts, and numbers its pages. Compact reports omit original ticket descriptions by default; full details are optional. Draft reports remain labeled Draft. The app prevents repeated PDF taps while the share sheet is open and gives download instructions if native sharing fails. Closing sharing leaves the log intact. A PDF is an attachment, not an editable table in a chat message. The app does not send to Teams automatically or verify delivery; check the destination yourself.

**Copy table** uses native browser selection copying from the displayed report. This is a compatibility path for testing app-to-app paste; the browser must support the legacy copy command. **Select report** lets you use the device's native Copy action yourself. **Copy alternate format** writes both HTML and plain text through the Async Clipboard API. **Copy readable text** copies numbered entries with line breaks. These are separate methods; none promises that Teams will accept a table. A clipboard check in a desktop browser does not prove iPhone Teams behavior. Review every paste before sending.

Version 3.6 reads existing schema 1–5 records and backups automatically, keeping the same storage key and website address. Reload the app to update; do not clear website data. New exports use schema 6 to retain categories, carry-forward references, and Undo. Older app versions cannot read schema 6 backups.

## Edit and organize the daily log

Use **Edit here** on an entry to change its title, progress, category, or row/area directly in the log. **Save changes** (Ctrl/Cmd+Enter) commits the edit; **Cancel** keeps the saved entry. Detailed entries also have **Full details** for the original request, quantities, and cable breakdowns. Inline drafts stay available while changing views or dates in the current session; save or cancel before reloading or opening that day’s report.

Category and row/area are optional. New entries suggest a category only when one work type is clear; ambiguous text stays uncategorized. Paste review lets you change the suggestion. Existing entries are not reclassified automatically. **Organize log** switches between All updates, By category, and By row/area (natural order, such as Row 2 before Row 10). Check entries, choose **Set category** and/or **Set row/area**, then **Apply to selected** to organize them together. Blank area clears the tag only when Set row/area is checked.

The report, readable text, and PDF group entries by category and include uncategorized work. Each entry retains its title/ticket, optional location, and progress; blockers remain in a separate section. An empty acting lead is omitted.

**Undo last log change** restores the previous task list after adding, editing, deleting, changing status, organizing, or bringing work forward. One undo is saved per day and survives a reload or backup. It does not change shift details or current composer drafts, and it does not undo clearing an all-skipped paste review.

**Bring work forward** starts with the latest earlier saved work day. Select only unfinished work; completed detailed entries and tickets already logged on the destination day cannot be selected. Updates without a status require your judgment. Titles, ticket references, original requests, categories, and locations are retained; progress, quantities, and cable breakdowns start blank with new entry IDs. Untitled legacy notes need a short title in the original day first so an old production result is not mistaken for today’s work. Nothing is brought forward automatically, and the original day remains unchanged.

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
