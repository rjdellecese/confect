package main

import (
	"bytes"
	"encoding/binary"
	"io"
	"strings"
	"testing"
)

func TestFrameBoundaries(t *testing.T) {
	for _, size := range []uint32{0, maxFrame + 1} {
		var header [4]byte
		binary.BigEndian.PutUint32(header[:], size)
		if _, err := readFrame(bytes.NewReader(header[:])); err == nil {
			t.Fatal("accepted invalid length", size)
		}
	}
	for _, b := range [][]byte{{0}, {0, 0, 0, 2, '{'}, {0, 0, 0, 1, 255}} {
		if _, err := readFrame(bytes.NewReader(b)); err == nil {
			t.Fatal("accepted truncated/invalid frame")
		}
	}
	var wire bytes.Buffer
	if err := writeFrame(&wire, response(1, "Dispose")); err != nil {
		t.Fatal(err)
	}
	b, err := readFrame(&wire)
	if err != nil {
		t.Fatal(err)
	}
	r, err := decodeRequest(b)
	if err != nil || r.Tag != "Dispose" {
		t.Fatal(r, err)
	}
	if err := writeFrame(io.Discard, strings.Repeat("x", maxFrame)); err == nil {
		t.Fatal("accepted oversized response")
	}
}

func TestStrictJSON(t *testing.T) {
	for _, text := range []string{
		`{"version":1,"id":1,"id":2,"tag":"Dispose"}`,
		`{"version":1,"id":1,"tag":"Dispose","extra":false}`,
		`{"version":1,"tag":"Dispose"}`,
		`{"version":1,"id":1,"tag":"Rebuild","buildId":null,"epoch":1}`,
		`{"version":1,"id":1,"tag":"Rebuild","buildId":1.5,"epoch":1}`,
		`{"version":1,"id":9007199254740992,"tag":"Dispose"}`,
		`{"version":2,"id":1,"tag":"Dispose"}`,
		`{"version":1,"id":1,"tag":"Unknown"}`,
		`{"version":1,"id":1,"tag":"Dispose"} {}`,
		`{"version":1,"id":1,"tag":"Create","options":{"root":"/","root":"/","entries":[],"outdir":"/out","conditions":[],"tsconfigRaw":"{}"}}`,
		`{"version":1,"id":1,"tag":"ResolveResult","callbackId":1,"buildId":1,"epoch":1,"decision":{"mode":"probe","result":{}}}`,
	} {
		t.Run(text, func(t *testing.T) {
			if _, err := decodeRequest([]byte(text)); err == nil {
				t.Fatal("accepted invalid request")
			}
		})
	}
	if _, err := parseJSON([]byte(strings.Repeat("[", 66) + strings.Repeat("]", 66))); err == nil {
		t.Fatal("accepted deep JSON")
	}
}

func TestZeroOwnershipIDsAreWireErrors(t *testing.T) {
	for _, text := range []string{
		`{"version":1,"id":1,"tag":"Rebuild","buildId":0,"epoch":1}`,
		`{"version":1,"id":1,"tag":"Rebuild","buildId":1,"epoch":0}`,
		`{"version":1,"id":1,"tag":"Cancel","buildId":0}`,
		`{"version":1,"id":1,"tag":"CallbackCancelled","callbackId":0,"buildId":1,"epoch":1}`,
		`{"version":1,"id":1,"tag":"ResolveResult","callbackId":1,"buildId":0,"epoch":1,"decision":{"mode":"probe"}}`,
	} {
		t.Run(text, func(t *testing.T) {
			_, err := decodeRequest([]byte(text))
			boundary, ok := err.(*boundaryError)
			if !ok || boundary.Code != "RequestID" {
				t.Fatalf("zero ownership ID was not a wire error: %v", err)
			}
		})
	}
}

type shortWriter struct{ bytes.Buffer }

func (w *shortWriter) Write(b []byte) (int, error) {
	if len(b) > 2 {
		b = b[:2]
	}
	return w.Buffer.Write(b)
}
func TestShortWrites(t *testing.T) {
	w := &shortWriter{}
	if err := writeFrame(w, response(1, "Dispose")); err != nil {
		t.Fatal(err)
	}
	if _, err := readFrame(&w.Buffer); err != nil {
		t.Fatal(err)
	}
}
