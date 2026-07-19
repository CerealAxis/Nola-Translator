"""Argos `.argosmodel` 语言包发现和按需安装。"""

from __future__ import annotations

from typing import Any


class ArgosPackageUnavailable(RuntimeError):
    pass


class ArgosPackageManager:
    def __init__(self, package_api: Any | None = None) -> None:
        if package_api is None:
            from argostranslate import package

            package_api = package
        self.api = package_api
        self.index_updated = False

    def ensure_path(
        self, source: str, target: str, *, allow_intermediate: bool = False
    ) -> tuple[str, ...]:
        if self._installed(source, target):
            return (source, target)
        self._update_index()
        if self._install_edge(source, target):
            return (source, target)
        if allow_intermediate and source != "en" and target != "en":
            first = self._installed(source, "en") or self._install_edge(source, "en")
            second = self._installed("en", target) or self._install_edge("en", target)
            if first and second:
                return (source, "en", target)
        raise ArgosPackageUnavailable(f"没有可安装的 Argos 路径：{source} -> {target}")

    def _update_index(self) -> None:
        if self.index_updated:
            return
        self.api.update_package_index()
        self.index_updated = True

    def _installed(self, source: str, target: str) -> bool:
        return any(
            item.from_code == source and item.to_code == target
            for item in self.api.get_installed_packages()
        )

    def _install_edge(self, source: str, target: str) -> bool:
        package = next(
            (
                item
                for item in self.api.get_available_packages()
                if item.from_code == source and item.to_code == target
            ),
            None,
        )
        if package is None:
            return False
        self.api.install_from_path(package.download())
        return True
