# Apple's sizes and limits

As they stood in October 2026. Apple changes them: before the first render, open Apple's pages and check, and correct
`store/store.config.json` (and this page) when they differ.

- Screenshots: <https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications>
- Header and search-results video ("creative assets"):
  <https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/>
- Texts and other properties: <https://developer.apple.com/help/app-store-connect/reference/app-information>

If an address has moved, search Apple's App Store Connect help for the page's title.

## Pictures and video

| Asset | Size | Format | Notes |
|---|---|---|---|
| iPhone screenshots | portrait, one accepted size of one display class is enough: 1320 × 2868 (6.9-inch), 1206 × 2622 (6.3-inch) and their siblings | `.png` or `.jpg`, no alpha | one to ten per language; the store scales them for the other iPhones; the first ones show in search results |
| Product page header | 21:9, exactly 3840 × 1646 | `.png` or `.jpg`, no alpha | an iPhone shows the full height and about the middle 84% of the width |
| Search-results video | 3:2, from 1920 × 1280 to 3840 × 2560, 5 to 30 seconds, 30 or 60 fps | `.mov`, `.m4v` or `.mp4` | muted in search results; make it loop |
| iPad screenshots | only if the app runs on iPad: 2064 × 2752 (13-inch) and siblings | as above | a set of its own: an iPad screen is not a stretched phone screen |

## Texts, per language

| Field | Limit | Where the store uses it |
|---|---|---|
| Name | 30 | everywhere; searched |
| Subtitle | 30 | under the name; searched |
| Promotional text | 170 | above the description; can change without a new version |
| Keywords | 100, comma-separated, no spaces after commas | searched, never shown |
| Description | 4000 | the page; not searched |
| What's New | 4000 | from the second version on |
| Support URL, Marketing URL, Privacy Policy URL | an address each | per language: point each at that language's page |

## Test information (TestFlight)

| Field | Limit |
|---|---|
| Beta App Description | 4000 |
| What to Test (per build) | 4000 |
| Feedback Email, Marketing URL, Privacy Policy URL | |
| Beta App Review Information: contact name, phone, e-mail; sign-in details if the app needs them; notes (4000) | English is safest for the notes |

## The languages the store knows

`SKILL_DIR/tools/store.py` has the list with the name App Store Connect shows for each. Two things to remember: the store's
Latin American Spanish is listed as "Spanish (Mexico)", and English has four entries (U.S., U.K., Australia, Canada)
that fall back to one another, so one English is usually enough.
