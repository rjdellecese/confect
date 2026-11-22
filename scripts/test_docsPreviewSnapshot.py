import os
import subprocess
import tempfile
import unittest
from contextlib import chdir
from pathlib import Path

from docsPreviewSnapshot import archive_docs, comparison_bytes, write_artifact

BASE = "1" * 40
HEAD = "2" * 40
MODULE = Path("api/reference/core/FunctionSpec.mdx")
SOURCE = Path("api/reference/source.mdx")


def defined_in(sha, line=20):
    path = "packages/core/src/FunctionSpec.ts"
    return f"Defined in: [{path}:{line}](https://github.com/rjdellecese/confect/blob/{sha}/{path}#L{line})\n".encode()


def source(sha, version="10.6.0"):
    return (
        f"This reference was generated from [`{sha}`](https://github.com/rjdellecese/confect/tree/{sha}), "
        "not from installed package releases. A checkout can include changes not yet published to npm.\n\n"
        f"| @confect/core | {version} |\n"
    ).encode()


class SnapshotTests(unittest.TestCase):
    def test_only_generated_commit_fields_are_normalized(self):
        for path, generate in [(MODULE, defined_in), (SOURCE, source)]:
            self.assertEqual(
                comparison_bytes(path, generate(BASE), BASE),
                comparison_bytes(path, generate(HEAD), HEAD),
            )
            self.assertEqual(
                comparison_bytes(path, generate(BASE), HEAD), generate(BASE)
            )
            self.assertEqual(
                comparison_bytes(path, generate(BASE), None), generate(BASE)
            )
            self.assertEqual(
                comparison_bytes(Path("guides/api.mdx"), generate(BASE), BASE),
                generate(BASE),
            )

        for path, before, after in [
            (SOURCE, source(BASE), source(HEAD, "10.7.0")),
            (MODULE, defined_in(BASE), defined_in(HEAD, 21)),
            (MODULE, defined_in(BASE), defined_in(HEAD).replace(b"core", b"server")),
            (
                MODULE,
                defined_in(BASE) + BASE.encode(),
                defined_in(HEAD) + HEAD.encode(),
            ),
        ]:
            self.assertNotEqual(
                comparison_bytes(path, before, BASE),
                comparison_bytes(path, after, HEAD),
            )

        for authored in [
            b"An example: " + defined_in(HEAD),
            defined_in(HEAD).replace(b"#L20", b"#L21"),
            defined_in(HEAD).replace(b"github.com", b"example.org"),
            defined_in(HEAD).replace(b"core", b"server", 1),
        ]:
            self.assertEqual(comparison_bytes(MODULE, authored, HEAD), authored)

    def test_digest_tracks_paths_content_and_navigation_but_keeps_original_site(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            site = root / "staged"
            (site / MODULE.parent).mkdir(parents=True)
            (site / "docs.json").write_bytes(b"{}")
            (site / MODULE).write_bytes(defined_in(BASE))
            (site / ".asset").write_bytes(b"\x00\xff")
            write_artifact(site, root / "base", BASE, False)
            self.assertEqual(
                [p.name for p in (root / "base").iterdir()], ["digest.txt"]
            )

            (site / MODULE).write_bytes(defined_in(HEAD))
            write_artifact(site, root / "head", HEAD, True)
            digest = (root / "head/digest.txt").read_bytes()
            self.assertEqual(digest, (root / "base/digest.txt").read_bytes())
            self.assertRegex(digest, rb"^[a-f0-9]{64}\n$")
            self.assertEqual(
                (root / "head/site" / MODULE).read_bytes(), defined_in(HEAD)
            )
            self.assertEqual((root / "head/site/.asset").read_bytes(), b"\x00\xff")

            for index, name in enumerate(["docs.json", MODULE, ".asset"]):
                path = site / name
                before = path.read_bytes()
                path.write_bytes(before + b"!")
                artifact = root / f"changed-{index}"
                write_artifact(site, artifact, HEAD, False)
                self.assertNotEqual(digest, (artifact / "digest.txt").read_bytes())
                path.write_bytes(before)
            (site / ".asset").rename(site / "logo.svg")
            write_artifact(site, root / "renamed", HEAD, False)
            self.assertNotEqual(digest, (root / "renamed/digest.txt").read_bytes())

    def test_refuses_nonregular_files_and_git_entries(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name, create in [
                ("link", lambda path: path.symlink_to(root)),
                ("fifo", os.mkfifo),
                (".Git", Path.mkdir),
                (".npmrc", Path.touch),
            ]:
                with self.subTest(name=name):
                    site = root / f"site-{name}"
                    site.mkdir()
                    create(site / name)
                    with self.assertRaises(ValueError):
                        write_artifact(site, root / f"output-{name}", HEAD, True)

    def test_archives_only_tracked_site_inputs_and_rejects_tracked_links(self):
        with tempfile.TemporaryDirectory() as tmp, chdir(tmp):
            subprocess.run(["git", "init", "-q"], check=True)
            docs = Path("apps/docs")
            docs.mkdir(parents=True)
            for name in [
                "README.md",
                "CHANGELOG.md",
                "package.json",
                "docs.json",
                "guide.mdx",
            ]:
                (docs / name).write_text(name)
            subprocess.run(["git", "add", "apps/docs"], check=True)
            (docs / "untracked.mdx").touch()
            tree = subprocess.check_output(["git", "write-tree"], text=True).strip()
            archive_docs(tree, Path("snapshot"))
            self.assertEqual(
                sorted(p.name for p in Path("snapshot").iterdir()),
                ["docs.json", "guide.mdx"],
            )
            (docs / "link").symlink_to("guide.mdx")
            subprocess.run(["git", "add", "apps/docs/link"], check=True)
            tree = subprocess.check_output(["git", "write-tree"], text=True).strip()
            with self.assertRaisesRegex(ValueError, "regular files"):
                archive_docs(tree, Path("invalid"))


if __name__ == "__main__":
    unittest.main()
