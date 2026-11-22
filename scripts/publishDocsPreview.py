"""Publish a read-only build's docs snapshot without checking out its contents."""

import argparse
import http.client
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
import time
import unicodedata
from pathlib import Path

MARKER = "<!-- confect-docs-preview:v1 -->"
GITHUB_ACTIONS_BOT_ID = 41898282
MB = 1024 * 1024
DIGEST = r"[a-f0-9]{64}"
SHA = r"[a-f0-9]{40}"
PREVIEW_URL = r"https://[a-z0-9-]+\.mintlify\.(?:app|dev|site|io)(?:/[A-Za-z0-9/_-]*)?"


class PreviewError(Exception):
    pass


def command(*args, data=None, env=None):
    result = subprocess.run(args, input=data, capture_output=True, env=env, check=False)
    if result.returncode:
        raise PreviewError(f"{' '.join(args)} failed (exit {result.returncode})")
    return result.stdout


def git(*args, **kwargs):
    return command("git", "-c", "core.hooksPath=/dev/null", *args, **kwargs).strip()


def read_regular(path, limit):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > limit:
        raise PreviewError("Snapshot contains a non-regular, linked, or oversized file")
    return path.read_bytes()


def read_digest(directory):
    if not stat.S_ISDIR(directory.lstat().st_mode):
        raise PreviewError("Invalid artifact directory")
    text = read_regular(directory / "digest.txt", 65).decode("ascii").removesuffix("\n")
    if not re.fullmatch(DIGEST, text):
        raise PreviewError("Invalid semantic digest")
    return text


def snapshot_tree(head):
    site = head / "site"
    if not stat.S_ISDIR(site.lstat().st_mode):
        raise PreviewError("Invalid site directory")
    entries = bytearray()
    paths = set()
    total = 0
    pending = [site]
    while pending:
        for path in pending.pop().iterdir():
            relative = path.relative_to(site).as_posix()
            key = unicodedata.normalize("NFC", relative).casefold()
            name = path.name.casefold()
            if len(paths) >= 4096 or len(relative.encode()) > 512 or key in paths:
                raise PreviewError("Conflicting paths or snapshot size limit exceeded")
            if (
                not name.isprintable()
                or name.endswith((" ", "."))
                or "\\" in name
                or ":" in name
                or re.search(r"~[1-9]", name)
                or name.startswith((".git", ".env"))
                or name in {"node_modules", ".npmrc", "package.json"}
            ):
                raise PreviewError("Unsafe snapshot path")
            paths.add(key)
            if stat.S_ISDIR(path.lstat().st_mode):
                pending.append(path)
                continue
            data = read_regular(path, min(16 * MB, 64 * MB - total))
            total += len(data)
            oid = git("hash-object", "-w", "--stdin", "--no-filters", data=data)
            entries.extend(b"100644 " + oid + b"\tapps/docs/" + relative.encode() + b"\0")
    if not (site / "docs.json").is_file():
        raise PreviewError("Missing docs.json in preview snapshot")
    with tempfile.TemporaryDirectory() as scratch:
        env = dict(os.environ, GIT_INDEX_FILE=os.path.join(scratch, "index"))
        git("update-index", "-z", "--index-info", data=entries, env=env)
        return git("write-tree", env=env).decode()


def check_pr(repo, number, sha):
    pr = json.loads(command("gh", "api", f"repos/{repo}/pulls/{number}"))
    if not (
        pr["state"] == "open"
        and pr["head"]["sha"] == sha
        and (pr["head"]["repo"] or {}).get("full_name", "").lower() == repo.lower()
        and pr["base"]["repo"]["full_name"].lower() == repo.lower()
    ):
        raise PreviewError("PR is closed, from a fork, or no longer at the build SHA")
    if f"preview/pr-{number}" in (pr["base"]["ref"], pr["head"]["ref"]):
        raise PreviewError("Preview branch collides with this PR's source or target")


def preview_comment(repo, number):
    prefix = json.dumps(MARKER + "\n")
    query = (
        f'.[] | select(.user.id == {GITHUB_ACTIONS_BOT_ID} and .user.type == "Bot" and '
        f"(.body | startswith({prefix}))) | {{id,body}} | @json"
    )
    output = command(
        "gh", "api", "--paginate", f"repos/{repo}/issues/{number}/comments?per_page=100", "--jq", query
    )
    if output.strip():
        return json.loads(output.split(b"\n", 1)[0])
    return None


def remote_tip(ref):
    entry = git("ls-remote", "--refs", "origin", ref).decode()
    if not entry:
        return None
    tip, name = entry.split("\t")
    if name != ref or not re.fullmatch(SHA, tip):
        raise PreviewError("Invalid preview branch tip")
    return tip


def mintlify(endpoint, payload=None):
    connection = http.client.HTTPSConnection("api.mintlify.com", timeout=30)
    operation = "deployment status" if payload is None else "preview request"
    try:
        connection.request(
            "GET" if payload is None else "POST",
            "/v1/project/" + endpoint,
            body=None if payload is None else json.dumps(payload),
            headers={
                "Authorization": "Bearer " + os.environ["MINTLIFY_API_KEY"],
                "Content-Type": "application/json",
            },
        )
        response = connection.getresponse()
        if response.status != (200 if payload is None else 202):
            raise PreviewError(f"Mintlify {operation} returned HTTP {response.status}")
        body = response.read(4 * MB + 1)
        if len(body) > 4 * MB:
            raise PreviewError("Mintlify response exceeded size limit")
        result = json.loads(body)
        if not isinstance(result, dict):
            raise PreviewError(f"Invalid Mintlify {operation} response")
        return result
    except (OSError, ValueError, http.client.HTTPException) as error:
        raise PreviewError(f"Mintlify {operation} failed or returned invalid JSON") from error
    finally:
        connection.close()


def deploy(branch, project):
    response = mintlify("preview/" + project, {"branch": branch})
    url, status_id = response.get("previewUrl"), response.get("statusId")
    if not (
        isinstance(url, str)
        and re.fullmatch(PREVIEW_URL, url)
        and isinstance(status_id, str)
        and re.fullmatch(r"[a-zA-Z0-9_-]{1,128}", status_id)
    ):
        raise PreviewError("Invalid Mintlify preview response")
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        status = mintlify("update-status/" + status_id).get("status")
        if status == "success":
            return url
        if status not in ("queued", "in_progress"):
            raise PreviewError(f"Mintlify deployment {status_id} did not succeed")
        time.sleep(10)
    raise PreviewError(f"Timed out waiting for Mintlify deployment {status_id}")


def publish(base, head, number, sha):
    repo = os.environ["GITHUB_REPOSITORY"]
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
        raise PreviewError("Invalid GitHub repository")
    if not re.fullmatch(r"[1-9][0-9]*", number) or not re.fullmatch(SHA, sha):
        raise PreviewError("Invalid PR number or source SHA")
    check_pr(repo, number, sha)
    previous, digest = read_digest(base), read_digest(head)
    branch = "preview/pr-" + number
    ref = "refs/heads/" + branch
    tip = remote_tip(ref)
    comment = preview_comment(repo, number)
    if tip is None and comment is None and previous == digest:
        print("No rendered documentation changes.")
        return
    state = f"<!-- digest:{digest} snapshot:{tip} -->"
    if tip and comment and comment["body"].splitlines()[:2] == [MARKER, state]:
        print("This rendered snapshot already has a successful preview.")
        return

    project = os.environ.get("MINTLIFY_PROJECT_ID", "")
    key = os.environ.get("MINTLIFY_API_KEY", "")
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,128}", project) or not re.fullmatch(r"[!-~]+", key):
        raise PreviewError("Configure MINTLIFY_PROJECT_ID and MINTLIFY_API_KEY")
    tree = snapshot_tree(head)
    if tip:
        git("fetch", "--no-tags", "--no-recurse-submodules", "--depth=1", "origin", ref)
        if git("rev-parse", "FETCH_HEAD").decode() != tip:
            raise PreviewError("Preview branch changed during publication")
    if not tip or git("rev-parse", tip + "^{tree}").decode() != tree:
        commit = git(
            "-c",
            "user.name=github-actions[bot]",
            "-c",
            "user.email=41898282+github-actions[bot]@users.noreply.github.com",
            "commit-tree",
            tree,
            *(["-p", tip] if tip else []),
            "-m",
            f"Preview documentation from {sha}",
        ).decode()
        check_pr(repo, number, sha)
        git(
            "push", "--no-follow-tags", f"--force-with-lease={ref}:{tip or ''}", "origin", commit + ":" + ref
        )
        tip = commit
    check_pr(repo, number, sha)
    url = deploy(branch, project)
    check_pr(repo, number, sha)
    if remote_tip(ref) != tip:
        raise PreviewError("Preview branch changed during deployment")
    body = f"{MARKER}\n<!-- digest:{digest} snapshot:{tip} -->\n[View the documentation preview]({url})"
    if comment:
        if type(comment["id"]) is not int:
            raise PreviewError("Invalid GitHub comment ID")
        endpoint, method = f"issues/comments/{comment['id']}", "PATCH"
    else:
        endpoint, method = f"issues/{number}/comments", "POST"
    command(
        "gh",
        "api",
        "--method",
        method,
        f"repos/{repo}/{endpoint}",
        "--input",
        "-",
        data=json.dumps({"body": body}).encode(),
    )
    print("Published the documentation preview.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base", type=Path)
    parser.add_argument("head", type=Path)
    parser.add_argument("pr_number")
    parser.add_argument("source_sha")
    args = parser.parse_args()
    try:
        publish(args.base, args.head, args.pr_number, args.source_sha)
    except PreviewError as error:
        sys.exit(str(error))
    except (OSError, ValueError, TypeError, KeyError, http.client.HTTPException):
        sys.exit("Invalid preview input or network/IO failure")
