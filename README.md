# HGH Feed Checker

A desktop web tool for music podcasters to validate their RSS feeds before publishing. Check chapters, V4V (Value4Value) payment info, and Podcasting 2.0 compliance.

## Live Demo

Deployed on Vercel: [hgh-checker.vercel.app](https://hgh-checker.vercel.app) (or your deployment URL)

## Features

### Feed Validation
- **Paste any RSS feed URL** - Works with any podcast feed
- **Inline error display** - Errors shown directly in episode cards
- **Chapter validation** - Checks timestamps are sequential with no overlaps
- **V4V validation** - Validates Lightning payment splits and addresses

### Episode Cards
- Collapsible cards showing episode title, date, duration
- Badges for Chapters, Songs count, and Issues
- Red border highlights episodes with problems
- Expandable details with chapters and V4V info

### Expandable Chapters
- Click any chapter to expand details
- Shows chapter artwork, links, and V4V payment breakdown
- Fetches artist info (song title, artist name, album art) from Podcast Index API
- Displays payment splits for both Song Artist (99%) and Show (1%)

### V4V Payment Info
- Lightning node addresses link to [amboss.space](https://amboss.space) for lookup
- Shows payment split percentages and actual totals
- Validates feed/item GUIDs for remote items (songs)

### Validation Checks

| Check | What it validates |
|-------|-------------------|
| **Chapters** | File exists, timestamps sequential, no overlaps |
| **V4V Splits** | Feed GUID, item GUID, valid percentages |
| **Episode** | GUID present, audio enclosure exists |
| **Lightning** | Address format, splits total 100% |

## How to Use

1. Go to the deployed URL or run locally
2. Paste an RSS feed URL (defaults to Homegrown Hits feed)
3. Click **Check Feed**
4. Review episodes - expand any with the red "Issues" badge
5. Click chapters to see artwork and V4V payment details

## Local Development

```bash
# Start the CORS proxy server
npm start

# Open index.html in browser or use a local server
python3 -m http.server 3000
```

The proxy runs on port 3001 and handles CORS for fetching external feeds.

## Deployment

Configured for Vercel deployment:
- Static files served from root
- Serverless CORS proxy at `/api/proxy`
- No build step required

```bash
# Deploy to Vercel
vercel
```

## File Structure

```
HGH-checker/
├── index.html          # Main UI
├── script.js           # Feed parsing, validation, display logic
├── styles.css          # Dark glassmorphism theme
├── api/
│   └── proxy.js        # Vercel serverless CORS proxy
├── proxy-server.js     # Local development CORS proxy
├── vercel.json         # Vercel deployment config
├── package.json        # Project metadata
└── README.md           # This file
```

## Technical Details

- **Desktop-only** - Optimized for wide screens (1400px max-width)
- **No npm dependencies** - Pure HTML/CSS/JS frontend
- **Podcast Index API** - Fetches artist info and artwork
- **CORS proxy** - Serverless function for cross-origin feed fetching

## Error Severity

- **Errors** (red) - Critical issues like missing GUIDs
- **Warnings** (yellow) - Non-critical like missing chapters

## License

MIT
