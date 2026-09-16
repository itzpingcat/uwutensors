/**
 * Placeholder profile picture: a deterministic identicon-style grid derived
 * from the pubkey, since we don't fetch a real avatar (kind 0 metadata)
 * yet. Same seed always renders the same pattern/color, so a user's icon
 * stays visually stable across reloads without a network request.
 */
export function AvatarIcon({ seed, loggedIn }: { seed: string; loggedIn: boolean }) {
  const cells = buildCells(seed);
  const hue = hueFromSeed(seed);

  return (
    <svg
      className={"avatar-icon" + (loggedIn ? "" : " avatar-icon-out")}
      viewBox="0 0 5 5"
      width="22"
      height="22"
      role="img"
    >
      <rect width="5" height="5" fill={`hsl(${hue}, 35%, 16%)`} />
      {cells.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="1" height="1" fill={`hsl(${hue}, 65%, 60%)`} />
      ))}
    </svg>
  );
}

function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

// 5x5 grid, mirrored left-right (only need to decide the left 3 columns),
// each cell on/off based on a bit of the seed's char codes.
function buildCells(seed: string): [number, number][] {
  const cells: [number, number][] = [];
  let bit = 0;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      const charCode = seed.charCodeAt(bit % seed.length) || 0;
      const on = ((charCode >> (bit % 8)) & 1) === 1;
      bit++;
      if (!on) continue;
      cells.push([x, y]);
      if (x < 2) cells.push([4 - x, y]);
    }
  }
  return cells;
}
