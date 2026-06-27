// Package controlstate owns Agent Mail active-domain runtime projection state.
//
// The web server and MongoDB are the authoritative source. Mail-control keeps
// this projection in memory for routing, replay, relay, feedback, and status.
// It does not store ordinary mailbox desired state and does not replace the
// poller Mongo queue/state store owned by internal/modules/poller.
package controlstate
