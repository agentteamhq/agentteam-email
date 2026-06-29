package structured

import (
	"fmt"
	"strings"

	"github.com/miekg/dns"
	moxmessage "github.com/mjl-/mox/message"
	goaddr "github.com/zostay/go-addr/pkg/addr"
	"golang.org/x/net/idna"
)

type Mailbox struct {
	Address   string
	LocalPart string
	Domain    string
}

func BuildAddrSpec(localPart string, domainValue string) (string, error) {
	if localPart == "" {
		return "", fmt.Errorf("address local-part is required")
	}
	domain, err := CanonicalDomain(domainValue)
	if err != nil {
		return "", err
	}
	if domain == "" {
		return "", fmt.Errorf("address domain is required")
	}
	addr := goaddr.NewAddrSpec(localPart, domain)
	normalized, err := NormalizeMailbox(addr.CleanString())
	if err != nil {
		return "", err
	}
	return normalized, nil
}

func ParseMailbox(value string) (Mailbox, error) {
	parsed, err := parseAddrMailbox(value)
	if err == nil {
		return parsed, nil
	}
	fallback, fallbackErr := parseMessageMailbox(value)
	if fallbackErr == nil {
		return fallback, nil
	}
	return Mailbox{}, fmt.Errorf("parse mailbox: %w", err)
}

func parseAddrMailbox(value string) (Mailbox, error) {
	mailbox, err := goaddr.ParseEmailMailbox(value)
	if err != nil {
		return Mailbox{}, err
	}
	spec := mailbox.AddrSpec()
	domain, err := CanonicalDomain(spec.Domain())
	if err != nil {
		return Mailbox{}, fmt.Errorf("canonical mailbox domain: %w", err)
	}
	if domain == "" {
		return Mailbox{}, fmt.Errorf("mailbox domain is required")
	}
	address := strings.ToLower(spec.CleanString())
	if address == "" {
		return Mailbox{}, fmt.Errorf("mailbox address is required")
	}
	return Mailbox{
		Address:   address,
		LocalPart: spec.LocalPart(),
		Domain:    domain,
	}, nil
}

func parseMessageMailbox(value string) (Mailbox, error) {
	addrs, err := moxmessage.ParseAddressList(value)
	if err != nil {
		return Mailbox{}, err
	}
	if len(addrs) != 1 {
		return Mailbox{}, fmt.Errorf("mailbox must contain exactly one address")
	}
	addr := addrs[0]
	if addr.User == "" {
		return Mailbox{}, fmt.Errorf("mailbox local-part is required")
	}
	if addr.Host == "" {
		return Mailbox{}, fmt.Errorf("mailbox domain is required")
	}
	return parseAddrMailbox(addr.User + "@" + addr.Host)
}

func NormalizeMailbox(value string) (string, error) {
	mailbox, err := ParseMailbox(value)
	if err != nil {
		return "", err
	}
	return mailbox.Address, nil
}

func DomainFromMailbox(value string) (string, error) {
	mailbox, err := ParseMailbox(value)
	if err != nil {
		return "", err
	}
	return mailbox.Domain, nil
}

func DomainFromAddrSpec(value string) (string, error) {
	addr, err := goaddr.ParseEmailAddrSpec(value)
	if err != nil {
		return "", fmt.Errorf("parse address domain: %w", err)
	}
	domain, err := CanonicalDomain(addr.Domain())
	if err != nil {
		return "", err
	}
	if domain == "" {
		return "", fmt.Errorf("address domain is required")
	}
	return domain, nil
}

func CanonicalDomain(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	ascii, err := idna.Lookup.ToASCII(value)
	if err != nil {
		return "", fmt.Errorf("idna domain: %w", err)
	}
	if ascii == "" {
		return "", nil
	}
	if dns.IsFqdn(ascii) {
		return "", fmt.Errorf("domain must be a relative DNS name")
	}
	fqdn := dns.Fqdn(ascii)
	if _, ok := dns.IsDomainName(fqdn); !ok {
		return "", fmt.Errorf("domain is not a valid DNS name")
	}
	labels := dns.SplitDomainName(dns.CanonicalName(fqdn))
	if len(labels) == 0 {
		return "", fmt.Errorf("domain must contain at least one label")
	}
	return strings.Join(labels, "."), nil
}
