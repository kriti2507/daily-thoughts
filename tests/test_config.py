from pathlib import Path
import pytest

from src.config import Config, load_config


def _write_env(tmp_path: Path, contents: str) -> Path:
    env_path = tmp_path / ".env"
    env_path.write_text(contents)
    return env_path


def test_load_config_returns_config_with_all_fields(tmp_path):
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc123\n"
        "TELEGRAM_CHAT_ID=42\n"
        "REPLY_TIMEOUT_SECONDS=120\n"
        "DB_PATH=data/thoughts.db\n",
    )

    config = load_config(env_path)

    assert isinstance(config, Config)
    assert config.telegram_bot_token == "abc123"
    assert config.telegram_chat_id == 42
    assert config.reply_timeout_seconds == 120
    assert config.db_path == Path("data/thoughts.db")


def test_load_config_supports_negative_chat_id(tmp_path):
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc\n"
        "TELEGRAM_CHAT_ID=-1001234567890\n"
        "REPLY_TIMEOUT_SECONDS=60\n"
        "DB_PATH=data/x.db\n",
    )

    config = load_config(env_path)

    assert config.telegram_chat_id == -1001234567890


def test_load_config_raises_on_missing_key(tmp_path):
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc\n"
        "TELEGRAM_CHAT_ID=1\n"
        # REPLY_TIMEOUT_SECONDS missing
        "DB_PATH=data/x.db\n",
    )

    with pytest.raises(ValueError, match="REPLY_TIMEOUT_SECONDS"):
        load_config(env_path)


def test_load_config_raises_on_unparseable_int(tmp_path):
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc\n"
        "TELEGRAM_CHAT_ID=not-a-number\n"
        "REPLY_TIMEOUT_SECONDS=60\n"
        "DB_PATH=data/x.db\n",
    )

    with pytest.raises(ValueError, match="TELEGRAM_CHAT_ID"):
        load_config(env_path)


def test_load_config_raises_on_missing_file(tmp_path):
    missing = tmp_path / "nope.env"

    with pytest.raises(FileNotFoundError):
        load_config(missing)


def test_config_is_frozen(tmp_path):
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc\n"
        "TELEGRAM_CHAT_ID=1\n"
        "REPLY_TIMEOUT_SECONDS=60\n"
        "DB_PATH=data/x.db\n",
    )
    config = load_config(env_path)

    with pytest.raises(Exception):
        config.telegram_bot_token = "other"  # type: ignore[misc]
