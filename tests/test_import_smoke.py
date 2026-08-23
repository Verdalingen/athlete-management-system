"""Import every module under services/ and cli/.

Cheap insurance against the failure mode that has actually bitten this project: a missing
import inside a rarely-taken branch surfacing only on a live Garmin sync, one slow real run
per iteration. A NameError from an unimported symbol still needs the branch to execute, but
module-level import errors, circular imports and typos in `from x import y` all fall out
here in milliseconds.

Deliberately does not assert anything about behaviour — that belongs in the focused tests.
"""
import importlib
import pathlib

import pytest

ROOTS = ("services", "cli")
REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent


def module_names() -> list[str]:
    names = []
    for root in ROOTS:
        for path in sorted((REPO_ROOT / root).rglob("*.py")):
            if "__pycache__" in path.parts:
                continue
            rel = path.relative_to(REPO_ROOT).with_suffix("")
            names.append(".".join(rel.parts))
    return names


ALL_MODULES = module_names()


def test_module_discovery_found_something():
    # Guards against the glob silently matching nothing and the suite passing vacuously.
    assert len(ALL_MODULES) > 50


@pytest.mark.parametrize("module_name", ALL_MODULES)
def test_module_imports(module_name: str):
    importlib.import_module(module_name)
