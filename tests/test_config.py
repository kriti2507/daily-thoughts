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
        "DB_PATH=data/thoughts.db\n"
        "GOALS_PATH=goals.md\n"
        "HISTORY_DAYS=7\n"
        "LLM_PROVIDER=anthropic\n"
        "LLM_MODEL=claude-haiku-4-5-20251001\n"
        "ANTHROPIC_API_KEY=sk-test\n",
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
        "DB_PATH=data/x.db\n"
        "GOALS_PATH=goals.md\n"
        "HISTORY_DAYS=7\n"
        "LLM_PROVIDER=anthropic\n"
        "LLM_MODEL=claude-haiku-4-5-20251001\n"
        "ANTHROPIC_API_KEY=sk-test\n",
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
        "DB_PATH=data/x.db\n"
        "GOALS_PATH=goals.md\n"
        "HISTORY_DAYS=7\n"
        "LLM_PROVIDER=anthropic\n"
        "LLM_MODEL=claude-haiku-4-5-20251001\n"
        "ANTHROPIC_API_KEY=sk-test\n",
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
        "DB_PATH=data/x.db\n"
        "GOALS_PATH=goals.md\n"
        "HISTORY_DAYS=7\n"
        "LLM_PROVIDER=anthropic\n"
        "LLM_MODEL=claude-haiku-4-5-20251001\n"
        "ANTHROPIC_API_KEY=sk-test\n",
    )
    config = load_config(env_path)

    with pytest.raises(Exception):
        config.telegram_bot_token = "other"  # type: ignore[misc]


def test_load_config_includes_new_v2_fields(tmp_path):
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc\n"
        "TELEGRAM_CHAT_ID=1\n"
        "REPLY_TIMEOUT_SECONDS=60\n"
        "DB_PATH=data/x.db\n"
        "GOALS_PATH=goals.md\n"
        "HISTORY_DAYS=7\n"
        "LLM_PROVIDER=anthropic\n"
        "LLM_MODEL=claude-haiku-4-5-20251001\n"
        "ANTHROPIC_API_KEY=sk-test\n",
    )

    config = load_config(env_path)

    assert config.goals_path == Path("goals.md")
    assert config.history_days == 7
    assert config.llm_provider == "anthropic"
    assert config.llm_model == "claude-haiku-4-5-20251001"
    assert config.anthropic_api_key == "sk-test"


def test_load_config_history_days_must_be_int(tmp_path):
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc\n"
        "TELEGRAM_CHAT_ID=1\n"
        "REPLY_TIMEOUT_SECONDS=60\n"
        "DB_PATH=data/x.db\n"
        "GOALS_PATH=goals.md\n"
        "HISTORY_DAYS=lots\n"
        "LLM_PROVIDER=anthropic\n"
        "LLM_MODEL=claude-haiku-4-5-20251001\n"
        "ANTHROPIC_API_KEY=sk-test\n",
    )

    with pytest.raises(ValueError, match="HISTORY_DAYS"):
        load_config(env_path)


def test_load_config_anthropic_provider_requires_api_key(tmp_path):
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc\n"
        "TELEGRAM_CHAT_ID=1\n"
        "REPLY_TIMEOUT_SECONDS=60\n"
        "DB_PATH=data/x.db\n"
        "GOALS_PATH=goals.md\n"
        "HISTORY_DAYS=7\n"
        "LLM_PROVIDER=anthropic\n"
        "LLM_MODEL=claude-haiku-4-5-20251001\n"
        # ANTHROPIC_API_KEY missing
        ,
    )

    with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
        load_config(env_path)


def test_load_config_unknown_provider_is_accepted_at_load_time(tmp_path):
    # Provider validity beyond 'anthropic' is enforced later by make_llm_client.
    env_path = _write_env(
        tmp_path,
        "TELEGRAM_BOT_TOKEN=abc\n"
        "TELEGRAM_CHAT_ID=1\n"
        "REPLY_TIMEOUT_SECONDS=60\n"
        "DB_PATH=data/x.db\n"
        "GOALS_PATH=goals.md\n"
        "HISTORY_DAYS=7\n"
        "LLM_PROVIDER=local\n"
        "LLM_MODEL=llama-3-8b\n"
        ,
    )

    config = load_config(env_path)

    assert config.llm_provider == "local"
    assert config.anthropic_api_key is None
