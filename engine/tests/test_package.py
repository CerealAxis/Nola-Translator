def test_engine_package_exposes_its_version() -> None:
    from nola_translator_engine import __version__

    assert __version__ == "0.1.0"
