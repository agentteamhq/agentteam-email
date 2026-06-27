package atemail

import (
	"fmt"
	"net/url"
)

type queryParam struct {
	Key   string
	Value string
}

func encodeQuery(params []queryParam) string {
	values := url.Values{}
	for _, param := range params {
		values.Add(param.Key, param.Value)
	}
	return values.Encode()
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
