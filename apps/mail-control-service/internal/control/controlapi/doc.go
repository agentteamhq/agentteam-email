// Package controlapi implements the Agent Mail authenticated control API.
//
// This package owns HTTP routing, bearer-token authentication, request and
// response DTOs, and API error mapping. It delegates provisioning and mutation
// to focused service packages.
package controlapi
