# Icon sources

`../icon-source.svg` is the 128px master. The 16, 32, and 48px files here are separate drawings aligned to whole pixels, so the bars stay sharp at toolbar sizes instead of blurring when the master is scaled down. Export each SVG at its own size (for example with Inkscape, `rsvg-convert`, or `sharp`) to the matching PNG in `/icons`.

The design: two usage meters on a blue plate. The green bar (shorter window) and amber bar (longer window) echo the colored percentages in the widget.
