from pathlib import Path

import pytest

from fluentcaptions_engine.translation.packages import ArgosPackageManager, ArgosPackageUnavailable


class FakePackage:
    def __init__(self, source: str, target: str) -> None:
        self.from_code = source
        self.to_code = target

    def download(self) -> Path:
        return Path(f"{self.from_code}-{self.to_code}.argosmodel")


class FakePackageApi:
    def __init__(self, available: list[FakePackage]) -> None:
        self.available = available
        self.installed: list[FakePackage] = []
        self.updated = 0

    def update_package_index(self) -> None:
        self.updated += 1

    def get_available_packages(self) -> list[FakePackage]:
        return self.available

    def get_installed_packages(self) -> list[FakePackage]:
        return self.installed

    def install_from_path(self, path: Path) -> None:
        source, target = path.stem.split("-")
        self.installed.append(FakePackage(source, target))

    def uninstall(self, package: FakePackage) -> None:
        self.installed.remove(package)


def test_installs_direct_argos_package_once() -> None:
    api = FakePackageApi([FakePackage("en", "zh")])
    manager = ArgosPackageManager(api)
    assert manager.ensure_path("en", "zh") == ("en", "zh")
    assert manager.ensure_path("en", "zh") == ("en", "zh")
    assert len(api.installed) == 1


def test_installs_explicit_pivot_or_reports_missing_path() -> None:
    api = FakePackageApi([FakePackage("ja", "en"), FakePackage("en", "zh")])
    manager = ArgosPackageManager(api)
    assert manager.ensure_path("ja", "zh", allow_intermediate=True) == ("ja", "en", "zh")

    with pytest.raises(ArgosPackageUnavailable):
        ArgosPackageManager(FakePackageApi([])).ensure_path("ja", "zh", allow_intermediate=True)


def test_installed_path_never_refreshes_or_downloads() -> None:
    api = FakePackageApi([FakePackage("en", "zh")])
    manager = ArgosPackageManager(api)

    assert manager.installed_path("en", "zh") is None
    assert api.updated == 0
    assert api.installed == []


def test_explicit_install_and_remove_are_user_managed() -> None:
    api = FakePackageApi([FakePackage("en", "zh")])
    manager = ArgosPackageManager(api)

    manager.install("en", "zh")
    assert manager.installed_path("en", "zh") == ("en", "zh")
    manager.remove("en", "zh")
    assert manager.installed_path("en", "zh") is None
