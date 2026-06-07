# scan-inventory

Legal Hyundai test scanner for VINDeal.

What it does:
- Uses Google Places API to find dealers near the buyer ZIP/radius.
- Streams progress events as NDJSON so the frontend can show live dealer/inventory progress.
- Checks each dealer site's `robots.txt` before reading public inventory pages.
- Reads only public HTML pages. It does not bypass login, CAPTCHA, bot protection, or hidden/private APIs.
- Extracts VIN-level inventory when public page data contains matching VIN/model/year text.

Required Supabase secret:

```bash
supabase secrets set GOOGLE_PLACES_API_KEY=your_google_places_key
```

Deploy:

```bash
supabase functions deploy scan-inventory
```

Important limits:
- Google Places is used only for dealer discovery.
- Dealer inventory extraction is best-effort because every dealer website platform is different.
- If `robots.txt` blocks a page or cannot be read safely, this function skips that dealer inventory page.
