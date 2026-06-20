// Package wildduckprovisioner exposes Agent Mail-owned WildDuck primitives.
//
// This package is scoped to service-owned WildDuck setup required by Agent Mail
// itself, currently the structural feedback mailbox/address topology for active
// domains. It must not become a general mailbox, forwarding, filter, or token
// provisioning layer; those user-facing primitives belong outside this
// service-owned provisioner.
package wildduckprovisioner
