# The Tambiz Manual

The coordinator's and maintainer's manual, printed to [`Tambiz-Manual.pdf`](Tambiz-Manual.pdf).

| File | What it is |
|---|---|
| `manual.html` | The source: one HTML page, styled for A4 print. Edit this. |
| `images/` | Every picture in the manual: screenshots of the app, and spreadsheet renders. |
| `Tambiz-Manual.pdf` | The printed manual. Rebuild it after any change to `manual.html` or `images/`. |

## Rebuild the PDF

On a Mac with Google Chrome, from this folder:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer \
  --allow-file-access-from-files --virtual-time-budget=8000 \
  --print-to-pdf=Tambiz-Manual.pdf "file://$PWD/manual.html"
```

On Windows or Linux, use the same flags with that system's Chrome (`chrome.exe`, `google-chrome`). Chrome prints the page numbers and chapter names in the footer from the `@page` rules in `manual.html`; other browsers may not.

Then open the PDF and look at every page: a picture that grew can push a step onto the next page.

## Retaking the pictures

Every screenshot comes from the app running on a laptop with its own empty local database, never the live site. Start it with the live database switched off:

```bash
DATABASE_URL= DATABASE_URL_POOLED= PGLITE_DIR=/some/empty/folder npx next dev
```

The pictures follow one invented year, Tambiz 2028: six groups, eighteen students and four judges, all invented. Take new ones at 1280 × 800 for the laptop and 390 × 844 for the phone, at twice the pixel density, and save them as JPEG in `images/`, keeping the file names so `manual.html` needs no change.

**Never put real student data in a picture.** The repository is public.

## The private copy

A second PDF with the account details of chapter 9.2 and the contacts of 9.9 filled in is kept outside this repository, and is never uploaded anywhere. In `manual.html` those two places sit between `<!--PRIVATE-ACCOUNTS-->` and `<!--PRIVATE-WHO-->` markers so the private copy can be made from the same source.
