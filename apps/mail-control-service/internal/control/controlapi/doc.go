// Package controlapi implements the Agent Mail internal control API.
//
// This package owns HTTP routing, request and response DTOs, and API error
// mapping. The control API is deployment-internal; public ingress must terminate
// at the web server, which owns external authentication and authorization before
// calling these endpoints.
package controlapi
