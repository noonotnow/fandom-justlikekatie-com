"""Fetch only the two web templates from the official release using HTTP ranges."""
import io
from pathlib import Path
import struct
from urllib.request import Request, urlopen
from zipfile import ZipFile, ZIP_DEFLATED
import zlib

URL = "https://github.com/godotengine/godot/releases/download/4.4.1-stable/Godot_v4.4.1-stable_export_templates.tpz"
TARGET = Path("generated-artifacts/godot-tool-cache/godot/export_templates/4.4.1.stable")

class RemoteArchive(io.RawIOBase):
    def __init__(self):
        with urlopen(Request(URL, method="HEAD"), timeout=30) as response:
            self.url = response.url
            self.size = int(response.headers["Content-Length"])
        self.position = 0

    def seek(self, offset, whence=0):
        self.position = offset if whence == 0 else (self.position if whence == 1 else self.size) + offset
        return self.position

    def tell(self):
        return self.position

    def read(self, count=-1):
        count = min(count if count >= 0 else self.size-self.position, self.size-self.position)
        if count <= 0:
            return b""
        request = Request(self.url, headers={"Range": f"bytes={self.position}-{self.position+count-1}"})
        with urlopen(request, timeout=60) as response:
            if response.status != 206:
                raise RuntimeError("Release server did not honor the byte range; refusing a full archive download.")
            data = response.read()
        self.position += len(data)
        return data

remote = RemoteArchive()
with ZipFile(remote) as archive:
    for name in ["web_nothreads_debug.zip", "web_nothreads_release.zip"]:
        entry = archive.getinfo("templates/" + name)
        remote.seek(entry.header_offset)
        header = struct.unpack("<4s5H3I2H", remote.read(30))
        remote.seek(entry.header_offset + 30 + header[-2] + header[-1])
        data = remote.read(entry.compress_size)
        if entry.compress_type == ZIP_DEFLATED:
            data = zlib.decompress(data, -15)
        if len(data) != entry.file_size or zlib.crc32(data) != entry.CRC:
            raise RuntimeError(f"Integrity check failed for {name}")
        TARGET.mkdir(parents=True, exist_ok=True)
        (TARGET / name).write_bytes(data)
        print(f"Cached official template: {name}")
