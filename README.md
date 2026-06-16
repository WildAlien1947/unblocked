# Simple Proxy Browser

This repository includes a small live server and a proxy browser page.

## Run locally

```bash
cd /Users/bk/Desktop/simple-website
npm install
npm start
```

Then open `http://localhost:3000/proxy-browser.html`.

## How it works

- `proxy-browser.html` uses the search box and button to navigate through `/proxy?url=...`
- `server.js` fetches remote pages, injects a `<base>` URL, and rewrites navigation links so browsing stays on the proxy

## Notes

- This is a lightweight development proxy for HTML pages. Some sites with strict CSP or advanced scripts may not display correctly.
- Search terms are routed through DuckDuckGo if the input is not a URL.
