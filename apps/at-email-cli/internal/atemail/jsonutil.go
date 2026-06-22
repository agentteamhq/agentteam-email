package atemail

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
)

func decodeJSONObject(raw []byte) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("expected a single JSON object")
		}
		return nil, err
	}
	object, _ := value.(map[string]any)
	if object == nil {
		return nil, fmt.Errorf("expected JSON object")
	}
	return object, nil
}

func encodeJSONBody(value any) ([]byte, error) {
	return json.Marshal(value)
}

func printJSON(writer io.Writer, payload any) error {
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	return encoder.Encode(payload)
}

func objectValue(value any) map[string]any {
	if object, ok := value.(map[string]any); ok && object != nil {
		return object
	}
	return map[string]any{}
}

func objectSlice(value any) []map[string]any {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if object, ok := item.(map[string]any); ok && object != nil {
			result = append(result, object)
		}
	}
	return result
}

func objectSliceOrEmpty(value any) []map[string]any {
	result := objectSlice(value)
	if result == nil {
		return []map[string]any{}
	}
	return result
}

func anySlice(value any) []any {
	if value == nil {
		return nil
	}
	if items, ok := value.([]any); ok {
		return items
	}
	return []any{value}
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case json.Number:
		return typed.String()
	case fmt.Stringer:
		return typed.String()
	case bool:
		if typed {
			return "True"
		}
		return "False"
	default:
		return fmt.Sprint(typed)
	}
}

func truthy(value any) bool {
	switch typed := value.(type) {
	case nil:
		return false
	case bool:
		return typed
	case string:
		return typed != ""
	case json.Number:
		f, err := typed.Float64()
		return err == nil && f != 0
	case []any:
		return len(typed) > 0
	case map[string]any:
		return len(typed) > 0
	default:
		return true
	}
}

func hasNonNullNonFalse(value any) bool {
	if value == nil {
		return false
	}
	if typed, ok := value.(bool); ok && !typed {
		return false
	}
	if typed, ok := value.(json.Number); ok && typed.String() == "0" {
		return false
	}
	return true
}

func stringSliceOrEmpty(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func sortedLowerHeaders(headers []string) string {
	seen := map[string]struct{}{}
	values := make([]string, 0, len(headers))
	for _, header := range headers {
		normalized := strings.ToLower(strings.TrimSpace(header))
		if normalized == "" {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		values = append(values, normalized)
	}
	sort.Strings(values)
	return strings.Join(values, ",")
}

func parseJSONNumberInt(value any) (int, bool) {
	switch typed := value.(type) {
	case int:
		return typed, true
	case json.Number:
		parsed, err := strconv.Atoi(typed.String())
		if err == nil {
			return parsed, true
		}
	}
	return 0, false
}
