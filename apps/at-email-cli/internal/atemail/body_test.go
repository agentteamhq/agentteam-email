package atemail

import (
	"bytes"
	"os"
	"strings"
	"testing"
)

func TestReadBodyRejectsInvalidUTF8FromFlag(t *testing.T) {
	body := string([]byte{0xff})
	_, err := readBody(parsedArgs{Body: &body}, strings.NewReader(""))
	if err == nil {
		t.Fatal("expected invalid UTF-8 error")
	}
	if err.Error() != "message body is not valid UTF-8" {
		t.Fatalf("error = %q", err.Error())
	}
}

func TestReadBodyRejectsInvalidUTF8FromFile(t *testing.T) {
	file, err := os.CreateTemp(t.TempDir(), "body-*.txt")
	if err != nil {
		t.Fatalf("CreateTemp: %v", err)
	}
	if _, err := file.Write([]byte{0xff}); err != nil {
		t.Fatalf("write temp body: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close temp body: %v", err)
	}

	_, err = readBody(parsedArgs{BodyFile: file.Name()}, strings.NewReader(""))
	if err == nil {
		t.Fatal("expected invalid UTF-8 error")
	}
	if !strings.Contains(err.Error(), "is not valid UTF-8") {
		t.Fatalf("error = %q", err.Error())
	}
}

func TestReadBodyRejectsInvalidUTF8FromStdin(t *testing.T) {
	_, err := readBody(parsedArgs{}, bytes.NewReader([]byte{0xff}))
	if err == nil {
		t.Fatal("expected invalid UTF-8 error")
	}
	if err.Error() != "message body from stdin is not valid UTF-8" {
		t.Fatalf("error = %q", err.Error())
	}
}

func TestReadBodyAllowsExplicitEmptyBody(t *testing.T) {
	body := ""
	got, err := readBody(parsedArgs{Body: &body}, strings.NewReader(""))
	if err != nil {
		t.Fatalf("readBody: %v", err)
	}
	if got != "" {
		t.Fatalf("body = %q", got)
	}
}
