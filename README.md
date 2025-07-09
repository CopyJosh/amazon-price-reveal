# Amazon Price Reveal

[![Version](https://img.shields.io/badge/version-0.1.1-blue.svg)](https://github.com/jotomaino/amazon-price-reveal)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight Chrome extension that reveals the real price details on Amazon product listings. During sales events like Prime Day, Amazon often hides the list price and only shows a percentage discount. This tool brings back the transparency by showing you the exact dollar amounts.

## Key Features

-   **Shows Real Numbers:** Displays the List Price, the current Sale Price, and the exact dollar amount you save.
-   **Works on Product Pages:** Correctly finds pricing for products already loaded on the page.
-   **Non-Intrusive UI:** Pricing details appear in a clean tooltip only when you hover over a product.
-   **Lightweight & Fast:** No unnecessary libraries or background processes. It's focused on one job and does it well.
-   **Privacy-Focused:** The extension does not track you or collect any personal data.

## Installation

1.  Download this repository as a ZIP file or clone it to your local machine.
2.  Open Google Chrome and navigate to `chrome://extensions`.
3.  Enable **"Developer mode"** using the toggle switch in the top-right corner.
4.  Click the **"Load unpacked"** button.
5.  Select the folder where you downloaded the extension files.
6.  The extension is now installed!

## How to Use

1.  Navigate to any Amazon deals page (like the Prime Day homepage or a search results page).
2.  Hover your mouse over any product card that has a discount.
3.  A small tooltip will appear, showing you the detailed pricing breakdown.

## How It Works

The extension uses a focused approach to capture pricing data:

**Page Load Analysis:** When a page loads, the extension scans inline `<script>` tags where Amazon embeds product configuration data. It looks for `assets.mountWidget` calls that contain JSON configuration objects with pricing information for each product (identified by ASIN).

**Tooltip Display:** When you hover over any element with a `data-asin` attribute, the extension displays a tooltip showing:
- **List Price:** The original/regular price
- **Sale Price:** The current discounted price  
- **You Save:** The exact dollar amount saved

The extension creates a single floating tooltip that follows your mouse and only appears when hovering over products with available pricing data.

## Technical Details

- **Manifest Version:** 3 (latest Chrome extension standard)
- **Permissions:** Only requires access to Amazon domains (`*://*.amazon.com/*`)
- **Runtime:** Content script runs on document idle for optimal performance
- **Memory Footprint:** Minimal - stores pricing data in a simple Map structure

## Author

*   **Josh Tomaino** - [LinkedIn](https://www.linkedin.com/in/jotomaino)

## Disclaimer

This extension is not affiliated with, endorsed by, or sponsored by Amazon.com, Inc. or any of its subsidiaries. Amazon and all related trademarks are the property of Amazon.com, Inc.

This software is provided for educational and personal use only. Users are responsible for complying with all applicable laws and terms of service. The developer assumes no responsibility for any consequences arising from the use of this software.
