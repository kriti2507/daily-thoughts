"""Parse the user's goals.md into structured Goal objects.

The schema in db.py is hard-coded for exactly 3 goals with stable slot indices
1/2/3. The parser enforces that contract so a malformed goals.md can never
corrupt categorization data downstream.
"""

import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Goal:
    index: int
    title: str
    description: str


_H2_RE = re.compile(r"^##\s+(\d+)\.\s+(.+?)\s*$")


def load_goals(path: Path) -> list[Goal]:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"goals file not found: {path}")

    lines = path.read_text().splitlines()

    h2_positions: list[tuple[int, int, str]] = []
    for line_idx, line in enumerate(lines):
        m = _H2_RE.match(line)
        if m:
            h2_positions.append((line_idx, int(m.group(1)), m.group(2).strip()))

    if len(h2_positions) != 3:
        raise ValueError(
            f"expected 3 goals (## <int>. <title> headings), found {len(h2_positions)}"
        )

    indices = [p[1] for p in h2_positions]
    if indices != [1, 2, 3]:
        raise ValueError(
            f"goal indices must be 1, 2, 3 in order, got {indices}"
        )

    goals: list[Goal] = []
    for k, (line_idx, idx, title) in enumerate(h2_positions):
        end = h2_positions[k + 1][0] if k + 1 < len(h2_positions) else len(lines)
        body = "\n".join(lines[line_idx + 1 : end]).strip()
        goals.append(Goal(index=idx, title=title, description=body))

    return goals
