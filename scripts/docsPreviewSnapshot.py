"""Stage one commit's Mintlify site and fingerprint its rendered inputs."""

import argparse
import hashlib
import io
import re
import shutil
import stat
import subprocess
import tarfile
import tempfile
from pathlib import Path

WORKSPACE_FILES = ("README.md", "CHANGELOG.md", "package.json")
SOURCE_PAGE = Path("api/reference/source.mdx")
DEFINED_IN = (
    rb"^(?P<prefix>Defined in: \[(?P<path>packages/[\w./-]+):(?P<line>[1-9][0-9]*)\]"
    rb"\(https://github\.com/rjdellecese/confect/blob/)%s(?P<suffix>/(?P=path)#L(?P=line)\))$"
)


def comparison_bytes(path, data, revision):
    if (
        not revision
        or not path.is_relative_to("api/reference")
        or path.suffix != ".mdx"
    ):
        return data
    sha = revision.encode("ascii")
    if path == SOURCE_PAGE:
        link = (
            b"[`"
            + sha
            + b"`](https://github.com/rjdellecese/confect/tree/"
            + sha
            + b")"
        )
        sentence = (
            b"This reference was generated from " + link + b", not from installed "
            b"package releases. A checkout can include changes not yet published to npm."
        )
        return re.sub(
            b"^" + re.escape(sentence) + b"$",
            sentence.replace(sha, b"@revision@"),
            data,
            flags=re.MULTILINE,
        )

    return re.sub(
        DEFINED_IN % sha, rb"\g<prefix>@revision@\g<suffix>", data, flags=re.MULTILINE
    )


def archive_docs(revision, site):
    tree = f"{revision}:apps/docs"
    entries = subprocess.check_output(["git", "ls-tree", "-rz", tree])
    for entry in entries.rstrip(b"\0").split(b"\0"):
        meta, _, path = entry.partition(b"\t")
        if meta.split(b" ", 1)[0] not in (b"100644", b"100755"):
            raise ValueError("Tracked documentation must contain only regular files")
        if any(
            part.startswith(b".env") or part == b".npmrc"
            for part in path.lower().split(b"/")
        ):
            raise ValueError("Credential files do not belong in a docs preview")
    archive = subprocess.check_output(["git", "archive", "--format=tar", tree])
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(site, filter="data")
    for name in WORKSPACE_FILES:
        (site / name).unlink(missing_ok=True)


def write_artifact(site, artifact, revision, include_site):
    artifact.mkdir()
    digest = hashlib.sha256()
    for path in sorted(site.rglob("*")):
        if path.name.casefold().startswith(".env") or path.name.casefold() in {
            ".git",
            ".npmrc",
        }:
            raise ValueError(f"Unsafe documentation entry: {path}")
        mode = path.lstat().st_mode
        if stat.S_ISDIR(mode):
            continue
        if not stat.S_ISREG(mode):
            raise ValueError(f"Documentation must contain only regular files: {path}")
        relative = path.relative_to(site)
        name = relative.as_posix().encode("utf-8")
        digest.update(len(name).to_bytes(8, "big"))
        digest.update(name)
        digest.update(
            hashlib.sha256(
                comparison_bytes(relative, path.read_bytes(), revision)
            ).digest()
        )
    if include_site:
        shutil.copytree(site, artifact / "site")
    (artifact / "digest.txt").write_text(digest.hexdigest() + "\n", encoding="ascii")


def build(revision, side, artifact):
    if (
        not re.fullmatch("[0-9a-f]{40}", revision)
        or subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
        != revision
    ):
        raise ValueError("Expected the exact selected source commit")
    subprocess.run(["git", "diff", "--quiet", "HEAD", "--"], check=True)
    generated = Path("scripts/docsApi.ts").is_file()
    with tempfile.TemporaryDirectory() as temp:
        site = Path(temp)
        archive_docs(revision, site)
        if generated:
            subprocess.run(["pnpm", "docs:api", "--check", "--out", site], check=True)
        if not (site / "docs.json").is_file():
            raise ValueError("Missing docs.json")
        write_artifact(site, artifact, revision if generated else None, side == "head")
        if side == "head":
            mintlify = Path("apps/docs/node_modules/.bin/mintlify").absolute()
            for command in ("validate", "broken-links"):
                subprocess.run([mintlify, command], cwd=site, check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("revision")
    parser.add_argument("side", choices=("base", "head"))
    parser.add_argument("artifact", type=Path)
    args = parser.parse_args()
    build(args.revision, args.side, args.artifact)
