// Package cloudflareprovisioner exposes Agent Mail Cloudflare primitives.
//
// This package owns live Worker status and Email Routing provision/status
// calls for managed mail domains. It does not run a background reconciler;
// callers invoke explicit primitives through the Control API.
package cloudflareprovisioner
