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


import requests

from src.telegram import poll_for_reply, Reply


def _updates_response(updates: list) -> MagicMock:
    return _mock_response({"ok": True, "result": updates})


def _make_update(update_id: int, text: str, reply_to_message_id: int | None,
                 date: int = 1_715_000_000, chat_id: int = 42):
    msg = {
        "message_id": update_id + 1000,
        "date": date,
        "chat": {"id": chat_id, "type": "private"},
        "text": text,
    }
    if reply_to_message_id is not None:
        msg["reply_to_message"] = {"message_id": reply_to_message_id}
    return {"update_id": update_id, "message": msg}


def test_poll_for_reply_drains_then_returns_matching_reply():
    # First call: drain — returns one pending update (ignored).
    # Second call: empty.
    # Third call: a non-matching message (ignored).
    # Fourth call: the matching reply.
    drain = _updates_response([_make_update(100, "old chatter", None)])
    empty = _updates_response([])
    non_match = _updates_response([_make_update(101, "random", None)])
    match = _updates_response([_make_update(102, "my reply", reply_to_message_id=555)])

    with patch("src.telegram.requests.get",
               side_effect=[drain, empty, non_match, match]) as mock_get:
        reply = poll_for_reply(
            bot_token="TOKEN",
            reply_to_message_id=555,
            timeout_seconds=60,
        )

    assert isinstance(reply, Reply)
    assert reply.text == "my reply"
    # received_at is ISO-8601 UTC string
    assert reply.received_at.endswith("+00:00") or reply.received_at.endswith("Z")
    # First call should be the drain with offset=-1
    drain_url = mock_get.call_args_list[0].args[0]
    drain_params = mock_get.call_args_list[0].kwargs["params"]
    assert drain_url == "https://api.telegram.org/botTOKEN/getUpdates"
    assert drain_params["offset"] == -1


def test_poll_for_reply_returns_none_on_timeout(monkeypatch):
    # Force the loop's time check to advance past timeout after the drain.
    times = iter([1000.0, 1000.0, 9999.0, 9999.0])
    monkeypatch.setattr("src.telegram.time.monotonic", lambda: next(times))

    drain = _updates_response([])
    empty = _updates_response([])

    with patch("src.telegram.requests.get", side_effect=[drain, empty]):
        reply = poll_for_reply(
            bot_token="TOKEN",
            reply_to_message_id=555,
            timeout_seconds=60,
        )

    assert reply is None


def test_poll_for_reply_ignores_non_reply_messages():
    drain = _updates_response([])
    # An update that has no reply_to_message at all — must be ignored.
    chatter = _updates_response([_make_update(200, "hi", None)])
    match = _updates_response([_make_update(201, "actual reply", reply_to_message_id=777)])

    with patch("src.telegram.requests.get", side_effect=[drain, chatter, match]):
        reply = poll_for_reply(
            bot_token="TOKEN",
            reply_to_message_id=777,
            timeout_seconds=60,
        )

    assert reply is not None
    assert reply.text == "actual reply"


def test_poll_for_reply_advances_offset_between_calls():
    drain = _updates_response([])
    batch_a = _updates_response([
        _make_update(300, "x", None),
        _make_update(301, "y", None),
    ])
    batch_b = _updates_response([
        _make_update(302, "match", reply_to_message_id=99),
    ])

    with patch("src.telegram.requests.get",
               side_effect=[drain, batch_a, batch_b]) as mock_get:
        poll_for_reply(
            bot_token="TOKEN",
            reply_to_message_id=99,
            timeout_seconds=60,
        )

    # Call 2's offset should be > drain (drain offset was -1, no updates seen yet,
    # so call 2 offset is 0 or unspecified). After batch_a (update_ids 300, 301),
    # call 3 should use offset = 302.
    third_call_params = mock_get.call_args_list[2].kwargs["params"]
    assert third_call_params["offset"] == 302


def test_poll_for_reply_retries_transient_network_error(monkeypatch):
    # Simulate one network failure, then success.
    drain = _updates_response([])
    match = _updates_response([_make_update(400, "ok", reply_to_message_id=1)])

    call_log = []

    def fake_get(url, params=None, timeout=None):
        call_log.append(params)
        if len(call_log) == 2:
            raise requests.ConnectionError("transient")
        if len(call_log) == 1:
            return drain
        return match

    # Patch sleep so retry backoff doesn't slow the test.
    monkeypatch.setattr("src.telegram.time.sleep", lambda _s: None)
    monkeypatch.setattr("src.telegram.requests.get", fake_get)

    reply = poll_for_reply(
        bot_token="TOKEN",
        reply_to_message_id=1,
        timeout_seconds=60,
    )
    assert reply is not None
    assert reply.text == "ok"
