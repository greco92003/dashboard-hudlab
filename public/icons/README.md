# PWA Icons

This directory should contain the following icon files for your PWA:

## Required Icon Sizes:

### Standard Icons:
- `icon-16x16.png` - 16x16 pixels (favicon)
- `icon-32x32.png` - 32x32 pixels (favicon)
- `icon-72x72.png` - 72x72 pixels (Android)
- `icon-96x96.png` - 96x96 pixels (Android)
- `icon-128x128.png` - 128x128 pixels (Android)
- `icon-144x144.png` - 144x144 pixels (Android, Windows)
- `icon-152x152.png` - 152x152 pixels (iOS)
- `icon-192x192.png` - 192x192 pixels (Android, iOS)
- `icon-384x384.png` - 384x384 pixels (Android)
- `icon-512x512.png` - 512x512 pixels (Android)

### Additional Files:
- `safari-pinned-tab.svg` - SVG icon for Safari pinned tabs
- `favicon.ico` - Traditional favicon (place in public root)

## How to Generate Icons:

1. **Start with a high-resolution logo** (at least 512x512 pixels)
2. **Use an online PWA icon generator** like:
   - https://www.pwabuilder.com/imageGenerator
   - https://realfavicongenerator.net/
   - https://favicon.io/favicon-generator/

3. **Or use design tools** like:
   - Figma
   - Adobe Illustrator
   - Canva
   - GIMP (free)

## Design Guidelines:

- **Use your brand colors** (currently set to black theme: #000000)
- **Make icons recognizable** at small sizes
- **Ensure good contrast** against different backgrounds
- **Consider maskable icons** - icons should work well when cropped to different shapes
- **Keep it simple** - avoid too much detail for smaller sizes

## Current Theme Colors:
- Primary: #000000 (black)
- Background: #ffffff (white)

Update the theme colors in `/public/manifest.json` if you want different colors.
