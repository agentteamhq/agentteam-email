// Package mailprovisioner mutates Agent Mail domain control state.
//
// This package owns active-domain registry apply/deactivate/reprovision
// primitives. Concrete Cloudflare and WildDuck side effects belong in their
// focused provisioning packages. Ordinary agent mailboxes, group/shared
// mailboxes, aliases, forwarding, and mailbox credentials are WildDuck
// primitives, not domain-control state owned by this provisioner.
package mailprovisioner
