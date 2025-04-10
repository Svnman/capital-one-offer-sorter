# Capital One Offer Sorter

A lightweight Firefox extension that automatically sorts Capital One Shopping offers based on mileage rewards.

## 🔍 What It Does

By default, this extension:

- Loads **all available offers** (automatically clicking "View More Offers")
- Sorts them so the **highest-mileage offers** appear first
- Lets you **revert to original order** anytime via popup toggle
- Allows a secondary toggle to **prioritize X miles** (multipliers) over fixed mileage

🧠 Built to work dynamically with the Capital One Shopping interface using real-time DOM observation.

## 📦 Features

- 🔁 Auto-loads all offers by clicking "View More Offers"
- 🔢 Sorts based on:
  - **Fixed miles** (e.g. "10,000 miles")
  - **Multiplier miles** (e.g. "30X miles")
  - **Percentage offers** are deprioritized
- 🔀 Toggle sorting on/off
- 🎚️ Toggle sort preference between **#Miles** and **XMiles**
- 🔔 Displays a **“Sorting offers… please wait.”** notice while sorting
- 🎨 Clean and simple popup UI with donation link

## 🧩 Installation

Install the extension directly from the official Firefox Add-ons site:

👉 **[Sort Capital One Offers – Firefox Add-on](https://addons.mozilla.org/en-US/firefox/addon/sort-capital-one-offers/)**

## 🧪 Development Notes

- No bundling, no minification — 100% readable and transparent
- Written in **vanilla JavaScript**
- Targets Capital One Shopping site with **class-based DOM hooks**
- Core logic lives in `content.js` with full inline documentation for reviewers

## 🪪 License

MIT License — feel free to fork, contribute, or improve.

---

🧠 Built with help from ChatGPT & coffee ☕  
