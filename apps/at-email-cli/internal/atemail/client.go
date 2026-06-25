package atemail

import (
	"fmt"
	"net/url"
	"strings"
)

type queryParam struct {
	Key   string
	Value string
}

func encodeQuery(params []queryParam) string {
	values := make([]string, 0, len(params))
	for _, param := range params {
		values = append(values, url.QueryEscape(param.Key)+"="+url.QueryEscape(param.Value))
	}
	return strings.Join(values, "&")
}

func newServiceTransportError(service string, action string) error {
	return newTransportError(fmt.Sprintf("%s service unavailable while %s", service, action))
}

type outboundMessage struct {
	To        []string
	Cc        []string
	Bcc       []string
	Subject   *string
	Text      string
	ReplyTo   string
	Reference map[string]any
}
