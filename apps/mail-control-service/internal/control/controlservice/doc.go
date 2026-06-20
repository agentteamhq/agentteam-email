// Package controlservice composes the Agent Mail Control Service process.
//
// This package owns top-level service wiring, lifecycle, config loading, health
// aggregation, listener startup, and shutdown only. It wires runtime modules
// such as internal/modules/poller, internal/modules/smtprelay, and
// internal/control/feedbackrouter into one process while leaving their behavior
// in focused packages.
// Capability-specific logic belongs in focused internal packages.
package controlservice
