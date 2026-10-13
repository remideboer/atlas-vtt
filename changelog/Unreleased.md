## New

- Right-click the empty map to open map and player-view commands, pause the player picture, rotate it by quarter-turns, and lock the player zoom while the GM keeps panning. Arrow keys nudge that locked view. Resuming a pause places the GM map on the picture players are showing, and both views continue from there. Rotate the loaded map by quarter-turns so both views share it. Zooming the GM view while player zoom is locked keeps the player picture where it is. Send map at actual size makes one grid square the chosen physical size on the player screen, and leaves the GM view as it is. The command opens the player window maximized on the current map when that window is not already open, and fills the window to its screen when it is.
- A map can be given a width and height in inches when it is imported and while its grid is aligned. Actual size uses that paper size, also when the map has no grid, and a grid cell then measures the share of the paper it covers.
- The fog tool can cover the whole map, so a scene can start fully hidden and then be revealed.

## Fixed

- Send map at actual size maximizes the player window, where the window stayed at its previous size.
- Measured distances show one decimal place, so a 1.5 m cell reads 1.5 m instead of 2 m.
- The fog brush paints and reveals an even stroke while you drag it, where a slow stroke showed a pattern of half-covered dots until it was let go
- The first fog stroke after all fog was deleted shows while you draw it, where it appeared only once let go
