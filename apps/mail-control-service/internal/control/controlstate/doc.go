// Package controlstate owns Agent Mail control-plane state access.
//
// This package is for Kubernetes-native active-domain control state: desired
// hashes, realized primitive bindings, and primitive status. It does not store
// ordinary mailbox desired state and does not replace the poller Mongo
// queue/state store owned by internal/modules/poller.
package controlstate
