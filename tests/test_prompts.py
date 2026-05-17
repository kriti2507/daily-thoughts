from src.prompts import generate_prompt


def test_generate_prompt_returns_non_empty_string():
    result = generate_prompt()
    assert isinstance(result, str)
    assert result.strip() != ""
