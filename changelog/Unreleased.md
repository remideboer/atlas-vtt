## New

- Right-click the empty map to open map and player-view commands, pause the player picture, rotate it by quarter-turns, and lock the player zoom while the GM keeps panning. Arrow keys nudge that locked view. Resuming a pause places the GM map on the picture players are showing, and both views continue from there. Rotate the loaded map by quarter-turns so both views share it. Zooming the GM view while player zoom is locked keeps the player picture where it is. Send map at actual size makes one grid square the chosen physical size on the player screen, and leaves the GM view as it is. The command opens the player window maximized on the current map when that window is not already open, and fills the window to its screen when it is.
- A map can be given a width and height in inches when it is imported and while its grid is aligned. Actual size uses that paper size, also when the map has no grid, and a grid cell then measures the share of the paper it covers.
- The fog tool can cover the whole map, so a scene can start fully hidden and then be revealed.
- The fog tool paints a polygon by clicking corners (close on the first corner, Enter, or double-click), beside the brush, lasso and rectangle. Rectangle and polygon corners are free by default; Snap to grid in the fog menu turns snapping on.
- The toolbar shows or hides the scene grid, without opening the command palette.
- The Atlas dashboard opens from a home icon on the left ribbon.
- The GM and player views fill the area outside the map with a colour from the map's edge.
- When the grid is on, the player view continues its lines into the area outside the map.
- Right-click empty space in the asset manager to create a token, add a map, or create a collection.
- Press N, use the command palette, or right-click the empty map (Insert token at cursor) to pick a library token or a blank disc and place it at the cursor. The picker can create a new library token, insert hidden from players, then place it. A blank token opens Edit Token. Spawning from the asset manager also places at the last map pointer. Edit Token can hide a token from players.
- Edit Token can change a placed token’s art from the library, including blank.
- Choosing a ring colour turns the ring on for any placed token, including library art saved without a ring. None hides the ring.
- Token size menus offer Tiny (½×½) and Small (same 1×1 footprint as Medium).
- When creating a token, pick a transparency colour (or sample it from the image) to extend existing transparency into that colour, or to clear an opaque matching background from the image edge.
- A token can keep its resource bars on the GM map while hiding them from the player view (Edit Token or the token menu), without clearing the values.
- Insert token can search a local 5e.tools bestiary (path in Atlas settings), download that creature’s token art from 5e.tools, create a Fantasy Statblocks note, and place it on the map.

## Fixed

- A transparency colour removes every pixel near the picked colour (a few shades either side), wherever it sits in the image.
- Opening a recent scene shows that scene's map.
- Send map at actual size maximizes the player window, where the window stayed at its previous size.
- Measured distances show one decimal place, so a 1.5 m cell reads 1.5 m instead of 2 m.
- The fog brush paints and reveals an even stroke while you drag it, where a slow stroke showed a pattern of half-covered dots until it was let go
- The first fog stroke after all fog was deleted shows while you draw it, where it appeared only once let go
