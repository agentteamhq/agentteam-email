package atemail

type usageError struct {
	message string
	command commandName
}

func (e usageError) Error() string {
	return e.message
}

type agentMailError struct {
	message string
}

func (e agentMailError) Error() string {
	return e.message
}

type configError struct {
	message string
}

func (e configError) Error() string {
	return e.message
}

type agentCredentialRequiredError struct {
	message string
}

func (e agentCredentialRequiredError) Error() string {
	return e.message
}

type protocolError struct {
	message string
}

func (e protocolError) Error() string {
	return e.message
}

type transportError struct {
	message string
}

func (e transportError) Error() string {
	return e.message
}

func newUsageError(message string) error {
	return usageError{message: message}
}

func newCommandUsageError(command commandName, message string) error {
	return usageError{message: message, command: command}
}

func newAgentMailError(message string) error {
	return agentMailError{message: message}
}

func newConfigError(message string) error {
	return configError{message: message}
}

func newAgentCredentialRequiredError() error {
	return agentCredentialRequiredError{
		message: "missing local Agent Auth credential; run `at-email agent connect`, `at-email agent trial`, or `at-email agent enroll TOKEN` before using mailbox commands",
	}
}

func newProtocolError(message string) error {
	return protocolError{message: message}
}

func newTransportError(message string) error {
	return transportError{message: message}
}
