package main

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/evanw/esbuild/pkg/api"
)

type harness struct {
	t      *testing.T
	s      *service
	in     *io.PipeWriter
	events chan map[string]any
	done   chan error
	nextID uint64
}

type discardCloser struct{}

func (discardCloser) Write(b []byte) (int, error) { return len(b), nil }
func (discardCloser) Close() error                { return nil }

func TestDirectEntryKeepsExplicitJSExtension(t *testing.T) {
	root := fixture(t, `export default "typescript"`)
	writeFixture(t, root, "entry.js", `export default "javascript"`)
	h := newHarness(t)
	h.send("Hello", "esbuildVersion", engineVersion, "capabilities", capabilities)
	h.event("Hello")
	h.send("Create", "options", options{Root: root, Entries: []string{filepath.Join(root, "entry.js")}, Outdir: filepath.Join(root, "out"), Conditions: []string{}, TsconfigRaw: "{}"})
	h.event("Created")
	h.send("Rebuild", "buildId", 1, "epoch", 1)
	capture := h.capture()
	if capture["status"] != "Succeeded" {
		t.Fatal(capture)
	}
	sources := capture["sources"].([]any)
	if len(sources) != 1 || filepath.Base(sources[0].(map[string]any)["path"].(string)) != "entry.js" {
		t.Fatal("native entry probe selected wrong extension", sources)
	}
	h.finish()
}

func newHarness(t *testing.T) *harness {
	inReader, inWriter := io.Pipe()
	outReader, outWriter := io.Pipe()
	h := &harness{t: t, in: inWriter, events: make(chan map[string]any, 128), done: make(chan error, 1)}
	h.s = newService(inReader, outWriter, engineVersion)
	go func() { h.done <- h.s.run(); _ = outWriter.Close() }()
	go func() {
		defer close(h.events)
		for {
			b, err := readFrame(outReader)
			if err != nil {
				return
			}
			var message map[string]any
			if err := json.Unmarshal(b, &message); err != nil {
				return
			}
			h.events <- message
		}
	}()
	t.Cleanup(func() {
		_ = inWriter.Close()
		for range h.events {
		}
	})
	return h
}
func (h *harness) send(tag string, fields ...any) uint64 {
	h.t.Helper()
	h.nextID++
	if err := writeFrame(h.in, response(h.nextID, tag, fields...)); err != nil {
		h.t.Fatal(err)
	}
	return h.nextID
}
func (h *harness) event(tag string) map[string]any {
	h.t.Helper()
	m, ok := <-h.events
	if !ok {
		h.t.Fatal("service closed waiting for", tag)
	}
	if m["tag"] != tag {
		h.t.Fatalf("expected %s, got %#v", tag, m)
	}
	return m
}
func (h *harness) setup(root string) {
	h.send("Hello", "esbuildVersion", engineVersion, "capabilities", capabilities)
	h.event("Hello")
	h.send("Create", "options", options{Root: root, Entries: []string{filepath.Join(root, "entry.ts")}, Outdir: filepath.Join(root, "out"), Conditions: []string{"qualification"}, TsconfigRaw: "{}"})
	h.event("Created")
}
func (h *harness) answer(m map[string]any) {
	h.send("ResolveResult", "callbackId", m["callbackId"], "buildId", m["buildId"], "epoch", m["epoch"], "decision", map[string]any{"mode": "probe"})
}
func (h *harness) capture() map[string]any {
	h.t.Helper()
	for m := range h.events {
		if m["tag"] == "Resolve" {
			h.answer(m)
			continue
		}
		if m["tag"] == "Capture" {
			return m
		}
		h.t.Fatalf("unexpected event %#v", m)
	}
	h.t.Fatal("closed before capture")
	return nil
}
func (h *harness) finish() {
	h.send("Dispose")
	h.event("Disposed")
	_ = h.in.Close()
	if err := <-h.done; err != nil {
		h.t.Fatal(err)
	}
}
func fixture(t *testing.T, text string) string {
	t.Helper()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "entry.ts"), []byte(text), 0600); err != nil {
		t.Fatal(err)
	}
	return root
}
func writeFixture(t *testing.T, root, name, text string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(root, name), []byte(text), 0600); err != nil {
		t.Fatal(err)
	}
}

func TestRetainedCaptureAndPreferredCreation(t *testing.T) {
	root := fixture(t, `import { value } from "./choice"; export default [value,__filename,__dirname,import.meta.url]`)
	writeFixture(t, root, "choice.js", `export const value = "javascript"`)
	h := newHarness(t)
	h.setup(root)
	for i := 1; i <= 2; i++ {
		if i == 2 {
			writeFixture(t, root, "choice.ts", `export const value = "typescript"`)
		}
		h.send("Rebuild", "buildId", i, "epoch", i)
		capture := h.capture()
		if capture["status"] != "Succeeded" {
			t.Fatal(capture)
		}
		sources := capture["sources"].([]any)
		if len(sources) != 2 {
			t.Fatal(sources)
		}
		want := "choice.js"
		if i == 2 {
			want = "choice.ts"
		}
		found := false
		for _, raw := range sources {
			s := raw.(map[string]any)
			if filepath.Base(s["path"].(string)) == want {
				found = true
			}
			b, err := base64.StdEncoding.DecodeString(s["bytesBase64"].(string))
			if err != nil || digest(b) != s["sha256"] {
				t.Fatal("capture bytes mismatch")
			}
			if !strings.HasPrefix(string(b), "const __injected_filename__ = ") || s["resolveDir"] != "" {
				t.Fatal(s)
			}
			if s["originalSha256"] == s["sha256"] {
				t.Fatal("original provenance lost")
			}
		}
		if !found {
			t.Fatal("preferred candidate missing", sources)
		}
		if len(capture["outputs"].([]any)) != 2 {
			t.Fatal(capture["outputs"])
		}
	}
	h.finish()
}

func TestCancelWaitsForHostCallbackSettlement(t *testing.T) {
	h := newHarness(t)
	h.setup(fixture(t, `export default 1`))
	h.send("Rebuild", "buildId", 1, "epoch", 1)
	callback := h.event("Resolve")
	h.send("Cancel", "buildId", 1)
	cancel := h.event("CancelCallbacks")
	if len(cancel["callbackIds"].([]any)) != 1 {
		t.Fatal(cancel)
	}
	h.s.mu.Lock()
	if h.s.active == nil || len(h.s.pending) != 1 {
		t.Fatal("cancel did not retain active callback")
	}
	h.s.mu.Unlock()
	h.send("CallbackCancelled", "callbackId", callback["callbackId"], "buildId", 1, "epoch", 1)
	if capture := h.event("Capture"); capture["status"] != "Cancelled" {
		t.Fatal(capture)
	}
	h.event("Cancelled")
	h.send("Rebuild", "buildId", 2, "epoch", 2)
	if capture := h.capture(); capture["status"] != "Succeeded" {
		t.Fatal(capture)
	}
	h.finish()
}

func TestCancelLatestCompletedBuildAcknowledgesCompletionRace(t *testing.T) {
	h := newHarness(t)
	h.setup(fixture(t, `export default 1`))
	h.send("Rebuild", "buildId", 1, "epoch", 1)
	if capture := h.capture(); capture["status"] != "Succeeded" {
		t.Fatal(capture)
	}
	h.send("Cancel", "buildId", 1)
	h.event("Cancelled")
	h.send("Rebuild", "buildId", 2, "epoch", 2)
	if capture := h.capture(); capture["status"] != "Succeeded" {
		t.Fatal(capture)
	}
	h.send("Cancel", "buildId", 1)
	h.event("Rejected")
	h.send("Cancel", "buildId", 2)
	h.event("Cancelled")
	h.finish()
}

func TestDisposeSettlesCallbacksAndIsIdempotent(t *testing.T) {
	h := newHarness(t)
	h.setup(fixture(t, `export default 1`))
	h.send("Rebuild", "buildId", 1, "epoch", 1)
	callback := h.event("Resolve")
	h.send("Dispose")
	h.event("CancelCallbacks")
	h.send("Rebuild", "buildId", 2, "epoch", 2)
	h.event("Rejected")
	h.answer(callback)
	if capture := h.event("Capture"); capture["status"] != "Cancelled" {
		t.Fatal(capture)
	}
	h.event("Disposed")
	h.send("Dispose")
	result := h.event("Disposed")
	if result["disposeCount"] != float64(1) {
		t.Fatal(result)
	}
	_ = h.in.Close()
	if err := <-h.done; err != nil {
		t.Fatal(err)
	}
}

func TestHostLossReleasesCallbackAndDisposes(t *testing.T) {
	h := newHarness(t)
	h.setup(fixture(t, `export default 1`))
	h.send("Rebuild", "buildId", 1, "epoch", 1)
	h.event("Resolve")
	_ = h.in.Close()
	if err := <-h.done; err == nil {
		t.Fatal("host loss accepted")
	}
	<-h.s.ownedDisposed
	h.s.mu.Lock()
	defer h.s.mu.Unlock()
	if len(h.s.pending) != 0 || h.s.active != nil {
		t.Fatal("work survived host loss")
	}
}

func TestHostLossDuringDisposeIsNotCleanEOF(t *testing.T) {
	h := newHarness(t)
	h.setup(fixture(t, `export default 1`))
	h.send("Rebuild", "buildId", 1, "epoch", 1)
	h.event("Resolve")
	h.send("Dispose")
	h.event("CancelCallbacks")
	_ = h.in.Close()
	err := <-h.done
	boundary, ok := err.(*boundaryError)
	if !ok || boundary.Code != "HostLost" {
		t.Fatalf("premature disposal EOF was not HostLost: %v", err)
	}
	<-h.s.ownedDisposed
	h.s.mu.Lock()
	defer h.s.mu.Unlock()
	if len(h.s.pending) != 0 || h.s.active != nil {
		t.Fatal("work survived disconnect during disposal")
	}
}

func TestFailedCreateConsumesOnlyCreationAttempt(t *testing.T) {
	h := newHarness(t)
	h.send("Hello", "esbuildVersion", engineVersion, "capabilities", capabilities)
	h.event("Hello")
	root := fixture(t, `export default 1`)
	o := options{Root: root, Entries: []string{filepath.Join(root, "entry.ts")}, Outdir: filepath.Join(root, "out"), Conditions: []string{}, TsconfigRaw: ""}
	h.send("Create", "options", o)
	if rejected := h.event("Rejected"); rejected["code"] != "Options" {
		t.Fatal(rejected)
	}
	o.TsconfigRaw = "{}"
	h.send("Create", "options", o)
	if rejected := h.event("Rejected"); rejected["code"] != "ContextState" {
		t.Fatal(rejected)
	}
	h.send("Rebuild", "buildId", 1, "epoch", 1)
	h.event("Rejected")
	_ = h.in.Close()
	if err := <-h.done; err == nil {
		t.Fatal("failed context unexpectedly disposed")
	}
}

func TestProtocolViolationsCloseSession(t *testing.T) {
	for _, violation := range []string{"duplicate-id", "unknown-callback", "wrong-epoch", "truncated", "malformed", "build-order"} {
		t.Run(violation, func(t *testing.T) {
			h := newHarness(t)
			h.setup(fixture(t, `export default 1`))
			switch violation {
			case "duplicate-id":
				if err := writeFrame(h.in, response(h.nextID, "Dispose")); err != nil {
					t.Fatal(err)
				}
			case "unknown-callback":
				h.send("ResolveResult", "callbackId", 123, "buildId", 1, "epoch", 1, "decision", map[string]any{"mode": "probe"})
			case "wrong-epoch":
				h.send("Rebuild", "buildId", 1, "epoch", 1)
				callback := h.event("Resolve")
				h.send("CallbackCancelled", "callbackId", callback["callbackId"], "buildId", 1, "epoch", 2)
			case "truncated":
				_, _ = h.in.Write([]byte{0, 0, 0, 10, '{'})
				_ = h.in.Close()
			case "malformed":
				_, _ = h.in.Write([]byte{0, 0, 0, 1, '{'})
			case "build-order":
				h.send("Rebuild", "buildId", 1, "epoch", 1)
				h.capture()
				h.send("Rebuild", "buildId", 1, "epoch", 2)
			}
			if err := <-h.done; err == nil {
				t.Fatal("protocol violation accepted")
			}
			<-h.s.ownedDisposed
		})
	}
}

func TestHandshakeAndFiniteOptions(t *testing.T) {
	h := newHarness(t)
	h.send("Create", "options", options{Root: "/", Entries: []string{}, Outdir: "/out", Conditions: []string{}, TsconfigRaw: "{}"})
	h.event("Rejected")
	h.send("Hello", "esbuildVersion", "0.0.0", "capabilities", capabilities)
	h.event("Rejected")
	h.send("Hello", "esbuildVersion", engineVersion, "capabilities", []string{"resolve-rpc"})
	h.event("Rejected")
	h.send("Hello", "esbuildVersion", engineVersion, "capabilities", capabilities)
	h.event("Hello")
	h.send("Create", "options", options{Root: "/", Entries: []string{"/entry.ts"}, Outdir: "/out", Conditions: []string{}, TsconfigRaw: ""})
	h.event("Rejected")
	_ = h.in.Close()
	if err := <-h.done; err == nil {
		t.Fatal("expected host loss without disposal")
	}
}

func TestLoadersTransformsAndProtectedAliases(t *testing.T) {
	root := t.TempDir()
	s := newService(io.NopCloser(strings.NewReader("")), discardCloser{}, engineVersion)
	s.active = &buildState{sources: []source{}}
	for _, test := range []struct{ name, contents, attribute, loader string }{
		{"value.json", `{"value":1}`, "", "default"},
		{"attribute.json", `{"value":1}`, "json", "js"},
		{"text.txt", "hello", "text", "text"},
		{"bytes.bin", "\x00\xff", "bytes", "binary"},
	} {
		writeFixture(t, root, test.name, test.contents)
		with := map[string]string{}
		if test.attribute != "" {
			with["type"] = test.attribute
		}
		result := s.load(api.OnLoadArgs{Path: filepath.Join(root, test.name), Namespace: "file", With: with})
		if len(result.Errors) > 0 {
			t.Fatal(result.Errors)
		}
		capture := s.active.sources[len(s.active.sources)-1]
		if capture.Loader != test.loader || capture.OriginalSHA256 != digest([]byte(test.contents)) || capture.SHA256 != digest([]byte(*result.Contents)) {
			t.Fatal(capture)
		}
	}
	writeFixture(t, root, ".env.local", "must never be loaded")
	if result := s.load(api.OnLoadArgs{Path: filepath.Join(root, ".env.local"), Namespace: "file"}); len(result.Errors) != 1 || result.Errors[0].ID != "ForbiddenFile" {
		t.Fatal(result)
	}
	if err := os.Symlink(filepath.Join(root, ".env.local"), filepath.Join(root, "alias.json")); err != nil {
		t.Skip("symlink unavailable", err)
	}
	if result := s.load(api.OnLoadArgs{Path: filepath.Join(root, "alias.json"), Namespace: "file"}); len(result.Errors) != 1 || result.Errors[0].ID != "ForbiddenFile" {
		t.Fatal(result)
	}
}

func TestStructuredDiagnostics(t *testing.T) {
	h := newHarness(t)
	h.setup(fixture(t, `export const = ;`))
	h.send("Rebuild", "buildId", 1, "epoch", 1)
	capture := h.capture()
	if capture["status"] != "Failed" {
		t.Fatal(capture)
	}
	errors := capture["errors"].([]any)
	if len(errors) == 0 || errors[0].(map[string]any)["location"] == nil {
		t.Fatal(errors)
	}
	h.finish()
}

func TestCallbackCapacityAndCancellation(t *testing.T) {
	s := newService(io.NopCloser(strings.NewReader("")), discardCloser{}, engineVersion)
	b := &buildState{id: 1, epoch: 1, cancelled: make(chan struct{}), done: make(chan struct{})}
	s.active = b
	var workers sync.WaitGroup
	for i := 0; i < maxCallbacks+1; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			result := s.resolve(api.OnResolveArgs{Path: "entry.ts"}, api.ResolveResult{})
			if len(result.Errors) != 1 {
				t.Error("callback did not cancel")
			}
		}()
	}
	ids := []uint64{}
	for i := 0; i < maxCallbacks; i++ {
		encoded := <-s.outbound
		var event struct {
			CallbackID uint64 `json:"callbackId"`
		}
		if err := json.Unmarshal(encoded, &event); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, event.CallbackID)
	}
	s.mu.Lock()
	if len(s.pending) != maxCallbacks {
		t.Fatal("callback bound violated", len(s.pending))
	}
	s.cancelCallbacks(b)
	s.mu.Unlock()
	for i, id := range ids {
		if err := s.handle(request{ID: uint64(i + 1), Tag: "CallbackCancelled", CallbackID: id, BuildID: 1, Epoch: 1}); err != nil {
			t.Fatal(err)
		}
	}
	workers.Wait()
	if len(s.pending) != 0 {
		t.Fatal("callbacks leaked")
	}
}

type blockedWriter struct {
	started   chan struct{}
	closed    chan struct{}
	startOnce sync.Once
	closeOnce sync.Once
}

func (w *blockedWriter) Write([]byte) (int, error) {
	w.startOnce.Do(func() { close(w.started) })
	<-w.closed
	return 0, io.ErrClosedPipe
}
func (w *blockedWriter) Close() error { w.closeOnce.Do(func() { close(w.closed) }); return nil }

func TestHostLossInterruptsBlockedStdout(t *testing.T) {
	r, w := io.Pipe()
	output := &blockedWriter{started: make(chan struct{}), closed: make(chan struct{})}
	s := newService(r, output, engineVersion)
	done := make(chan error, 1)
	go func() { done <- s.run() }()
	if err := writeFrame(w, response(1, "Hello", "esbuildVersion", engineVersion, "capabilities", capabilities)); err != nil {
		t.Fatal(err)
	}
	<-output.started
	_ = w.Close()
	if err := <-done; err == nil {
		t.Fatal("host loss accepted")
	}
}

func TestCancelDisposeRaceSettlesOnce(t *testing.T) {
	h := newHarness(t)
	h.setup(fixture(t, `export default 1`))
	h.send("Rebuild", "buildId", 1, "epoch", 1)
	callback := h.event("Resolve")
	h.send("Cancel", "buildId", 1)
	h.event("CancelCallbacks")
	h.send("Dispose")
	h.send("Dispose")
	h.send("CallbackCancelled", "callbackId", callback["callbackId"], "buildId", 1, "epoch", 1)
	h.event("Capture")
	h.event("Cancelled")
	h.event("Disposed")
	h.event("Disposed")
	_ = h.in.Close()
	if err := <-h.done; err != nil {
		t.Fatal(err)
	}
}

func TestQueuedLoadsReleaseOnCancellationAndHostLoss(t *testing.T) {
	for _, reason := range []string{"Cancelled", "HostLost"} {
		t.Run(reason, func(t *testing.T) {
			s := newService(io.NopCloser(strings.NewReader("")), discardCloser{}, engineVersion)
			b := &buildState{id: 1, epoch: 1, cancelled: make(chan struct{}), done: make(chan struct{})}
			s.active = b
			for i := 0; i < maxLoads; i++ {
				s.loadSlots <- struct{}{}
			}
			started := make(chan struct{})
			done := make(chan api.OnLoadResult, 1)
			missing := filepath.Join(t.TempDir(), "missing.ts")
			go func() { close(started); done <- s.load(api.OnLoadArgs{Path: missing, Namespace: "file"}) }()
			<-started
			if reason == "Cancelled" {
				s.mu.Lock()
				s.cancelCallbacks(b)
				s.mu.Unlock()
			} else {
				s.abort(fault("HostLost", "test disconnect"))
			}
			result := <-done
			if len(result.Errors) != 1 || result.Errors[0].ID != reason {
				t.Fatalf("queued load performed IO or failed to stop: %#v", result)
			}
			if len(s.loadSlots) != maxLoads {
				t.Fatal("queued load released another owner's slot")
			}
		})
	}
}

func TestLoadGateReleasesOwnedSlotAfterReadFailureAndSuccess(t *testing.T) {
	root := fixture(t, `export default 1`)
	s := newService(io.NopCloser(strings.NewReader("")), discardCloser{}, engineVersion)
	s.active = &buildState{cancelled: make(chan struct{}), sources: []source{}}
	for _, name := range []string{"missing.ts", "entry.ts"} {
		result := s.load(api.OnLoadArgs{Path: filepath.Join(root, name), Namespace: "file"})
		if (len(result.Errors) > 0) != (name == "missing.ts") {
			t.Fatal(result)
		}
		if len(s.loadSlots) != 0 {
			t.Fatal("load retained its slot")
		}
	}
}

func TestProtectedNamesRejectAllCaseVariantsBeforeFilesystemAccess(t *testing.T) {
	s := newService(io.NopCloser(strings.NewReader("")), discardCloser{}, engineVersion)
	s.active = &buildState{cancelled: make(chan struct{}), sources: []source{}}
	root := t.TempDir()
	for _, name := range []string{".env.local", ".ENV.LOCAL", ".Env.Local"} {
		result := s.load(api.OnLoadArgs{Path: filepath.Join(root, "nonexistent", name), Namespace: "file"})
		if len(result.Errors) != 1 || result.Errors[0].ID != "ForbiddenFile" {
			t.Fatalf("protected name reached filesystem lookup: %#v", result)
		}
		if len(s.loadSlots) != 0 {
			t.Fatal("protected input retained load slot")
		}
	}
}
