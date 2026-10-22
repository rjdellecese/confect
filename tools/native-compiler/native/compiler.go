package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/evanw/esbuild/pkg/api"
)

type source struct {
	Path           string            `json:"path"`
	Namespace      string            `json:"namespace"`
	Suffix         string            `json:"suffix"`
	Attributes     map[string]string `json:"attributes"`
	Loader         string            `json:"loader"`
	ResolveDir     string            `json:"resolveDir"`
	SHA256         string            `json:"sha256"`
	OriginalSHA256 string            `json:"originalSha256"`
	BytesBase64    string            `json:"bytesBase64"`
}
type output struct {
	Path        string `json:"path"`
	SHA256      string `json:"sha256"`
	BytesBase64 string `json:"bytesBase64"`
}
type probeToken struct{}

func digest(b []byte) string      { sum := sha256.Sum256(b); return hex.EncodeToString(sum[:]) }
func base64Bytes(b []byte) string { return base64.StdEncoding.EncodeToString(b) }
func attrs(m map[string]string) map[string]string {
	if m == nil {
		return map[string]string{}
	}
	return m
}
func protected(path string) bool { return strings.EqualFold(filepath.Base(path), ".env.local") }
func jsonString(text string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range text {
		switch r {
		case '\\', '"':
			b.WriteByte('\\')
			b.WriteRune(r)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 32 {
				fmt.Fprintf(&b, `\u%04x`, r)
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return b.String()
}

func fileURL(path string) string {
	path = filepath.ToSlash(path)
	if strings.HasPrefix(path, "//") {
		parts := strings.SplitN(strings.TrimPrefix(path, "//"), "/", 2)
		if len(parts) == 2 {
			return (&url.URL{Scheme: "file", Host: parts[0], Path: "/" + parts[1]}).String()
		}
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return (&url.URL{Scheme: "file", Path: path}).String()
}

func toLocation(l *api.Location) *location {
	if l == nil {
		return nil
	}
	return &location{l.File, l.Namespace, l.Line, l.Column, l.Length, l.LineText, l.Suggestion}
}
func fromLocation(l *location) *api.Location {
	if l == nil {
		return nil
	}
	return &api.Location{File: l.File, Namespace: l.Namespace, Line: l.Line, Column: l.Column, Length: l.Length, LineText: l.LineText, Suggestion: l.Suggestion}
}
func diagnostics(messages []api.Message) []diagnostic {
	result := make([]diagnostic, 0, len(messages))
	for _, m := range messages {
		notes := make([]note, 0, len(m.Notes))
		for _, n := range m.Notes {
			notes = append(notes, note{n.Text, toLocation(n.Location)})
		}
		result = append(result, diagnostic{m.ID, m.PluginName, m.Text, toLocation(m.Location), notes})
	}
	return result
}
func messages(diagnostics []diagnostic) []api.Message {
	result := make([]api.Message, 0, len(diagnostics))
	for _, d := range diagnostics {
		notes := make([]api.Note, 0, len(d.Notes))
		for _, n := range d.Notes {
			notes = append(notes, api.Note{Text: n.Text, Location: fromLocation(n.Location)})
		}
		result = append(result, api.Message{ID: d.ID, PluginName: d.PluginName, Text: d.Text, Location: fromLocation(d.Location), Notes: notes})
	}
	return result
}
func loadError(code, text string) api.OnLoadResult {
	return api.OnLoadResult{Errors: []api.Message{{ID: code, Text: code + ": " + text}}}
}
func resolveError(code, text string) api.OnResolveResult {
	return api.OnResolveResult{Errors: []api.Message{{ID: code, Text: code + ": " + text}}}
}
func kindName(kind api.ResolveKind) string {
	switch kind {
	case api.ResolveEntryPoint:
		return "entry-point"
	case api.ResolveJSImportStatement:
		return "import-statement"
	case api.ResolveJSRequireCall:
		return "require-call"
	case api.ResolveJSDynamicImport:
		return "dynamic-import"
	case api.ResolveJSRequireResolve:
		return "require-resolve"
	case api.ResolveCSSImportRule:
		return "import-rule"
	case api.ResolveCSSComposesFrom:
		return "composes-from"
	case api.ResolveCSSURLToken:
		return "url-token"
	}
	return "unknown"
}
func probeWire(p api.ResolveResult) map[string]any {
	return map[string]any{"path": p.Path, "namespace": p.Namespace, "suffix": p.Suffix, "external": p.External, "sideEffects": p.SideEffects, "errors": diagnostics(p.Errors), "warnings": diagnostics(p.Warnings)}
}
func probeResult(p api.ResolveResult) api.OnResolveResult {
	sideEffects := api.SideEffectsTrue
	if !p.SideEffects {
		sideEffects = api.SideEffectsFalse
	}
	return api.OnResolveResult{Path: p.Path, Namespace: p.Namespace, Suffix: p.Suffix, External: p.External, SideEffects: sideEffects, Errors: p.Errors, Warnings: p.Warnings}
}

func preferredCandidates(args api.OnResolveArgs) []string {
	if !filepath.IsAbs(args.Path) && !strings.HasPrefix(args.Path, ".") {
		return nil
	}
	path := args.Path
	if !filepath.IsAbs(path) {
		path = filepath.Join(args.ResolveDir, path)
	}
	if i := strings.IndexAny(path, "?#"); i >= 0 {
		path = path[:i]
	}
	paths := []string{path}
	if filepath.Ext(path) == ".js" {
		stem := strings.TrimSuffix(path, ".js")
		paths = append(paths, stem+".ts", stem+".tsx")
	}
	if filepath.Ext(path) == "" {
		for _, ext := range []string{".tsx", ".ts", ".jsx", ".js", ".css", ".json"} {
			paths = append(paths, path+ext, filepath.Join(path, "index"+ext))
		}
	}
	return paths
}

func (s *service) plugin() api.Plugin {
	return api.Plugin{Name: "confect:native-boundary", Setup: func(build api.PluginBuild) {
		build.OnDispose(func() { close(s.ownedDisposed) })
		build.OnResolve(api.OnResolveOptions{Filter: ".*"}, func(args api.OnResolveArgs) (api.OnResolveResult, error) {
			if _, ok := args.PluginData.(probeToken); ok {
				return api.OnResolveResult{}, nil
			}
			if args.Namespace != "" && args.Namespace != "file" && args.Namespace != "confect-generated" {
				return resolveError("UnsupportedNamespace", args.Namespace), nil
			}
			if args.Kind != api.ResolveEntryPoint && strings.Contains(args.Path, "convex.config") {
				return resolveError("UnsupportedComponent", args.Path), nil
			}
			path := strings.SplitN(strings.SplitN(args.Path, "?", 2)[0], "#", 2)[0]
			if protected(path) {
				return resolveError("ForbiddenFile", path), nil
			}
			probe := build.Resolve(args.Path, api.ResolveOptions{Importer: args.Importer, Namespace: "file", ResolveDir: args.ResolveDir, Kind: args.Kind, With: args.With, PluginData: probeToken{}})
			resolved := s.resolve(args, probe)
			if resolved.Path != "" && !resolved.External {
				if resolved.Namespace != "" && resolved.Namespace != "file" && resolved.Namespace != "confect-generated" {
					return resolveError("UnsupportedNamespace", resolved.Namespace), nil
				}
				if !filepath.IsAbs(resolved.Path) {
					return resolveError("UnsupportedPath", resolved.Path), nil
				}
			}
			resolved.WatchFiles = append(resolved.WatchFiles, preferredCandidates(args)...)
			if args.ResolveDir != "" {
				resolved.WatchDirs = append(resolved.WatchDirs, args.ResolveDir)
			}
			return resolved, nil
		})
		build.OnLoad(api.OnLoadOptions{Filter: ".*"}, func(args api.OnLoadArgs) (api.OnLoadResult, error) { return s.load(args), nil })
	}}
}

func (s *service) resolve(args api.OnResolveArgs, probe api.ResolveResult) api.OnResolveResult {
	s.mu.Lock()
	b := s.active
	s.mu.Unlock()
	if b == nil {
		return resolveError("BuildState", "no active build")
	}
	select {
	case s.slots <- struct{}{}:
	case <-b.cancelled:
		return resolveError("Cancelled", "build cancelled")
	case <-s.dead:
		return resolveError("HostLost", "host disconnected")
	}
	defer func() { <-s.slots }()
	s.mu.Lock()
	if b.cancelling {
		s.mu.Unlock()
		return resolveError("Cancelled", "build cancelled")
	}
	select {
	case <-s.dead:
		s.mu.Unlock()
		return resolveError("HostLost", "host disconnected")
	default:
	}
	s.lastCallback++
	id := s.lastCallback
	ch := make(chan callbackReply, 1)
	s.pending[id] = pendingCallback{b, ch}
	s.emit(response(0, "Resolve", "callbackId", id, "buildId", b.id, "epoch", b.epoch, "args", map[string]any{"path": args.Path, "importer": args.Importer, "namespace": args.Namespace, "resolveDir": args.ResolveDir, "kind": kindName(args.Kind), "with": attrs(args.With)}, "probe", probeWire(probe)))
	s.mu.Unlock()
	var reply callbackReply
	select {
	case reply = <-ch:
	case <-s.dead:
		s.mu.Lock()
		delete(s.pending, id)
		s.mu.Unlock()
		return resolveError("HostLost", "host disconnected")
	}
	if reply.cancelled {
		return resolveError("Cancelled", "host callback cancelled")
	}
	if reply.decision == nil {
		return probeResult(probe)
	}
	d := reply.decision
	sideEffects := api.SideEffectsTrue
	if !d.SideEffects {
		sideEffects = api.SideEffectsFalse
	}
	return api.OnResolveResult{Path: d.Path, Namespace: d.Namespace, Suffix: d.Suffix, External: d.External, SideEffects: sideEffects, Errors: messages(d.Errors), Warnings: messages(d.Warnings), WatchFiles: d.WatchFiles, WatchDirs: d.WatchDirs}
}

func (s *service) load(args api.OnLoadArgs) api.OnLoadResult {
	s.mu.Lock()
	b := s.active
	s.mu.Unlock()
	if b == nil {
		return loadError("BuildState", "no active build")
	}
	select {
	case s.loadSlots <- struct{}{}:
	case <-b.cancelled:
		return loadError("Cancelled", "build cancelled")
	case <-s.dead:
		return loadError("HostLost", "host disconnected")
	}
	defer func() { <-s.loadSlots }()
	s.mu.Lock()
	cancelled := b.cancelling || s.active != b
	s.mu.Unlock()
	if cancelled {
		return loadError("Cancelled", "build cancelled")
	}
	select {
	case <-s.dead:
		return loadError("HostLost", "host disconnected")
	default:
	}
	if args.Namespace != "file" && args.Namespace != "confect-generated" {
		return loadError("UnsupportedNamespace", args.Namespace)
	}
	if protected(args.Path) {
		return loadError("ForbiddenFile", args.Path)
	}
	real, err := filepath.EvalSymlinks(args.Path)
	if err != nil {
		return loadError("ReadFailed", err.Error())
	}
	if protected(real) {
		return loadError("ForbiddenFile", args.Path)
	}
	file, err := os.Open(real)
	if err != nil {
		return loadError("ReadFailed", err.Error())
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil || !stat.Mode().IsRegular() {
		return loadError("UnsupportedFile", args.Path)
	}
	original, err := io.ReadAll(io.LimitReader(file, maxFrame+1))
	if err != nil {
		return loadError("ReadFailed", err.Error())
	}
	if len(original) > maxFrame {
		return loadError("SourceLimit", args.Path)
	}
	contents := string(original)
	loader := api.LoaderNone
	name := ""
	resolveDir := filepath.Dir(args.Path)
	warnings := []api.Message{}
	ext := filepath.Ext(args.Path)
	switch ext {
	case ".js", ".mjs", ".cjs":
		loader = api.LoaderJS
		name = "js"
	case ".ts", ".mts", ".cts":
		loader = api.LoaderTS
		name = "ts"
	case ".jsx":
		loader = api.LoaderJSX
		name = "jsx"
	case ".tsx":
		loader = api.LoaderTSX
		name = "tsx"
	}
	if loader != api.LoaderNone {
		if !utf8.Valid(original) {
			return loadError("UnsupportedEncoding", "file-scope injection requires UTF-8")
		}
		contents = "const __injected_filename__ = " + jsonString(args.Path) + ";const __injected_dirname__ = " + jsonString(filepath.Dir(args.Path)) + ";const __injected_import_meta_url__ = " + jsonString(fileURL(args.Path)) + ";" + contents
		if args.Namespace == "file" {
			resolveDir = ""
		}
	} else if args.Namespace == "confect-generated" {
		if ext == ".json" {
			loader = api.LoaderJSON
			name = "json"
		} else {
			loader = api.LoaderText
			name = "text"
		}
	} else {
		for key, value := range args.With {
			if key != "type" || (value != "json" && value != "text" && value != "bytes") {
				return loadError("UnsupportedImportAttributes", args.Path)
			}
		}
		switch args.With["type"] {
		case "json":
			transformed := api.Transform(contents, api.TransformOptions{Loader: api.LoaderJSON, Format: api.FormatCommonJS, Sourcefile: args.Path, Sourcemap: api.SourceMapInline, Banner: "const module = { exports: undefined };", Footer: "export default module.exports;", LogLevel: api.LogLevelSilent})
			if len(transformed.Errors) > 0 {
				return api.OnLoadResult{Errors: transformed.Errors, Warnings: transformed.Warnings}
			}
			contents = string(transformed.Code)
			warnings = transformed.Warnings
			loader = api.LoaderJS
			name = "js"
		case "text":
			loader = api.LoaderText
			name = "text"
		case "bytes":
			loader = api.LoaderBinary
			name = "binary"
		case "":
			if ext == ".json" {
				loader = api.LoaderDefault
				name = "default"
			} else {
				return loadError("UnsupportedLoader", ext)
			}
		}
	}
	loaded := []byte(contents)
	item := source{args.Path, args.Namespace, args.Suffix, attrs(args.With), name, resolveDir, digest(loaded), digest(original), base64Bytes(loaded)}
	s.mu.Lock()
	defer s.mu.Unlock()
	select {
	case <-s.dead:
		return loadError("HostLost", "host disconnected")
	default:
	}
	if s.active == nil || s.active.cancelling {
		return loadError("Cancelled", "build cancelled")
	}
	s.active.sourceBytes += len(item.BytesBase64) + len(args.Path) + 1024
	if s.active.sourceBytes > maxFrame/2 {
		return loadError("CaptureLimit", "loaded sources exceed capture budget")
	}
	s.active.sources = append(s.active.sources, item)
	return api.OnLoadResult{Contents: &contents, Loader: loader, ResolveDir: resolveDir, Warnings: warnings, WatchFiles: []string{args.Path, real}}
}
