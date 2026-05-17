from unittest.mock import patch, MagicMock

import pytest

from src.telegram import send_message


def _mock_response(payload: dict, status_code: int = 200) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = payload
    resp.raise_for_status = MagicMock()
    return resp


def test_send_message_posts_to_correct_url_and_returns_message_id():
    fake = _mock_response({"ok": True, "result": {"message_id": 1234}})

    with patch("src.telegram.requests.post", return_value=fake) as mock_post:
        msg_id = send_message(
            bot_token="TOKEN",
            chat_id=42,
            text="hello",
        )

    assert msg_id == 1234
    mock_post.assert_called_once()
    url = mock_post.call_args.args[0]
    assert url == "https://api.telegram.org/botTOKEN/sendMessage"
    json_payload = mock_post.call_args.kwargs["json"]
    assert json_payload == {"chat_id": 42, "text": "hello"}


def test_send_message_raises_on_http_error():
    fake = _mock_response({"ok": False, "description": "bad token"}, status_code=401)
    fake.raise_for_status.side_effect = Exception("401 Unauthorized")

    with patch("src.telegram.requests.post", return_value=fake):
        with pytest.raises(Exception, match="401 Unauthorized"):
            send_message(bot_token="BAD", chat_id=1, text="x")


def test_send_message_raises_on_api_not_ok():
    fake = _mock_response({"ok": False, "description": "chat not found"})

    with patch("src.telegram.requests.post", return_value=fake):
        with pytest.raises(RuntimeError, match="chat not found"):
            send_message(bot_token="TOKEN", chat_id=1, text="x")
