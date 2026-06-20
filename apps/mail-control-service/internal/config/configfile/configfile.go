package configfile

import (
	"bytes"
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

func LoadYAML(path string, target any) error {
	if path == "" {
		return fmt.Errorf("missing required config path")
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read config %q: %w", path, err)
	}

	decoder := yaml.NewDecoder(bytes.NewReader(data))
	decoder.KnownFields(true)
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("decode config %q: %w", path, err)
	}

	return nil
}

func RequireEnv(key string) (string, error) {
	value := os.Getenv(key)
	if value == "" {
		return "", fmt.Errorf("missing required environment variable %s", key)
	}
	return value, nil
}
