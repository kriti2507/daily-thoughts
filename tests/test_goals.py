from pathlib import Path

import pytest

from src.goals import Goal, load_goals


def _write_goals(tmp_path: Path, contents: str) -> Path:
    path = tmp_path / "goals.md"
    path.write_text(contents)
    return path


_VALID = """# Goals

## 1. Run more
Run 3 times a week, 5km per session.

## 2. Read daily
30 minutes of reading every evening.

## 3. Meditate
10 minutes each morning.
"""


def test_load_goals_returns_three_goals_with_titles_and_descriptions(tmp_path):
    path = _write_goals(tmp_path, _VALID)

    goals = load_goals(path)

    assert len(goals) == 3
    assert goals[0] == Goal(
        index=1,
        title="Run more",
        description="Run 3 times a week, 5km per session.",
    )
    assert goals[1].index == 2
    assert goals[1].title == "Read daily"
    assert goals[1].description == "30 minutes of reading every evening."
    assert goals[2].index == 3
    assert goals[2].title == "Meditate"
    assert goals[2].description == "10 minutes each morning."


def test_load_goals_supports_multiline_descriptions(tmp_path):
    path = _write_goals(
        tmp_path,
        "# Goals\n\n"
        "## 1. A\nline1\nline2\n\n"
        "## 2. B\nbody\n\n"
        "## 3. C\nbody\n",
    )

    goals = load_goals(path)

    assert goals[0].description == "line1\nline2"


def test_load_goals_raises_on_missing_file(tmp_path):
    missing = tmp_path / "nope.md"

    with pytest.raises(FileNotFoundError):
        load_goals(missing)


def test_load_goals_raises_when_fewer_than_three(tmp_path):
    path = _write_goals(
        tmp_path,
        "# Goals\n\n## 1. A\nbody\n\n## 2. B\nbody\n",
    )

    with pytest.raises(ValueError, match="found 2"):
        load_goals(path)


def test_load_goals_raises_when_more_than_three(tmp_path):
    path = _write_goals(
        tmp_path,
        "# Goals\n\n## 1. A\nx\n## 2. B\nx\n## 3. C\nx\n## 4. D\nx\n",
    )

    with pytest.raises(ValueError, match="found 4"):
        load_goals(path)


def test_load_goals_raises_when_indices_out_of_order(tmp_path):
    path = _write_goals(
        tmp_path,
        "# Goals\n\n## 2. A\nx\n## 1. B\nx\n## 3. C\nx\n",
    )

    with pytest.raises(ValueError, match="indices"):
        load_goals(path)


def test_load_goals_raises_when_h2_lacks_index(tmp_path):
    path = _write_goals(
        tmp_path,
        "# Goals\n\n## Plain heading\nx\n## 2. B\nx\n## 3. C\nx\n",
    )

    with pytest.raises(ValueError, match="found 2"):
        load_goals(path)


def test_goal_is_frozen(tmp_path):
    g = Goal(index=1, title="x", description="y")

    with pytest.raises(Exception):
        g.title = "other"  # type: ignore[misc]
