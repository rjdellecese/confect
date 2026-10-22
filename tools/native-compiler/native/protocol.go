package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"reflect"
	"unicode/utf8"
)

const maxFrame = 8 * 1024 * 1024
const maxCallbacks = 32
const maxLoads = 8
const maxID = 9007199254740991
const engineVersion = "0.28.2"

var capabilities = []string{"resolve-rpc", "file-scope", "capture-v1", "cancel-v1"}

type boundaryError struct {
	Code    string
	Message string
}

func (e *boundaryError) Error() string { return e.Code + ": " + e.Message }
func fault(code, message string) error { return &boundaryError{code, message} }

func readFrame(r io.Reader) ([]byte, error) {
	var header [4]byte
	if _, err := io.ReadFull(r, header[:]); err != nil {
		return nil, err
	}
	n := binary.BigEndian.Uint32(header[:])
	if n == 0 || n > maxFrame {
		return nil, fault("FrameSize", "frame length outside bounds")
	}
	b := make([]byte, n)
	if _, err := io.ReadFull(r, b); err != nil {
		return nil, err
	}
	if !utf8.Valid(b) {
		return nil, fault("InvalidUTF8", "frame must be UTF-8")
	}
	return b, nil
}

func writeFrame(w io.Writer, value any) error {
	b, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return writeRawFrame(w, b)
}

func writeRawFrame(w io.Writer, b []byte) error {
	if len(b) == 0 || len(b) > maxFrame {
		return fault("FrameSize", "response exceeds frame limit")
	}
	var header [4]byte
	binary.BigEndian.PutUint32(header[:], uint32(len(b)))
	if err := writeAll(w, header[:]); err != nil {
		return err
	}
	return writeAll(w, b)
}

func writeAll(w io.Writer, b []byte) error {
	for len(b) > 0 {
		n, err := w.Write(b)
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrShortWrite
		}
		b = b[n:]
	}
	return nil
}

func readJSON(d *json.Decoder, depth int) (any, error) {
	if depth > 64 {
		return nil, fault("JSONDepth", "nesting exceeds 64")
	}
	token, err := d.Token()
	if err != nil {
		return nil, err
	}
	if delimiter, ok := token.(json.Delim); ok {
		switch delimiter {
		case '{':
			result := map[string]any{}
			for d.More() {
				key, err := d.Token()
				if err != nil {
					return nil, err
				}
				name, ok := key.(string)
				if !ok {
					return nil, fault("JSONKey", "object key must be string")
				}
				if _, exists := result[name]; exists {
					return nil, fault("DuplicateField", name)
				}
				value, err := readJSON(d, depth+1)
				if err != nil {
					return nil, err
				}
				result[name] = value
			}
			_, err := d.Token()
			return result, err
		case '[':
			result := []any{}
			for d.More() {
				value, err := readJSON(d, depth+1)
				if err != nil {
					return nil, err
				}
				result = append(result, value)
			}
			_, err := d.Token()
			return result, err
		default:
			return nil, fault("JSONDelimiter", "unexpected delimiter")
		}
	}
	return token, nil
}

func parseJSON(b []byte) (any, error) {
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	v, err := readJSON(d, 0)
	if err != nil {
		return nil, err
	}
	if _, err := d.Token(); err != io.EOF {
		return nil, fault("TrailingJSON", "expected end of frame")
	}
	return v, nil
}

func validateShape(v any, t reflect.Type) error {
	if t.Kind() == reflect.Pointer {
		if v == nil {
			return nil
		}
		return validateShape(v, t.Elem())
	}
	if v == nil {
		return fault("NullField", t.String())
	}
	switch t.Kind() {
	case reflect.Struct:
		m, ok := v.(map[string]any)
		if !ok {
			return fault("ObjectRequired", t.String())
		}
		if len(m) != t.NumField() {
			return fault("Fields", "unknown or missing fields in "+t.String())
		}
		for i := 0; i < t.NumField(); i++ {
			f := t.Field(i)
			name := f.Tag.Get("json")
			child, ok := m[name]
			if !ok {
				return fault("MissingField", name)
			}
			if err := validateShape(child, f.Type); err != nil {
				return err
			}
		}
	case reflect.Slice:
		a, ok := v.([]any)
		if !ok {
			return fault("ArrayRequired", t.String())
		}
		for _, child := range a {
			if err := validateShape(child, t.Elem()); err != nil {
				return err
			}
		}
	case reflect.Map:
		m, ok := v.(map[string]any)
		if !ok {
			return fault("ObjectRequired", t.String())
		}
		for _, child := range m {
			if err := validateShape(child, t.Elem()); err != nil {
				return err
			}
		}
	case reflect.String:
		if _, ok := v.(string); !ok {
			return fault("StringRequired", t.String())
		}
	case reflect.Bool:
		if _, ok := v.(bool); !ok {
			return fault("BooleanRequired", t.String())
		}
	case reflect.Int, reflect.Uint64:
		n, ok := v.(json.Number)
		if !ok {
			return fault("IntegerRequired", t.String())
		}
		i, err := n.Int64()
		if err != nil || i < 0 || i > maxID {
			return fault("IntegerRange", string(n))
		}
	default:
		return fault("UnsupportedShape", t.String())
	}
	return nil
}

func decodeValue(v any, out any) error {
	if err := validateShape(v, reflect.TypeOf(out).Elem()); err != nil {
		return err
	}
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, out)
}

type options struct {
	Root        string   `json:"root"`
	Entries     []string `json:"entries"`
	Outdir      string   `json:"outdir"`
	Conditions  []string `json:"conditions"`
	TsconfigRaw string   `json:"tsconfigRaw"`
}
type location struct {
	File       string `json:"file"`
	Namespace  string `json:"namespace"`
	Line       int    `json:"line"`
	Column     int    `json:"column"`
	Length     int    `json:"length"`
	LineText   string `json:"lineText"`
	Suggestion string `json:"suggestion"`
}
type note struct {
	Text     string    `json:"text"`
	Location *location `json:"location"`
}
type diagnostic struct {
	ID         string    `json:"id"`
	PluginName string    `json:"pluginName"`
	Text       string    `json:"text"`
	Location   *location `json:"location"`
	Notes      []note    `json:"notes"`
}
type resolveDecision struct {
	Path        string       `json:"path"`
	Namespace   string       `json:"namespace"`
	Suffix      string       `json:"suffix"`
	External    bool         `json:"external"`
	SideEffects bool         `json:"sideEffects"`
	Errors      []diagnostic `json:"errors"`
	Warnings    []diagnostic `json:"warnings"`
	WatchFiles  []string     `json:"watchFiles"`
	WatchDirs   []string     `json:"watchDirs"`
}
type request struct {
	ID           uint64
	Tag          string
	BuildID      uint64
	Epoch        uint64
	CallbackID   uint64
	Version      string
	Capabilities []string
	Options      options
	Decision     *resolveDecision
}

func decodeRequest(b []byte) (request, error) {
	var r request
	v, err := parseJSON(b)
	if err != nil {
		return r, err
	}
	m, ok := v.(map[string]any)
	if !ok {
		return r, fault("ObjectRequired", "request")
	}
	version, ok := m["version"].(json.Number)
	if !ok || version != "1" {
		return r, fault("ProtocolVersion", "expected 1")
	}
	if err := decodeValue(m["id"], &r.ID); err != nil || r.ID == 0 {
		return r, fault("RequestID", "positive safe integer required")
	}
	if err := decodeValue(m["tag"], &r.Tag); err != nil {
		return r, err
	}
	fields := map[string]any{"version": nil, "id": nil, "tag": nil}
	add := func(name string, out any) error { fields[name] = nil; return decodeValue(m[name], out) }
	switch r.Tag {
	case "Hello":
		err = add("esbuildVersion", &r.Version)
		if err == nil {
			err = add("capabilities", &r.Capabilities)
		}
	case "Create":
		err = add("options", &r.Options)
	case "Rebuild":
		err = add("buildId", &r.BuildID)
		if err == nil {
			err = add("epoch", &r.Epoch)
		}
	case "Cancel":
		err = add("buildId", &r.BuildID)
	case "Dispose":
	case "ResolveResult", "CallbackCancelled":
		err = add("callbackId", &r.CallbackID)
		if err == nil {
			err = add("buildId", &r.BuildID)
		}
		if err == nil {
			err = add("epoch", &r.Epoch)
		}
		if err == nil && r.Tag == "ResolveResult" {
			fields["decision"] = nil
			d, ok := m["decision"].(map[string]any)
			if !ok {
				return r, fault("Decision", "object required")
			}
			if d["mode"] == "probe" && len(d) == 1 {
			} else if d["mode"] == "result" && len(d) == 2 {
				r.Decision = &resolveDecision{}
				err = decodeValue(d["result"], r.Decision)
			} else {
				err = fault("Decision", "unknown mode or fields")
			}
		}
	default:
		return r, fault("UnknownTag", r.Tag)
	}
	if err != nil {
		return r, err
	}
	if len(m) != len(fields) {
		return r, fault("Fields", "unknown or missing request field")
	}
	for key := range m {
		if _, ok := fields[key]; !ok {
			return r, fault("UnknownField", key)
		}
	}
	for key, id := range map[string]uint64{"buildId": r.BuildID, "epoch": r.Epoch, "callbackId": r.CallbackID} {
		if _, present := fields[key]; present && id == 0 {
			return r, fault("RequestID", key+" must be a positive safe integer")
		}
	}
	return r, nil
}

func response(id uint64, tag string, values ...any) map[string]any {
	m := map[string]any{"version": 1, "id": id, "tag": tag}
	for i := 0; i < len(values); i += 2 {
		m[fmt.Sprint(values[i])] = values[i+1]
	}
	return m
}
