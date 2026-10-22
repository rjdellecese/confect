import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(import.meta.url);
const shutdownMs = 5_000;
const sampleMs = 250;
const cleanupMs = 600;
const maxBytes = 32 * 1024 * 1024;
const maxFrameBytes = 1024 * 1024;
const fail = (tag, details = {}) => {
  throw { tag, ...details };
};

function ownedPid(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid)
    fail("InvalidOwnedPid");
  return pid;
}

function records(directory) {
  const path = join(directory, "events.ndjson");
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  if (text.length > 16_384) fail("EventOutputLimit");
  return text.split("\n").filter(Boolean).map(JSON.parse);
}

function synthetic(role, directory) {
  const record = (event, details = {}) =>
    appendFileSync(
      join(directory, "events.ndjson"),
      `${JSON.stringify({ event, role, pid: process.pid, ppid: process.ppid, at: Date.now(), ...details })}\n`,
    );
  let stopping = false;
  const keepAlive = setInterval(() => {
    if (existsSync(join(directory, "emergency-stop"))) {
      record("emergency-stop");
      process.exitCode = 2;
      clearInterval(keepAlive);
    }
  }, 100);
  const watchdog = setTimeout(() => {
    record("watchdog");
    process.exitCode = 3;
    clearInterval(keepAlive);
  }, 75_000);
  watchdog.unref();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      record("signal", { signal });
      if (stopping) return;
      stopping = true;
      setTimeout(() => {
        record("cleanup-complete");
        clearInterval(keepAlive);
      }, cleanupMs);
    });
  }
  process.on("exit", (code) => record("exit", { code }));
  if (role === "leader") {
    const child = spawn(
      process.execPath,
      [entry, "--child", "descendant", directory],
      {
        stdio: "ignore",
      },
    );
    child.on("error", () => {
      record("spawn-error");
      process.exitCode = 4;
      clearInterval(keepAlive);
    });
    child.unref();
  }
  record("ready");
}

function classify(events, identities, survivors, deadline) {
  const clean = identities.map(({ pid }) => {
    const own = events.filter((event) => event.pid === pid);
    const signal = own.find((event) => event.event === "signal");
    const cleanup = own.find((event) => event.event === "cleanup-complete");
    const exit = own.find((event) => event.event === "exit");
    return Boolean(
      signal &&
      cleanup &&
      exit?.code === 0 &&
      cleanup.at - signal.at >= cleanupMs &&
      exit.at >= cleanup.at &&
      exit.at <= deadline &&
      !own.some((event) =>
        ["emergency-stop", "watchdog", "spawn-error"].includes(event.event),
      ),
    );
  });
  if (survivors.length > 0) {
    return survivors.some((process) => process.pid === identities[0].pid)
      ? "leader-still-running"
      : "leader-only-exit";
  }
  return clean.every(Boolean)
    ? "complete-clean-owned-tree"
    : "exit-without-cleanup-proof";
}

const observerSource = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$clock = [Diagnostics.Stopwatch]::StartNew()
for ($seq = 0; $seq -lt 200; $seq++) {
  $start = $clock.Elapsed.TotalMilliseconds
  $rows = @(Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,CreationDate,Name,KernelModeTime,UserModeTime,WorkingSetSize | ForEach-Object {
    [ordered]@{
      pid = [int]$_.ProcessId
      ppid = [int]$_.ParentProcessId
      created = if ($null -ne $_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { $null }
      name = $_.Name
      cpuMs = ([double]$_.KernelModeTime + [double]$_.UserModeTime) / 10000
      rssBytes = [double]$_.WorkingSetSize
    }
  })
  if ($rows.Count -gt 4096) { throw 'ProcessRowLimit' }
  $frame = [ordered]@{
    seq = $seq
    startMs = $start
    durationMs = $clock.Elapsed.TotalMilliseconds - $start
    processes = $rows
  } | ConvertTo-Json -Depth 4 -Compress
  if ($frame.Length -gt 1048576) { throw 'FrameOutputLimit' }
  [Console]::WriteLine($frame)
  if (Test-Path -LiteralPath $args[0]) { break }
  $remaining = (($seq + 1) * 250) - $clock.Elapsed.TotalMilliseconds
  if ($remaining -gt 0) { Start-Sleep -Milliseconds ([int][Math]::Ceiling($remaining)) }
}
`;

async function until(predicate, timeoutMs, tag) {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= deadline) fail(tag);
    await delay(25);
  }
}

async function qualify(directory) {
  const result = {
    contract:
      "synthetic-only; no performance trials or comparison authorization",
    platform: process.platform,
    node: process.version,
    shutdownMs,
    sampleMs,
    cleanupMs,
    outcome: "incomplete",
  };
  const frames = [];
  let observer;
  let leader;
  let observerExit;
  let leaderExit;
  let observerFault;
  let bytes = 0;
  let buffer = "";
  const started = performance.now();
  const save = () =>
    writeFileSync(
      join(directory, "result.json"),
      JSON.stringify(result, null, 2),
    );
  save();
  const emergency = () => {
    writeFileSync(join(directory, "emergency-stop"), "");
    writeFileSync(join(directory, "observer-stop"), "");
  };
  const watchdog = setTimeout(() => {
    result.failure = { tag: "RunnerDeadline" };
    emergency();
    save();
    process.exitCode = 1;
    observer?.kill();
  }, 90_000);
  try {
    if (process.platform !== "win32") fail("WindowsRequired");
    const spawnedAt = Date.now();
    leader = spawn(process.execPath, [entry, "--child", "leader", directory], {
      stdio: "ignore",
      detached: true,
    });
    leader.on("error", (error) => {
      observerFault = { tag: "LeaderSpawn", code: error.code };
    });
    leader.on("exit", (code, signal) => {
      leaderExit = { code, signal };
    });
    ownedPid(leader.pid);
    writeFileSync(join(directory, "observer.ps1"), observerSource);
    observer = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        join(directory, "observer.ps1"),
        join(directory, "observer-stop"),
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    observer.on("error", (error) => {
      observerFault = { tag: "ObserverSpawn", code: error.code };
    });
    observer.on("exit", (code, signal) => {
      observerExit = { code, signal };
    });
    ownedPid(observer.pid);
    observer.stdout.setEncoding("utf8");
    observer.stdout.on("data", (text) => {
      try {
        bytes += Buffer.byteLength(text);
        if (bytes > maxBytes) fail("ObserverOutputLimit");
        buffer += text;
        let newline;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          if (newline > maxFrameBytes || frames.length >= 200)
            fail("ObserverFrameLimit");
          const line = buffer.slice(0, newline).trim();
          if (Buffer.byteLength(line) > maxFrameBytes)
            fail("ObserverFrameLimit");
          buffer = buffer.slice(newline + 1);
          const frame = JSON.parse(line);
          if (
            frame.seq !== frames.length ||
            !Number.isFinite(frame.startMs) ||
            !Number.isFinite(frame.durationMs) ||
            frame.durationMs < 0 ||
            !Array.isArray(frame.processes) ||
            frame.processes.length > 4096 ||
            frame.processes.some(
              (row) =>
                !Number.isSafeInteger(row.pid) ||
                row.pid < 0 ||
                !Number.isSafeInteger(row.ppid) ||
                row.ppid < 0 ||
                (row.created !== null &&
                  (typeof row.created !== "string" ||
                    !Number.isFinite(Date.parse(row.created)))) ||
                !Number.isFinite(row.cpuMs) ||
                row.cpuMs < 0 ||
                !Number.isFinite(row.rssBytes) ||
                row.rssBytes < 0,
            )
          )
            fail("ObserverFrameShape");
          frames.push({ ...frame, receivedMs: performance.now() - started });
          appendFileSync(
            join(directory, "samples.ndjson"),
            `${JSON.stringify(frames.at(-1))}\n`,
          );
        }
        if (buffer.length > maxFrameBytes) fail("ObserverFrameLimit");
      } catch (error) {
        observerFault = error?.tag ? error : { tag: "ObserverDecode" };
        observer.kill();
      }
    });
    observer.stderr.on("data", (text) => {
      bytes += text.length;
      if (bytes <= maxBytes)
        appendFileSync(join(directory, "observer-stderr.txt"), text);
      observerFault = { tag: "ObserverStderr" };
      observer.kill();
    });
    const healthy = () => {
      if (observerFault) throw observerFault;
      if (observerExit) fail("ObserverExitedEarly", observerExit);
    };
    let identities;
    await until(
      () => {
        healthy();
        const ready = records(directory).filter(
          (event) => event.event === "ready",
        );
        const parent = ready.find((event) => event.role === "leader");
        const child = ready.find((event) => event.role === "descendant");
        if (
          !parent ||
          !child ||
          parent.pid !== leader.pid ||
          child.ppid !== parent.pid
        )
          return false;
        ownedPid(parent.pid);
        ownedPid(child.pid);
        const latest = frames.at(-1)?.processes ?? [];
        identities = [parent, child].map((event) =>
          latest.find((row) => row.pid === event.pid),
        );
        return (
          identities.every(
            (identity) =>
              identity && Date.parse(identity.created) >= spawnedAt - 1000,
          ) &&
          identities[0].ppid === process.pid &&
          identities[1].ppid === identities[0].pid
        );
      },
      10_000,
      "ReadyDeadline",
    );
    result.identities = identities;
    result.observerPid = observer.pid;
    await until(
      () => {
        healthy();
        return frames.at(-1).startMs - frames[0].startMs >= 30_000;
      },
      40_000,
      "ObservationDeadline",
    );
    ownedPid(leader.pid);
    if (performance.now() - started - frames.at(-1).receivedMs > sampleMs)
      fail("StaleRootObservation");
    if (
      leaderExit ||
      !frames
        .at(-1)
        .processes.some(
          (row) =>
            row.pid === leader.pid &&
            row.created === identities[0].created &&
            row.ppid === process.pid,
        )
    ) {
      fail("LostRootOwnership");
    }
    const invokedAt = Date.now();
    const invokedMono = performance.now();
    result.invokedAt = invokedAt;
    const taskkill = spawn("taskkill.exe", ["/PID", String(leader.pid), "/T"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    result.taskkill = { args: ["/PID", String(leader.pid), "/T"], output: "" };
    const capture = (text) => {
      if (Buffer.byteLength(result.taskkill.output) + text.length > 16_384) {
        observerFault = { tag: "TaskkillOutputLimit" };
        taskkill.kill();
      } else result.taskkill.output += text.toString();
    };
    taskkill.stdout.on("data", capture);
    taskkill.stderr.on("data", capture);
    taskkill.on("error", (error) => {
      result.taskkill.error = error.code;
    });
    taskkill.on("exit", (code, signal) => {
      result.taskkill.exit = { code, signal };
    });
    while (performance.now() - invokedMono < shutdownMs) await delay(10);
    const deadlineMono = invokedMono - started + shutdownMs;
    const deadlineFrames = frames.filter(
      (frame) => frame.receivedMs <= deadlineMono,
    );
    const last = deadlineFrames.at(-1);
    const matches = (row, identity) =>
      row.pid === identity.pid && row.created === identity.created;
    const survivors = identities.filter((identity) =>
      last.processes.some((row) => matches(row, identity)),
    );
    result.deadlineSnapshotAgeMs = deadlineMono - last.receivedMs;
    result.survivors = survivors;
    result.events = records(directory);
    result.leaderExit = leaderExit;
    result.shutdown = classify(
      result.events,
      identities,
      survivors,
      invokedAt + shutdownMs,
    );
    if (!result.taskkill.exit) {
      result.taskkill.deadlineExceeded = true;
      taskkill.kill();
    }
    healthy();
    result.outcome = "observed";
  } catch (error) {
    result.failure = error?.tag
      ? error
      : { tag: "ProbeException", code: error?.code ?? null };
  } finally {
    emergency();
    try {
      await until(
        () => observerExit || !observer?.pid,
        5_000,
        "ObserverStopDeadline",
      );
    } catch (error) {
      result.failure ??= error;
      observer?.kill();
    }
    clearTimeout(watchdog);
    result.observerExit = observerExit;
    result.observerFault = observerFault;
    result.sampleCount = frames.length;
    result.observerOutputBytes = bytes;
    const gaps = frames
      .slice(1)
      .map((frame, i) => frame.startMs - frames[i].startMs);
    const arrivalGaps = frames
      .slice(1)
      .map((frame, i) => frame.receivedMs - frames[i].receivedMs);
    result.cadence = {
      spanMs: frames.length ? frames.at(-1).startMs - frames[0].startMs : 0,
      maxQueryMs: Math.max(0, ...frames.map((frame) => frame.durationMs)),
      maxStartGapMs: Math.max(0, ...gaps),
      maxArrivalGapMs: Math.max(0, ...arrivalGaps),
      overlapCount: frames
        .slice(1)
        .filter(
          (frame, i) =>
            frame.startMs < frames[i].startMs + frames[i].durationMs,
        ).length,
      missed250msSlots: gaps.filter((gap) => gap > sampleMs).length,
    };
    result.resourcePeaks = (result.identities ?? [])
      .concat(
        frames
          .flatMap((frame) =>
            frame.processes.filter((row) => row.pid === observer?.pid),
          )
          .slice(0, 1),
      )
      .map((identity) => {
        const samples = frames.flatMap((frame) =>
          frame.processes.filter(
            (row) =>
              row.pid === identity.pid && row.created === identity.created,
          ),
        );
        return {
          identity,
          maxRssBytes: Math.max(0, ...samples.map((row) => row.rssBytes)),
        };
      });
    result.unexpectedDescendants = frames
      .flatMap((frame) =>
        frame.processes.filter(
          (row) =>
            (result.identities ?? []).some(
              (identity) =>
                row.ppid === identity.pid &&
                (row.created === null ||
                  Date.parse(row.created) >= Date.parse(identity.created)),
            ) &&
            !(result.identities ?? []).some(
              (identity) =>
                row.pid === identity.pid && row.created === identity.created,
            ),
        ),
      )
      .map((row) => ({ pid: row.pid, ppid: row.ppid, created: row.created }));
    result.shutdownEvidencePassed =
      result.shutdown === "complete-clean-owned-tree" &&
      result.unexpectedDescendants.length === 0 &&
      result.deadlineSnapshotAgeMs <= sampleMs &&
      !result.taskkill?.deadlineExceeded &&
      result.taskkill?.exit?.code === 0 &&
      result.leaderExit?.code === 0;
    result.observerEvidencePassed =
      !result.failure &&
      !observerFault &&
      observerExit?.code === 0 &&
      buffer.trim() === "" &&
      result.cadence.spanMs >= 30_000 &&
      result.cadence.overlapCount === 0 &&
      result.cadence.maxQueryMs <= sampleMs &&
      result.cadence.maxStartGapMs <= sampleMs &&
      result.cadence.maxArrivalGapMs <= sampleMs;
    result.comparisonAuthorized = false;
    save();
    console.log(
      JSON.stringify({
        shutdown: result.shutdown,
        observerEvidencePassed: result.observerEvidencePassed,
        comparisonAuthorized: false,
      }),
    );
    process.exitCode =
      result.shutdownEvidencePassed && result.observerEvidencePassed ? 0 : 1;
  }
}

function selfTest() {
  const identities = [{ pid: 10 }, { pid: 20 }];
  const events = identities.flatMap(({ pid }) => [
    { pid, event: "signal", at: 100 },
    { pid, event: "cleanup-complete", at: 700 },
    { pid, event: "exit", at: 701, code: 0 },
  ]);
  assert.equal(
    classify(events, identities, [], 5_000),
    "complete-clean-owned-tree",
  );
  assert.equal(
    classify([], identities, [], 5_000),
    "exit-without-cleanup-proof",
  );
  assert.equal(
    classify(events, identities, [identities[1]], 5_000),
    "leader-only-exit",
  );
  assert.equal(
    classify(events, identities, identities, 5_000),
    "leader-still-running",
  );
  assert.equal(
    classify(events, identities, [], 700),
    "exit-without-cleanup-proof",
  );
  assert.equal(
    classify(
      events.filter((event) => event.event !== "signal"),
      identities,
      [],
      5_000,
    ),
    "exit-without-cleanup-proof",
  );
  for (const pid of [undefined, 0, -1, NaN, Infinity, 1.5, process.pid]) {
    assert.throws(
      () => ownedPid(pid),
      (error) => error.tag === "InvalidOwnedPid",
    );
  }
  console.log(
    "Six classifier and seven PID safety assertions passed; no Windows APIs were exercised.",
  );
}

if (process.argv[2] === "--child") synthetic(process.argv[3], process.argv[4]);
else if (process.argv[2] === "--self-test") selfTest();
else {
  const directory = resolve(process.argv[2] ?? "windows-qualification-result");
  mkdirSync(directory, { recursive: true });
  if (readdirSync(directory).length !== 0) {
    fail("FreshResultDirectoryRequired");
  }
  await qualify(directory);
}
