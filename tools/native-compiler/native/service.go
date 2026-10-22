package main

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"runtime/debug"
	"slices"
	"sort"
	"strings"
	"sync"

	"github.com/evanw/esbuild/pkg/api"
)

type callbackReply struct {
	decision  *resolveDecision
	cancelled bool
}
type pendingCallback struct {
	build *buildState
	reply chan callbackReply
}
type buildState struct {
	id, epoch, requestID uint64
	done                 chan struct{}
	cancelled            chan struct{}
	cancelAck            chan struct{}
	cancelling           bool
	sources              []source
	sourceBytes          int
}
type service struct {
	input                                           io.ReadCloser
	output                                          io.WriteCloser
	outbound                                        chan []byte
	writerDone                                      chan struct{}
	mu                                              sync.Mutex
	dead                                            chan struct{}
	abortOnce                                       sync.Once
	disposeOnce                                     sync.Once
	disposed                                        chan struct{}
	ownedDisposed                                   chan struct{}
	ctx                                             api.BuildContext
	hello, closing                                  bool
	createAttempted                                 bool
	lastRequest, lastBuild, lastEpoch, lastCallback uint64
	active                                          *buildState
	pending                                         map[uint64]pendingCallback
	slots                                           chan struct{}
	loadSlots                                       chan struct{}
	version                                         string
	terminal                                        error
	disposeRequests                                 []uint64
}

func actualVersion() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return "unknown"
	}
	for _, dep := range info.Deps {
		if dep.Path == "github.com/evanw/esbuild" && dep.Replace == nil {
			return strings.TrimPrefix(dep.Version, "v")
		}
	}
	return "unknown"
}

func newService(input io.ReadCloser, output io.WriteCloser, version string) *service {
	return &service{input: input, output: output, outbound: make(chan []byte, 64), writerDone: make(chan struct{}), dead: make(chan struct{}), disposed: make(chan struct{}), ownedDisposed: make(chan struct{}), pending: map[uint64]pendingCallback{}, slots: make(chan struct{}, maxCallbacks), loadSlots: make(chan struct{}, maxLoads), version: version}
}

func (s *service) abort(err error) {
	s.abortOnce.Do(func() { s.terminal = err; close(s.dead); _ = s.input.Close(); _ = s.output.Close() })
}
func (s *service) emit(message any) {
	select {
	case <-s.dead:
		return
	default:
	}
	b, err := json.Marshal(message)
	if err != nil {
		s.abort(err)
		return
	}
	if len(b) > maxFrame {
		s.abort(fault("FrameSize", "response exceeds frame limit"))
		return
	}
	select {
	case s.outbound <- b:
	case <-s.dead:
	default:
		s.abort(fault("OutputBackpressure", "outbound queue exceeds 64 frames"))
	}
}
func (s *service) reject(r request, code, message string) {
	s.emit(response(r.ID, "Rejected", "code", code, "message", message))
}

func (s *service) run() error {
	go func() {
		defer close(s.writerDone)
		for {
			select {
			case <-s.dead:
				return
			case b := <-s.outbound:
				if err := writeRawFrame(s.output, b); err != nil {
					s.abort(err)
					return
				}
			}
		}
	}()
	for {
		frame, err := readFrame(s.input)
		if err != nil {
			clean := false
			select {
			case <-s.disposed:
				clean = err == io.EOF
			default:
			}
			if clean {
				s.abort(nil)
			} else {
				s.abort(fault("HostLost", err.Error()))
			}
			break
		}
		r, err := decodeRequest(frame)
		if err != nil {
			s.abort(err)
			break
		}
		if err := s.handle(r); err != nil {
			s.abort(err)
			break
		}
		select {
		case <-s.dead:
			goto cleanup
		default:
		}
	}
cleanup:
	s.mu.Lock()
	s.closing = true
	b := s.active
	s.mu.Unlock()
	if b != nil {
		s.ctx.Cancel()
		<-b.done
	}
	s.dispose()
	s.mu.Lock()
	s.active = nil
	s.mu.Unlock()
	<-s.writerDone
	return s.terminal
}

func (s *service) dispose() {
	s.disposeOnce.Do(func() {
		if s.ctx != nil {
			s.ctx.Dispose()
			<-s.ownedDisposed
		}
		close(s.disposed)
	})
	<-s.disposed
}

func validateOptions(o options) error {
	if !filepath.IsAbs(o.Root) || !filepath.IsAbs(o.Outdir) || len(o.Entries) == 0 || len(o.Entries) > 1024 {
		return fault("Options", "absolute root/outdir and 1..1024 entries required")
	}
	for _, entry := range o.Entries {
		if !filepath.IsAbs(entry) || protected(entry) {
			return fault("Options", "absolute unprotected entries required")
		}
	}
	if len(o.Conditions) > 128 || strings.TrimSpace(o.TsconfigRaw) == "" {
		return fault("Options", "bounded conditions and explicit tsconfigRaw required")
	}
	v, err := parseJSON([]byte(o.TsconfigRaw))
	if err != nil {
		return fault("Options", "tsconfigRaw must be valid JSON")
	}
	if _, ok := v.(map[string]any); !ok {
		return fault("Options", "tsconfigRaw must be an object")
	}
	return nil
}

func (s *service) handle(r request) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r.ID <= s.lastRequest {
		return fault("RequestOrder", "request IDs must strictly increase")
	}
	s.lastRequest = r.ID
	if r.Tag == "ResolveResult" || r.Tag == "CallbackCancelled" {
		p, ok := s.pending[r.CallbackID]
		if !ok || p.build.id != r.BuildID || p.build.epoch != r.Epoch {
			return fault("CallbackID", "unknown callback or mismatched ownership")
		}
		if r.Tag == "CallbackCancelled" && !p.build.cancelling {
			return fault("CallbackState", "cancellation was not requested")
		}
		delete(s.pending, r.CallbackID)
		p.reply <- callbackReply{r.Decision, r.Tag == "CallbackCancelled"}
		return nil
	}
	if !s.hello && r.Tag != "Hello" {
		s.reject(r, "HandshakeRequired", "Hello must precede other requests")
		return nil
	}
	switch r.Tag {
	case "Hello":
		caps := append([]string{}, r.Capabilities...)
		expected := append([]string{}, capabilities...)
		sort.Strings(caps)
		sort.Strings(expected)
		if s.hello || r.Version != engineVersion || s.version != engineVersion || !slices.Equal(caps, expected) {
			s.reject(r, "HandshakeMismatch", "exact engine version and capabilities required")
			return nil
		}
		s.hello = true
		s.emit(response(r.ID, "Hello", "esbuildVersion", s.version, "capabilities", capabilities, "maxFrameBytes", maxFrame, "maxCallbacks", maxCallbacks))
	case "Create":
		if s.createAttempted || s.closing {
			s.reject(r, "ContextState", "one context creation attempt per process")
			return nil
		}
		s.createAttempted = true
		if err := validateOptions(r.Options); err != nil {
			s.reject(r, "Options", err.Error())
			return nil
		}
		o := r.Options
		ctx, err := api.Context(api.BuildOptions{AbsWorkingDir: o.Root, EntryPoints: o.Entries, Outdir: o.Outdir, Conditions: o.Conditions, TsconfigRaw: o.TsconfigRaw, Bundle: true, Platform: api.PlatformNode, Format: api.FormatESModule, Engines: []api.Engine{{Name: api.EngineNode, Version: "22"}}, Sourcemap: api.SourceMapExternal, Metafile: true, Write: false, LogLevel: api.LogLevelSilent, KeepNames: true, Define: map[string]string{"__dirname": "__injected_dirname__", "__filename": "__injected_filename__", "import.meta.url": "__injected_import_meta_url__"}, Plugins: []api.Plugin{s.plugin()}})
		if err != nil {
			s.reject(r, "CreateFailed", err.Error())
			return nil
		}
		s.ctx = ctx
		s.emit(response(r.ID, "Created", "contextId", 1))
	case "Rebuild":
		if s.ctx == nil || s.closing || s.active != nil {
			s.reject(r, "ContextState", "context unavailable or busy")
			return nil
		}
		if r.BuildID <= s.lastBuild || r.Epoch <= s.lastEpoch {
			return fault("BuildOrder", "build IDs and epochs must strictly increase")
		}
		s.lastBuild = r.BuildID
		s.lastEpoch = r.Epoch
		b := &buildState{id: r.BuildID, epoch: r.Epoch, requestID: r.ID, done: make(chan struct{}), cancelled: make(chan struct{}), sources: []source{}}
		s.active = b
		go s.rebuild(b)
	case "Cancel":
		b := s.active
		if b == nil && r.BuildID != 0 && r.BuildID == s.lastBuild && !s.closing {
			s.emit(response(r.ID, "Cancelled", "buildId", r.BuildID))
			return nil
		}
		if b == nil || b.id != r.BuildID || s.closing || b.cancelling {
			s.reject(r, "BuildState", "build is not active or cancellation already requested")
			return nil
		}
		s.cancelCallbacks(b)
		b.cancelAck = make(chan struct{})
		go func() {
			s.ctx.Cancel()
			<-b.done
			s.mu.Lock()
			defer s.mu.Unlock()
			s.emit(response(r.ID, "Cancelled", "buildId", b.id))
			if s.active == b {
				s.active = nil
			}
			close(b.cancelAck)
		}()
	case "Dispose":
		if s.ctx == nil {
			s.reject(r, "ContextState", "context not created")
			return nil
		}
		select {
		case <-s.disposed:
			s.emit(response(r.ID, "Disposed", "contextId", 1, "disposeCount", 1))
			return nil
		default:
		}
		if len(s.disposeRequests) >= 32 {
			s.reject(r, "DisposeLimit", "at most 32 pending disposal acknowledgments")
			return nil
		}
		s.disposeRequests = append(s.disposeRequests, r.ID)
		if s.closing {
			return nil
		}
		s.closing = true
		b := s.active
		if b != nil {
			s.cancelCallbacks(b)
		}
		go func() {
			if b != nil {
				s.ctx.Cancel()
				<-b.done
				if b.cancelAck != nil {
					<-b.cancelAck
				}
			}
			s.dispose()
			s.mu.Lock()
			defer s.mu.Unlock()
			if s.active == b {
				s.active = nil
			}
			for _, id := range s.disposeRequests {
				s.emit(response(id, "Disposed", "contextId", 1, "disposeCount", 1))
			}
			s.disposeRequests = nil
		}()
	default:
		return fault("UnknownTag", r.Tag)
	}
	return nil
}

func (s *service) cancelCallbacks(b *buildState) {
	if b.cancelling {
		return
	}
	b.cancelling = true
	close(b.cancelled)
	ids := []uint64{}
	for id, pending := range s.pending {
		if pending.build == b {
			ids = append(ids, id)
		}
	}
	slices.Sort(ids)
	s.emit(response(0, "CancelCallbacks", "buildId", b.id, "epoch", b.epoch, "callbackIds", ids))
}

func (s *service) rebuild(b *buildState) {
	result := s.ctx.Rebuild()
	s.mu.Lock()
	defer s.mu.Unlock()
	status := "Succeeded"
	if len(result.Errors) > 0 {
		status = "Failed"
	}
	if b.cancelling {
		status = "Cancelled"
	}
	slices.SortFunc(b.sources, func(a, b source) int { return strings.Compare(sourceKey(a), sourceKey(b)) })
	outputs := []output{}
	outputBytes := len(result.Metafile) + b.sourceBytes
	for _, file := range result.OutputFiles {
		outputBytes += len(file.Contents)*4/3 + len(file.Path) + 256
		if outputBytes > maxFrame {
			s.abort(fault("CaptureLimit", "output and source capture exceed frame budget"))
			break
		}
		outputs = append(outputs, output{file.Path, digest(file.Contents), base64Bytes(file.Contents)})
	}
	s.emit(response(b.requestID, "Capture", "buildId", b.id, "epoch", b.epoch, "status", status, "provisional", true, "sources", b.sources, "outputs", outputs, "metafile", result.Metafile, "errors", diagnostics(result.Errors), "warnings", diagnostics(result.Warnings)))
	if !b.cancelling {
		s.active = nil
	}
	close(b.done)
}

func sourceKey(s source) string {
	encoded, _ := json.Marshal([]any{s.Path, s.Namespace, s.Suffix, s.Attributes})
	return string(encoded)
}

func main() {
	if err := newService(os.Stdin, os.Stdout, actualVersion()).run(); err != nil {
		os.Exit(1)
	}
}
