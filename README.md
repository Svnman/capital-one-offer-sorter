# Capital One Offer Sorter

A lightweight Firefox extension that automatically sorts Capital One Shopping offers based on mileage rewards.

By default, the extension will:
- Load all available offers
- Sort them so that higher-mileage offers appear first
- Optionally revert to the original order with a toggle

🧠 Built to work dynamically with the Capital One Shopping interface using real-time DOM observation.

---

## 📦 Features

- Automatically clicks "View More Offers" until all are loaded
- Sorts based on:
  - Fixed miles (e.g. "10,000 miles")
  - Multiplier (e.g. "30X miles")
  - Percentage offers are deprioritized
- Toggle sorting on or off from the extension popup
- Displays a "Sorting offers… please wait." notice during operation

---

## 🧩 Installation

Install the extension directly from the official Firefox Add-ons site:
[https://addons.mozilla.org/en-US/firefox/addon/sort-capital-one-offers/](https://addons.mozilla.org/en-US/firefox/addon/sort-capital-one-offers/)

---

## 🧪 Development Notes

- No bundling or minification — fully readable source code
- Written in plain JavaScript with no frameworks
- Works on the Capital One Shopping website using DOM class detection
- `content.js` is fully annotated for reviewers

---

## 🪪 License

MIT License — feel free to fork, modify, and improve.

---
