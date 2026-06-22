package atemail

import (
	"fmt"
	"io"
	"os"
	"unicode/utf8"
)

func readBody(args parsedArgs, stdin io.Reader) (string, error) {
	if args.Body != nil && args.BodyFile != "" {
		return "", newCommandUsageError(args.Command, "use either --body or --body-file, not both")
	}
	if args.BodyFile != "" {
		data, err := os.ReadFile(args.BodyFile)
		if err != nil {
			if pathErr, ok := err.(*os.PathError); ok {
				return "", newAgentMailError(fmt.Sprintf("failed to read body file %q: %s", args.BodyFile, pathErr.Err.Error()))
			}
			return "", newAgentMailError(fmt.Sprintf("failed to read body file %q: %s", args.BodyFile, err.Error()))
		}
		if !utf8.Valid(data) {
			return "", newAgentMailError(fmt.Sprintf("body file %q is not valid UTF-8", args.BodyFile))
		}
		return string(data), nil
	}
	if args.Body != nil {
		if !utf8.ValidString(*args.Body) {
			return "", newAgentMailError("message body is not valid UTF-8")
		}
		return *args.Body, nil
	}
	if !stdinIsTerminal(stdin) {
		data, err := io.ReadAll(stdin)
		if err != nil {
			return "", newAgentMailError("failed to read message body from stdin: " + err.Error())
		}
		if len(data) > 0 {
			if !utf8.Valid(data) {
				return "", newAgentMailError("message body from stdin is not valid UTF-8")
			}
			return string(data), nil
		}
	}
	return "", newCommandUsageError(args.Command, "missing message body; use --body, --body-file, or pipe stdin")
}

func stdinIsTerminal(reader io.Reader) bool {
	file, ok := reader.(*os.File)
	if !ok {
		return false
	}
	stat, err := file.Stat()
	if err != nil {
		return false
	}
	return stat.Mode()&os.ModeCharDevice != 0
}
