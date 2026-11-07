# Kazan social preview

`kazan-preview.webp` is a 1280 × 687 version of Adel Nizamutdinov's
Slop Kazan screenshot, originally published in the article
<https://adelnz.com/writing/slop-city/>. It was processed by that site's
`solid-static/image` pipeline from
`src/content/writing/slop-city/slop-kazan.png`.

Vite imports this source image through the Open Graph and Twitter metadata,
emits one content-hashed asset, and resolves both social URLs against
`SITE_URL` (default: `https://kazan.adelnz.com`).
