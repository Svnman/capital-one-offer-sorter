# Capital One Offer & Shopping Deal Sorter

A lightweight Firefox extension that automatically sorts offers by reward value on **CapitalOneShopping.com** and **CapitalOneOffers.com** — making it easier to spot the best cashback and mileage deals first.

---

## 🔍 What It Does

This extension enhances both Capital One shopping platforms by:

- Automatically sorting offers in **descending reward value**
- Supporting both **miles-based** and **cashback** offers
- Letting you choose between sorting by **miles** or **multipliers** (Offers tab), or **$ back** vs **% back** (Shopping tab)
- Providing a toggle to **turn sorting on/off** any time
- Displaying a subtle **"Sorting..."** notice while active

⚙️ Built to work dynamically by observing DOM changes in real time — even as more offers are loaded on scroll.

---

## ✨ Features

- ✅ **Dual-site support**:
  - `CapitalOneOffers.com` → Sort by **Miles**, **Multipliers (X miles)**, or **% back**
  - `CapitalOneShopping.com` → Sort by **$ back** or **% back**

- 🔁 **Auto-loads all available offers**
- 🔢 **Parses multiple formats**:
  - `"10,000 miles"`, `"25X miles"`, `"15% back"`, `"$75 back"`

- 🔀 **Toggle sorting** on/off from popup
- 🎚️ **Choose sort preference** per site
- 🪄 **Lightweight popup UI** with support/donation link
- 🧠 **No page reload required** — sorting runs live on the site

---

## 🧩 Installation

Install directly from Firefox Add-ons:

👉 [Sort Capital One Offers – Firefox Add-on](https://addons.mozilla.org/en-US/firefox/addon/sort-capital-one-offers/)

---

## 🧪 Developer Notes

- No frameworks, no bundling — built with **vanilla JavaScript**
- Uses **MutationObserver** to detect and sort dynamically
- Works on both **grid and slider-based layouts**
- Core logic lives in `content.js` (fully commented)

---

## 🪪 License

MIT License — fork it, improve it, or build on top of it!

---

🧠 Built with help from ChatGPT & coffee ☕  
