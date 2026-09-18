# The repository banner

| File | What it is |
|---|---|
| `banner.html` | The source: one HTML page, the sign-in screen's field and card (`src/app/globals.css`, `.signin`). Edit this. |
| `banner.png` | 1280 × 320, the top of the repository's `README.md`. |
| `social-preview.png` | 1280 × 640, GitHub's social preview card. Content stays inside the middle 1200 × 600. |

## Rebuild the images

On a Mac with Google Chrome, from this folder. Chrome draws each at twice the size, then `sips` scales it down so the type is crisp:

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for h in 320 640; do
  "$CHROME" --headless=new --hide-scrollbars --allow-file-access-from-files --virtual-time-budget=8000 \
    --force-device-scale-factor=2 --window-size=1280,$h --screenshot=/tmp/banner-$h.png "file://$PWD/banner.html?h=$h"
done
sips -z 320 1280 /tmp/banner-320.png --out banner.png
sips -z 640 1280 /tmp/banner-640.png --out social-preview.png
```

It needs the internet for the Source Serif 4 face from Google Fonts. Look at both images afterwards.

`social-preview.png` does nothing until it is uploaded by hand: the repository's **Settings**, then **Social preview**, then **Edit**.
