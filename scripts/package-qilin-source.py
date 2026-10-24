"""Publish an editable source archive, excluding caches and exported binaries."""
from pathlib import Path
import sys
import zipfile


def package(project: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
        for source in sorted(project.rglob("*")):
            relative = source.relative_to(project)
            if not source.is_file() or any(
                part.startswith(".") for part in relative.parts
            ) or source.suffix in {".pck", ".wasm", ".zip"}:
                continue
            archive.write(source, Path("Qilin-Keeper") / relative)


if __name__ == "__main__":
    package(Path(sys.argv[1]), Path(sys.argv[2]))
