const urls = [
  "https://sokany-eg.com/",
  "https://sokany-eg.com/product/sk-10052/",
];

function extractPixelIds(html) {
  const ids = new Set();
  for (const match of html.matchAll(/fbq\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/g)) {
    ids.add(match[1]);
  }
  for (const match of html.matchAll(/pixel[_-]?id['"]?\s*[:=]\s*['"]?(\d{5,})/gi)) {
    ids.add(match[1]);
  }
  for (const match of html.matchAll(/facebook\.com\/tr\/?\?id=(\d+)/g)) {
    ids.add(match[1]);
  }
  for (const match of html.matchAll(/"pixel_id"\s*:\s*"?(\d+)"?/g)) {
    ids.add(match[1]);
  }
  return [...ids];
}

for (const url of urls) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
  });
  const html = await res.text();
  const ids = extractPixelIds(html);
  const eventHints = ["PageView", "ViewContent", "AddToCart", "Purchase", "InitiateCheckout"].filter(
    (eventName) => html.includes(eventName),
  );
  console.log(
    JSON.stringify(
      {
        url,
        status: res.status,
        hasFbq: /fbq\s*\(|fbevents\.js|connect\.facebook\.net/.test(html),
        pixelIds: ids,
        eventHints,
        pluginHint: /facebook-for-woocommerce|wc-facebook/i.test(html),
      },
      null,
      2,
    ),
  );
}
