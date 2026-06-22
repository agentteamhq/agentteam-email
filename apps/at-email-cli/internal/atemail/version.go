package atemail

var (
	Version = "0.1.0-dev"
	Commit  = "unknown"
	Date    = "unknown"
)

func versionPayload() map[string]any {
	return map[string]any{
		"version": Version,
		"commit":  Commit,
		"date":    Date,
	}
}
