import contextlib
import io
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import publishDocsPreview as preview

SOURCE = "a" * 40
REPO = "owner/docs"
REF = "refs/heads/preview/pr-42"
URL = "https://docs-pr-42.mintlify.app"


class PublicationTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(contextlib.chdir(self.root))
        self.enterContext(
            patch.dict(
                os.environ,
                {
                    "GITHUB_REPOSITORY": REPO,
                    "MINTLIFY_PROJECT_ID": "test-project",
                    "MINTLIFY_API_KEY": "not-a-credential",
                },
            )
        )
        self.base, self.head = Path("base"), Path("head")
        self.base.mkdir()
        self.head.mkdir()
        (self.base / "digest.txt").write_text("0" * 64)
        self.snapshot("1")
        preview.git("init", "-b", "main")
        preview.git("init", "--bare", "remote.git")
        preview.git("remote", "add", "origin", str(self.root / "remote.git"))
        (self.root / "tracked").write_text("trusted\n")
        preview.git("add", "tracked")
        env = {
            "GIT_AUTHOR_NAME": "Tester",
            "GIT_AUTHOR_EMAIL": "test@example.com",
            "GIT_COMMITTER_NAME": "Tester",
            "GIT_COMMITTER_EMAIL": "test@example.com",
        }
        self.enterContext(patch.dict(os.environ, env))
        preview.git("commit", "-m", "trusted")
        preview.git("push", "origin", "HEAD:refs/heads/release")
        preview.git("config", "filter.block.required", "true")
        preview.git("config", "filter.block.clean", "false")
        (self.root / ".gitattributes").write_text("*.mdx filter=block\n")
        self.pr = {
            "state": "open",
            "head": {"sha": SOURCE, "ref": "source", "repo": {"full_name": REPO}},
            "base": {"ref": "main", "repo": {"full_name": REPO}},
        }
        self.comments = [
            {"id": 1, "user": {"id": 11, "type": "User"}, "body": preview.MARKER + "\nnot owned by the bot"}
        ]
        original = preview.command

        def run(*args, **kwargs):
            if args[0] != "gh":
                return original(*args, **kwargs)
            if args[-1] == f"repos/{REPO}/pulls/42":
                return json.dumps(self.pr).encode()
            if "--paginate" in args:
                self.assertIn(f"repos/{REPO}/issues/42/comments?per_page=100", args)
                return subprocess.check_output(
                    ["jq", "-r", args[-1]], input=json.dumps(self.comments).encode()
                )
            endpoint = args[4]
            body = json.loads(kwargs["data"])["body"]
            if args[3] == "POST":
                self.assertEqual(endpoint, f"repos/{REPO}/issues/42/comments")
                self.comments.append(
                    {"id": 2, "user": {"id": preview.GITHUB_ACTIONS_BOT_ID, "type": "Bot"}, "body": body}
                )
            else:
                self.assertEqual((args[3], endpoint), ("PATCH", f"repos/{REPO}/issues/comments/2"))
                self.comments[1]["body"] = body
            return b"{}"

        self.enterContext(patch.object(preview, "command", side_effect=run))
        self.mint = self.enterContext(patch.object(preview, "mintlify"))
        self.success()
        self.enterContext(contextlib.redirect_stdout(io.StringIO()))

    def snapshot(self, digit):
        (self.head / "digest.txt").write_text(digit * 64 + "\n")
        site = self.head / "site"
        (site / "api").mkdir(exist_ok=True, parents=True)
        (site / "docs.json").write_text("{}")
        (site / "api/café page.mdx").write_text(digit)

    def success(self):
        self.mint.side_effect = [{"previewUrl": URL, "statusId": "abc"}, {"status": "success"}]

    def publish(self):
        preview.publish(self.base, self.head, "42", SOURCE)

    def test_publish_retry_skip_and_revert(self):
        original = preview.git("rev-parse", "HEAD")
        self.snapshot("0")
        self.publish()
        self.assertIsNone(preview.remote_tip(REF))
        self.snapshot("1")
        self.mint.side_effect = [{"previewUrl": URL, "statusId": "abc"}, {"status": "failure"}]
        with self.assertRaisesRegex(preview.PreviewError, "did not succeed"):
            self.publish()
        tip = preview.remote_tip(REF)
        self.assertTrue(tip)
        self.assertEqual(len(self.comments), 1)

        self.success()
        self.publish()
        self.assertEqual(preview.remote_tip(REF), tip)
        self.assertEqual(
            self.mint.call_args_list[-2].args, ("preview/test-project", {"branch": "preview/pr-42"})
        )
        self.assertEqual(self.mint.call_args_list[-1].args, ("update-status/abc",))
        self.assertIn(URL, self.comments[1]["body"])
        self.assertIn(tip, self.comments[1]["body"])
        (self.head / "site/api/café page.mdx").write_text("other-revision")
        self.publish()
        self.assertEqual(self.mint.call_count, 4)

        self.success()
        self.snapshot("0")
        self.publish()
        new_tip = preview.remote_tip(REF)
        self.assertNotEqual(new_tip, tip)
        self.assertEqual(len(self.comments), 2)
        self.assertIn(new_tip, self.comments[1]["body"])
        self.assertEqual(preview.git("show", f"{new_tip}:apps/docs/api/café page.mdx"), b"0")
        self.assertEqual(
            preview.git("ls-tree", "-zr", "--name-only", new_tip).split(b"\0"),
            ["apps/docs/api/café page.mdx".encode(), b"apps/docs/docs.json", b""],
        )
        self.assertEqual(preview.git("rev-parse", "HEAD"), original)
        self.assertEqual(preview.git("ls-files"), b"tracked")
        self.assertEqual(preview.remote_tip("refs/heads/release"), original.decode())
        self.assertEqual(preview.git("ls-remote", "--refs", "origin").count(b"refs/heads/"), 2)

    def test_reject_ineligible_pr_before_push(self):
        for key, value in (
            ("state", "closed"),
            ("head", {"sha": "b" * 40, "repo": {"full_name": REPO}}),
            ("head", {"sha": SOURCE, "repo": {"full_name": "fork/docs"}}),
        ):
            with (
                self.subTest(key=key, value=value),
                patch.dict(self.pr, {key: value}),
                self.assertRaisesRegex(preview.PreviewError, "closed, from a fork"),
            ):
                self.publish()
        with (
            patch.dict(self.pr["head"], {"ref": "preview/pr-42"}),
            self.assertRaisesRegex(preview.PreviewError, "collides"),
        ):
            self.publish()
        self.assertIsNone(preview.remote_tip(REF))
        self.mint.assert_not_called()

    def test_unsafe_files_never_reach_remote(self):
        site = self.head / "site"
        for name in (".git", ".gitattributes", "node_modules", ".npmrc", "package.json", "..\\path"):
            with self.subTest(name=name):
                (site / name).touch()
                with self.assertRaises(preview.PreviewError):
                    self.publish()
                (site / name).unlink()
        link = site / "linked-folder"
        link.symlink_to(self.root)
        with self.assertRaisesRegex(preview.PreviewError, "linked"):
            self.publish()
        link.unlink()
        with (site / "large").open("wb") as stream:
            stream.truncate(17 * preview.MB)
        with self.assertRaisesRegex(preview.PreviewError, "oversized"):
            self.publish()
        self.assertIsNone(preview.remote_tip(REF))
        self.mint.assert_not_called()

    def test_missing_credentials_fail_before_branch_write(self):
        with patch.dict(os.environ, {"MINTLIFY_API_KEY": ""}), self.assertRaises(preview.PreviewError):
            self.publish()
        self.assertIsNone(preview.remote_tip(REF))

    def test_artifact_files_cannot_be_links(self):
        digest = self.head / "digest.txt"
        digest.unlink()
        digest.symlink_to((self.base / "digest.txt").absolute())
        with self.assertRaises(preview.PreviewError):
            preview.read_digest(self.head)
        digest.unlink()
        digest.hardlink_to(self.base / "digest.txt")
        with self.assertRaises(preview.PreviewError):
            preview.read_digest(self.head)

    def test_unsafe_url_or_status_id_is_not_published(self):
        for url, status_id in (
            ("https://docs.mintlify.app.example.com", "abc"),
            (URL + ")/unsafe", "abc"),
            ("https://bad@example.mintlify.app", "abc"),
            (URL, "../another-api"),
        ):
            self.mint.side_effect = [{"previewUrl": url, "statusId": status_id}]
            with self.subTest(url=url, status_id=status_id), self.assertRaises(preview.PreviewError):
                self.publish()
        self.assertEqual(len(self.comments), 1)


if __name__ == "__main__":
    unittest.main()
