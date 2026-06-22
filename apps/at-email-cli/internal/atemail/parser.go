package atemail

import (
	"fmt"
	"strconv"
	"strings"
)

type commandName string

const (
	commandStatus     commandName = "status"
	commandInbox      commandName = "inbox"
	commandRead       commandName = "read"
	commandSearch     commandName = "search"
	commandMarkRead   commandName = "mark-read"
	commandArchive    commandName = "archive"
	commandSend       commandName = "send"
	commandReply      commandName = "reply"
	commandAuth       commandName = "auth"
	commandAuthLogin  commandName = "auth login"
	commandAuthStatus commandName = "auth status"
	commandAuthLogout commandName = "auth logout"
	commandVersion    commandName = "version"
	commandUpdate     commandName = "self-update"
	commandSkill      commandName = "skill"
)

type parsedArgs struct {
	Command commandName

	JSON      bool
	Folder    string
	Limit     int
	Unseen    bool
	MessageID int
	Query     string

	To         []string
	Cc         []string
	Bcc        []string
	ReplyTo    string
	Subject    string
	SubjectSet bool
	Body       *string
	BodyFile   string
	All        bool

	TargetVersion string

	AuthAction string
	APIBaseURL string
	Open       bool
}

type helpRequest struct {
	text string
}

func (h helpRequest) Error() string {
	return "help requested"
}

type noCommandError struct{}

func (e noCommandError) Error() string {
	return "no command"
}

func parseArgs(argv []string) (parsedArgs, error) {
	if len(argv) == 0 {
		return parsedArgs{}, noCommandError{}
	}
	if argv[0] == "-h" || argv[0] == "--help" {
		return parsedArgs{}, helpRequest{text: rootHelp()}
	}
	if argv[0] == "-v" || argv[0] == "-V" || argv[0] == "--version" {
		return parseVersion(argv[1:])
	}
	command := argv[0]
	rest := argv[1:]
	switch commandName(command) {
	case commandStatus:
		return parseStatus(rest)
	case commandInbox:
		return parseInbox(rest)
	case commandRead:
		return parseMessageCommand(commandRead, rest)
	case commandSearch:
		return parseSearch(rest)
	case commandMarkRead:
		return parseMessageCommand(commandMarkRead, rest)
	case commandArchive:
		return parseMessageCommand(commandArchive, rest)
	case commandSend:
		return parseSend(rest)
	case commandReply:
		return parseReply(rest)
	case commandAuth:
		return parseAuth(rest)
	case commandVersion:
		return parseVersion(rest)
	case commandUpdate:
		return parseSelfUpdate(rest)
	case commandSkill:
		return parseSkill(rest)
	default:
		return parsedArgs{}, newUsageError(fmt.Sprintf("argument COMMAND: invalid choice: %q", command))
	}
}

func parseStatus(argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: commandStatus}
	for i := 0; i < len(argv); i++ {
		switch argv[i] {
		case "-h", "--help":
			return parsedArgs{}, helpRequest{text: commandHelp(commandStatus)}
		case "--":
			if i+1 < len(argv) {
				return parsedArgs{}, unrecognized(commandStatus, argv[i+1:])
			}
			return args, nil
		case "--json":
			args.JSON = true
		default:
			return parsedArgs{}, unrecognized(commandStatus, argv[i:])
		}
	}
	return args, nil
}

func parseInbox(argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: commandInbox, Folder: "INBOX", Limit: 20}
	for i := 0; i < len(argv); i++ {
		token := argv[i]
		switch {
		case token == "-h" || token == "--help":
			return parsedArgs{}, helpRequest{text: commandHelp(commandInbox)}
		case token == "--":
			if i+1 < len(argv) {
				return parsedArgs{}, unrecognized(commandInbox, argv[i+1:])
			}
			return args, nil
		case token == "--json":
			args.JSON = true
		case token == "--unseen":
			args.Unseen = true
		case token == "--folder" || strings.HasPrefix(token, "--folder="):
			value, err := flagValue(commandInbox, argv, &i, "--folder")
			if err != nil {
				return parsedArgs{}, err
			}
			args.Folder = value
		case token == "--limit" || strings.HasPrefix(token, "--limit="):
			value, err := flagValue(commandInbox, argv, &i, "--limit")
			if err != nil {
				return parsedArgs{}, err
			}
			limit, err := positiveInt(value)
			if err != nil {
				return parsedArgs{}, newCommandUsageError(commandInbox, "argument --limit: "+err.Error())
			}
			args.Limit = limit
		default:
			return parsedArgs{}, unrecognized(commandInbox, argv[i:])
		}
	}
	return args, nil
}

func parseMessageCommand(command commandName, argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: command, Folder: "INBOX"}
	positionals := make([]string, 0, 1)
	parsingOptions := true
	for i := 0; i < len(argv); i++ {
		token := argv[i]
		switch {
		case parsingOptions && (token == "-h" || token == "--help"):
			return parsedArgs{}, helpRequest{text: commandHelp(command)}
		case parsingOptions && token == "--":
			parsingOptions = false
		case parsingOptions && token == "--json":
			args.JSON = true
		case parsingOptions && (token == "--folder" || strings.HasPrefix(token, "--folder=")):
			value, err := flagValue(command, argv, &i, "--folder")
			if err != nil {
				return parsedArgs{}, err
			}
			args.Folder = value
		case parsingOptions && strings.HasPrefix(token, "-") && !isNegativeNumber(token):
			return parsedArgs{}, unrecognized(command, argv[i:])
		default:
			positionals = append(positionals, token)
		}
	}
	if len(positionals) == 0 {
		return parsedArgs{}, newCommandUsageError(command, "the following arguments are required: message_id")
	}
	if len(positionals) > 1 {
		return parsedArgs{}, unrecognized(command, positionals[1:])
	}
	messageID, err := positiveInt(positionals[0])
	if err != nil {
		return parsedArgs{}, newCommandUsageError(command, "argument message_id: "+err.Error())
	}
	args.MessageID = messageID
	return args, nil
}

func parseSearch(argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: commandSearch, Limit: 20}
	positionals := make([]string, 0, 1)
	parsingOptions := true
	for i := 0; i < len(argv); i++ {
		token := argv[i]
		switch {
		case parsingOptions && (token == "-h" || token == "--help"):
			return parsedArgs{}, helpRequest{text: commandHelp(commandSearch)}
		case parsingOptions && token == "--":
			parsingOptions = false
		case parsingOptions && token == "--json":
			args.JSON = true
		case parsingOptions && (token == "--limit" || strings.HasPrefix(token, "--limit=")):
			value, err := flagValue(commandSearch, argv, &i, "--limit")
			if err != nil {
				return parsedArgs{}, err
			}
			limit, err := positiveInt(value)
			if err != nil {
				return parsedArgs{}, newCommandUsageError(commandSearch, "argument --limit: "+err.Error())
			}
			args.Limit = limit
		case parsingOptions && strings.HasPrefix(token, "-") && !isNegativeNumber(token):
			return parsedArgs{}, unrecognized(commandSearch, argv[i:])
		default:
			positionals = append(positionals, token)
		}
	}
	if len(positionals) == 0 {
		return parsedArgs{}, newCommandUsageError(commandSearch, "the following arguments are required: query")
	}
	if len(positionals) > 1 {
		return parsedArgs{}, unrecognized(commandSearch, positionals[1:])
	}
	args.Query = positionals[0]
	return args, nil
}

func parseSend(argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: commandSend}
	for i := 0; i < len(argv); i++ {
		token := argv[i]
		switch {
		case token == "-h" || token == "--help":
			return parsedArgs{}, helpRequest{text: commandHelp(commandSend)}
		case token == "--":
			if i+1 < len(argv) {
				return parsedArgs{}, unrecognized(commandSend, argv[i+1:])
			}
			i = len(argv)
		case token == "--json":
			args.JSON = true
		case token == "--to" || strings.HasPrefix(token, "--to="):
			value, err := flagValue(commandSend, argv, &i, "--to")
			if err != nil {
				return parsedArgs{}, err
			}
			args.To = append(args.To, value)
		case token == "--cc" || strings.HasPrefix(token, "--cc="):
			value, err := flagValue(commandSend, argv, &i, "--cc")
			if err != nil {
				return parsedArgs{}, err
			}
			args.Cc = append(args.Cc, value)
		case token == "--bcc" || strings.HasPrefix(token, "--bcc="):
			value, err := flagValue(commandSend, argv, &i, "--bcc")
			if err != nil {
				return parsedArgs{}, err
			}
			args.Bcc = append(args.Bcc, value)
		case token == "--reply-to" || strings.HasPrefix(token, "--reply-to="):
			value, err := flagValue(commandSend, argv, &i, "--reply-to")
			if err != nil {
				return parsedArgs{}, err
			}
			args.ReplyTo = value
		case token == "--subject" || strings.HasPrefix(token, "--subject="):
			value, err := flagValue(commandSend, argv, &i, "--subject")
			if err != nil {
				return parsedArgs{}, err
			}
			args.Subject = value
			args.SubjectSet = true
		case token == "--body" || strings.HasPrefix(token, "--body="):
			value, err := flagValue(commandSend, argv, &i, "--body")
			if err != nil {
				return parsedArgs{}, err
			}
			args.Body = &value
		case token == "--body-file" || strings.HasPrefix(token, "--body-file="):
			value, err := flagValue(commandSend, argv, &i, "--body-file")
			if err != nil {
				return parsedArgs{}, err
			}
			args.BodyFile = value
		default:
			return parsedArgs{}, unrecognized(commandSend, argv[i:])
		}
	}
	missing := make([]string, 0, 2)
	if len(args.To) == 0 {
		missing = append(missing, "--to")
	}
	if !args.SubjectSet {
		missing = append(missing, "--subject")
	}
	if len(missing) > 0 {
		return parsedArgs{}, newCommandUsageError(commandSend, "the following arguments are required: "+strings.Join(missing, ", "))
	}
	return args, nil
}

func parseReply(argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: commandReply, Folder: "INBOX"}
	positionals := make([]string, 0, 1)
	parsingOptions := true
	for i := 0; i < len(argv); i++ {
		token := argv[i]
		switch {
		case parsingOptions && (token == "-h" || token == "--help"):
			return parsedArgs{}, helpRequest{text: commandHelp(commandReply)}
		case parsingOptions && token == "--":
			parsingOptions = false
		case parsingOptions && token == "--json":
			args.JSON = true
		case parsingOptions && token == "--all":
			args.All = true
		case parsingOptions && (token == "--folder" || strings.HasPrefix(token, "--folder=")):
			value, err := flagValue(commandReply, argv, &i, "--folder")
			if err != nil {
				return parsedArgs{}, err
			}
			args.Folder = value
		case parsingOptions && (token == "--body" || strings.HasPrefix(token, "--body=")):
			value, err := flagValue(commandReply, argv, &i, "--body")
			if err != nil {
				return parsedArgs{}, err
			}
			args.Body = &value
		case parsingOptions && (token == "--body-file" || strings.HasPrefix(token, "--body-file=")):
			value, err := flagValue(commandReply, argv, &i, "--body-file")
			if err != nil {
				return parsedArgs{}, err
			}
			args.BodyFile = value
		case parsingOptions && strings.HasPrefix(token, "-") && !isNegativeNumber(token):
			return parsedArgs{}, unrecognized(commandReply, argv[i:])
		default:
			positionals = append(positionals, token)
		}
	}
	if len(positionals) == 0 {
		return parsedArgs{}, newCommandUsageError(commandReply, "the following arguments are required: message_id")
	}
	if len(positionals) > 1 {
		return parsedArgs{}, unrecognized(commandReply, positionals[1:])
	}
	messageID, err := positiveInt(positionals[0])
	if err != nil {
		return parsedArgs{}, newCommandUsageError(commandReply, "argument message_id: "+err.Error())
	}
	args.MessageID = messageID
	return args, nil
}

func parseAuth(argv []string) (parsedArgs, error) {
	if len(argv) == 0 {
		return parsedArgs{}, newCommandUsageError(commandAuth, "the following arguments are required: auth_command")
	}
	if argv[0] == "-h" || argv[0] == "--help" {
		return parsedArgs{}, helpRequest{text: commandHelp(commandAuth)}
	}
	action := argv[0]
	rest := argv[1:]
	switch action {
	case "login":
		return parseAuthLogin(rest)
	case "status":
		return parseAuthStatus(rest)
	case "logout":
		return parseAuthLogout(rest)
	default:
		return parsedArgs{}, newCommandUsageError(commandAuth, fmt.Sprintf("argument auth_command: invalid choice: %q", action))
	}
}

func parseAuthLogin(argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: commandAuth, AuthAction: "login"}
	for i := 0; i < len(argv); i++ {
		token := argv[i]
		switch {
		case token == "-h" || token == "--help":
			return parsedArgs{}, helpRequest{text: commandHelp(commandAuthLogin)}
		case token == "--":
			if i+1 < len(argv) {
				return parsedArgs{}, unrecognized(commandAuthLogin, argv[i+1:])
			}
			return args, nil
		case token == "--json":
			args.JSON = true
		case token == "--open":
			args.Open = true
		case token == "--api-base-url" || strings.HasPrefix(token, "--api-base-url="):
			value, err := flagValue(commandAuthLogin, argv, &i, "--api-base-url")
			if err != nil {
				return parsedArgs{}, err
			}
			args.APIBaseURL = value
		default:
			return parsedArgs{}, unrecognized(commandAuthLogin, argv[i:])
		}
	}
	return args, nil
}

func parseAuthStatus(argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: commandAuth, AuthAction: "status"}
	for i := 0; i < len(argv); i++ {
		switch argv[i] {
		case "-h", "--help":
			return parsedArgs{}, helpRequest{text: commandHelp(commandAuthStatus)}
		case "--":
			if i+1 < len(argv) {
				return parsedArgs{}, unrecognized(commandAuthStatus, argv[i+1:])
			}
			return args, nil
		case "--json":
			args.JSON = true
		default:
			return parsedArgs{}, unrecognized(commandAuthStatus, argv[i:])
		}
	}
	return args, nil
}

func parseAuthLogout(argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: commandAuth, AuthAction: "logout"}
	for i := 0; i < len(argv); i++ {
		switch argv[i] {
		case "-h", "--help":
			return parsedArgs{}, helpRequest{text: commandHelp(commandAuthLogout)}
		case "--":
			if i+1 < len(argv) {
				return parsedArgs{}, unrecognized(commandAuthLogout, argv[i+1:])
			}
			return args, nil
		case "--json":
			args.JSON = true
		default:
			return parsedArgs{}, unrecognized(commandAuthLogout, argv[i:])
		}
	}
	return args, nil
}

func parseVersion(argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: commandVersion}
	for i := 0; i < len(argv); i++ {
		switch argv[i] {
		case "-h", "--help":
			return parsedArgs{}, helpRequest{text: commandHelp(commandVersion)}
		case "--":
			if i+1 < len(argv) {
				return parsedArgs{}, unrecognized(commandVersion, argv[i+1:])
			}
			return args, nil
		case "--json":
			args.JSON = true
		default:
			return parsedArgs{}, unrecognized(commandVersion, argv[i:])
		}
	}
	return args, nil
}

func parseSelfUpdate(argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: commandUpdate}
	positionals := make([]string, 0, 1)
	parsingOptions := true
	for i := 0; i < len(argv); i++ {
		token := argv[i]
		switch {
		case parsingOptions && (token == "-h" || token == "--help"):
			return parsedArgs{}, helpRequest{text: commandHelp(commandUpdate)}
		case parsingOptions && token == "--":
			parsingOptions = false
		case parsingOptions && token == "--json":
			args.JSON = true
		case parsingOptions && strings.HasPrefix(token, "-"):
			return parsedArgs{}, unrecognized(commandUpdate, argv[i:])
		default:
			positionals = append(positionals, token)
		}
	}
	if len(positionals) > 1 {
		return parsedArgs{}, unrecognized(commandUpdate, positionals[1:])
	}
	if len(positionals) == 1 {
		args.TargetVersion = positionals[0]
	}
	return args, nil
}

func parseSkill(argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: commandSkill}
	for i := 0; i < len(argv); i++ {
		switch argv[i] {
		case "-h", "--help":
			return parsedArgs{}, helpRequest{text: commandHelp(commandSkill)}
		case "--":
			if i+1 < len(argv) {
				return parsedArgs{}, unrecognized(commandSkill, argv[i+1:])
			}
			return args, nil
		default:
			return parsedArgs{}, unrecognized(commandSkill, argv[i:])
		}
	}
	return args, nil
}

func flagValue(command commandName, argv []string, index *int, name string) (string, error) {
	token := argv[*index]
	if strings.HasPrefix(token, name+"=") {
		return strings.TrimPrefix(token, name+"="), nil
	}
	if *index+1 >= len(argv) {
		return "", newCommandUsageError(command, fmt.Sprintf("argument %s: expected one argument", name))
	}
	if optionLikeValue(argv[*index+1]) {
		return "", newCommandUsageError(command, fmt.Sprintf("argument %s: expected one argument", name))
	}
	*index++
	return argv[*index], nil
}

func positiveInt(value string) (int, error) {
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("invalid positive_int value: %q", value)
	}
	if parsed <= 0 {
		return 0, fmt.Errorf("value must be greater than zero")
	}
	return parsed, nil
}

func isNegativeNumber(value string) bool {
	if len(value) < 2 || value[0] != '-' || value[1] == '-' {
		return false
	}
	for _, char := range value[1:] {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
}

func optionLikeValue(value string) bool {
	if value == "-" {
		return false
	}
	return strings.HasPrefix(value, "-") && !isNegativeNumber(value)
}

func unrecognized(command commandName, values []string) error {
	return newCommandUsageError(command, "unrecognized arguments: "+strings.Join(values, " "))
}

func rootUsage() string {
	return "usage: at-email [-h] COMMAND ...\n"
}

func rootHelp() string {
	return rootUsage() + `
Work with an agent mailbox through the WildDuck API.

positional arguments:
  COMMAND
    status     Show configured mailbox status
    inbox      List recent messages in a mailbox
    read       Read one message
    search     Search messages
    mark-read  Mark one message as read
    archive    Move one message to Archive
    send       Send one email
    reply      Reply to one message
    auth       Authenticate the CLI with AgentTeam Email
    version    Print the at-email version
    self-update
              Update the at-email binary from GitHub Releases
    skill      Print the bundled Codex skill markdown

options:
  -h, --help   show this help message and exit
  -v, -V, --version
              show the at-email version and exit

configuration:
  Requires AT_EMAIL_WILDDUCK_API_BASE_URL, AT_EMAIL_WILDDUCK_ACCESS_TOKEN,
  and AT_EMAIL_WILDDUCK_USER_ID. Safe message reads also require
  AT_EMAIL_CONTROL_API_BASE_URL and AT_EMAIL_MESSAGE_READ_TOKEN. CLI auth uses
  https://app.agentteam.email by default and discovers /.well-known/at-email.json
  when available; set AT_EMAIL_API_BASE_URL for another app origin.

Examples:
  at-email status
  at-email inbox --unseen
  at-email auth login
  at-email send --to alice@example.net --subject Hello --body 'Hi there'
  at-email version
  at-email skill > at-email-cli/SKILL.md
`
}

func commandUsage(command commandName) string {
	switch command {
	case commandStatus:
		return "usage: at-email status [-h] [--json]\n"
	case commandInbox:
		return "usage: at-email inbox [-h] [--json] [--folder FOLDER] [--limit LIMIT] [--unseen]\n"
	case commandRead:
		return "usage: at-email read [-h] [--json] [--folder FOLDER] message_id\n"
	case commandSearch:
		return "usage: at-email search [-h] [--json] [--limit LIMIT] query\n"
	case commandMarkRead:
		return "usage: at-email mark-read [-h] [--json] [--folder FOLDER] message_id\n"
	case commandArchive:
		return "usage: at-email archive [-h] [--json] [--folder FOLDER] message_id\n"
	case commandSend:
		return "usage: at-email send [-h] [--json] --to TO [--cc CC] [--bcc BCC] [--reply-to REPLY_TO] --subject SUBJECT [--body BODY | --body-file PATH]\n"
	case commandReply:
		return "usage: at-email reply [-h] [--json] [--folder FOLDER] [--all] [--body BODY | --body-file PATH] message_id\n"
	case commandAuth:
		return "usage: at-email auth [-h] AUTH_COMMAND ...\n"
	case commandAuthLogin:
		return "usage: at-email auth login [-h] [--json] [--api-base-url URL] [--open]\n"
	case commandAuthStatus:
		return "usage: at-email auth status [-h] [--json]\n"
	case commandAuthLogout:
		return "usage: at-email auth logout [-h] [--json]\n"
	case commandVersion:
		return "usage: at-email version [-h] [--json]\n"
	case commandUpdate:
		return "usage: at-email self-update [-h] [--json] [version]\n"
	case commandSkill:
		return "usage: at-email skill [-h]\n"
	default:
		return rootUsage()
	}
}

func commandHelp(command commandName) string {
	switch command {
	case commandStatus:
		return commandUsage(commandStatus) + `
Show configured mailbox status and mailbox folder counters.

options:
  -h, --help  show this help message and exit
  --json      write machine-readable JSON to stdout

defaults:
  Prints a concise text status summary unless --json is set.

configuration:
  Requires AT_EMAIL_WILDDUCK_API_BASE_URL, AT_EMAIL_WILDDUCK_ACCESS_TOKEN,
  and AT_EMAIL_WILDDUCK_USER_ID. AT_EMAIL_MAILBOX_ADDRESS is shown when set.

Examples:
  at-email status
  at-email status --json
`
	case commandInbox:
		return commandUsage(commandInbox) + `
List recent messages in a mailbox.

options:
  -h, --help       show this help message and exit
  --json           write machine-readable JSON to stdout
  --folder FOLDER  mailbox folder to list (default: INBOX)
  --limit LIMIT    maximum messages to return (default: 20)
  --unseen         show only unread messages

configuration:
  Requires AT_EMAIL_WILDDUCK_API_BASE_URL, AT_EMAIL_WILDDUCK_ACCESS_TOKEN,
  and AT_EMAIL_WILDDUCK_USER_ID.

Examples:
  at-email inbox
  at-email inbox --unseen
  at-email inbox --folder Archive --limit 10 --json
`
	case commandRead:
		return commandUsage(commandRead) + `
Read one message through the safe message-read Control API.

positional arguments:
  message_id        positive WildDuck message UID in the selected folder

options:
  -h, --help       show this help message and exit
  --json           write machine-readable JSON to stdout
  --folder FOLDER  mailbox folder to read from (default: INBOX)

configuration:
  Requires AT_EMAIL_WILDDUCK_API_BASE_URL, AT_EMAIL_WILDDUCK_ACCESS_TOKEN,
  AT_EMAIL_WILDDUCK_USER_ID, AT_EMAIL_CONTROL_API_BASE_URL, and
  AT_EMAIL_MESSAGE_READ_TOKEN.

Examples:
  at-email read 7
  at-email read --folder Archive 7
  at-email read 7 --json
`
	case commandSearch:
		return commandUsage(commandSearch) + `
Search messages across the mailbox.

positional arguments:
  query            search text to send to WildDuck

options:
  -h, --help       show this help message and exit
  --json           write machine-readable JSON to stdout
  --limit LIMIT    maximum messages to return (default: 20)

configuration:
  Requires AT_EMAIL_WILDDUCK_API_BASE_URL, AT_EMAIL_WILDDUCK_ACCESS_TOKEN,
  and AT_EMAIL_WILDDUCK_USER_ID.

Examples:
  at-email search invoice
  at-email search 'from:alice@example.net' --limit 5
  at-email search invoice --json
`
	case commandMarkRead:
		return commandUsage(commandMarkRead) + `
Mark one message as read.

positional arguments:
  message_id        positive WildDuck message UID in the selected folder

options:
  -h, --help       show this help message and exit
  --json           write machine-readable JSON to stdout
  --folder FOLDER  mailbox folder containing the message (default: INBOX)

configuration:
  Requires AT_EMAIL_WILDDUCK_API_BASE_URL, AT_EMAIL_WILDDUCK_ACCESS_TOKEN,
  and AT_EMAIL_WILDDUCK_USER_ID.

Examples:
  at-email mark-read 7
  at-email mark-read --folder Archive 7
  at-email mark-read 7 --json
`
	case commandArchive:
		return commandUsage(commandArchive) + `
Move one message to the Archive mailbox.

positional arguments:
  message_id        positive WildDuck message UID in the selected folder

options:
  -h, --help       show this help message and exit
  --json           write machine-readable JSON to stdout
  --folder FOLDER  source mailbox folder (default: INBOX)

configuration:
  Requires AT_EMAIL_WILDDUCK_API_BASE_URL, AT_EMAIL_WILDDUCK_ACCESS_TOKEN,
  and AT_EMAIL_WILDDUCK_USER_ID.

Examples:
  at-email archive 7
  at-email archive --folder INBOX 7
  at-email archive 7 --json
`
	case commandSend:
		return commandUsage(commandSend) + `
Send one email.

required options:
  --to TO           recipient address; repeat for multiple recipients
  --subject SUBJECT
                    message subject; use --subject= to send an empty subject

options:
  -h, --help        show this help message and exit
  --json            write machine-readable JSON to stdout
  --cc CC           carbon-copy recipient; repeat for multiple recipients
  --bcc BCC         blind-carbon-copy recipient; repeat for multiple recipients
  --reply-to REPLY_TO
                    Reply-To address
  --body BODY       message body text
  --body-file PATH  read message body text from a UTF-8 file

defaults:
  Reads the body from stdin when --body and --body-file are omitted.

configuration:
  Requires AT_EMAIL_WILDDUCK_API_BASE_URL, AT_EMAIL_WILDDUCK_ACCESS_TOKEN,
  and AT_EMAIL_WILDDUCK_USER_ID.

Examples:
  at-email send --to alice@example.net --subject Hello --body 'Hi there'
  at-email send --to alice@example.net --subject= --body 'No subject'
  at-email send --to alice@example.net --subject Report --body-file message.txt --json
`
	case commandReply:
		return commandUsage(commandReply) + `
Reply to one message.

positional arguments:
  message_id        positive WildDuck message UID in the selected folder

options:
  -h, --help        show this help message and exit
  --json            write machine-readable JSON to stdout
  --folder FOLDER   source mailbox folder (default: INBOX)
  --all             include original To and Cc recipients except the configured mailbox
  --body BODY       reply body text
  --body-file PATH  read reply body text from a UTF-8 file

defaults:
  Replies to Reply-To when present, otherwise From. Reads the body from stdin
  when --body and --body-file are omitted.

configuration:
  Requires AT_EMAIL_WILDDUCK_API_BASE_URL, AT_EMAIL_WILDDUCK_ACCESS_TOKEN,
  and AT_EMAIL_WILDDUCK_USER_ID. AT_EMAIL_MAILBOX_ADDRESS is used to avoid
  replying to the mailbox itself when set.

Examples:
  at-email reply 7 --body 'Thanks, received.'
  at-email reply 7 --all --body-file reply.txt
  at-email reply --folder Archive 7 --json
`
	case commandAuth:
		return commandUsage(commandAuth) + `
Authenticate at-email with AgentTeam Email.

auth commands:
  login   Start a Better Auth device login and store the CLI session locally
  status  Show the current CLI authentication state
  logout  Revoke the current CLI session and remove the local credential

options:
  -h, --help  show this help message and exit

configuration:
  Uses https://app.agentteam.email by default and discovers
  /.well-known/at-email.json when available. Set AT_EMAIL_API_BASE_URL to use
  another app origin.

Examples:
  at-email auth login
  at-email auth status
  at-email auth logout
`
	case commandAuthLogin:
		return commandUsage(commandAuthLogin) + `
Start a Better Auth device login and store the at-email session locally.

options:
  -h, --help          show this help message and exit
  --json              write machine-readable JSON to stdout
  --api-base-url URL  app origin to authenticate against
  --open             open the verification URL in a browser in text mode

defaults:
  Prints the verification URL and code, then waits until the request is
  approved or denied. Use --open to also launch the browser in text mode.

configuration:
  Uses https://app.agentteam.email by default and discovers
  /.well-known/at-email.json when available. Set AT_EMAIL_API_BASE_URL to use
  another app origin.

Examples:
  at-email auth login
  at-email auth login --open
  at-email auth login --api-base-url http://localhost:4321 --json
`
	case commandAuthStatus:
		return commandUsage(commandAuthStatus) + `
Show the current CLI authentication state.

options:
  -h, --help  show this help message and exit
  --json      write machine-readable JSON to stdout

configuration:
  Reads the local at-email auth file created by at-email auth login.

Examples:
  at-email auth status
  at-email auth status --json
`
	case commandAuthLogout:
		return commandUsage(commandAuthLogout) + `
Revoke the current CLI session and remove the local credential.

options:
  -h, --help  show this help message and exit
  --json      write machine-readable JSON to stdout

configuration:
  Reads the local at-email auth file created by at-email auth login.

Examples:
  at-email auth logout
  at-email auth logout --json
`
	case commandVersion:
		return commandUsage(commandVersion) + `
Print the current at-email version.

options:
  -h, --help  show this help message and exit
  --json      write machine-readable JSON to stdout

configuration:
  No mailbox runtime configuration is required.

Examples:
  at-email version
  at-email --version
  at-email version --json
`
	case commandUpdate:
		return commandUsage(commandUpdate) + `
Download and replace the current at-email binary with the latest GitHub Release
or a specific release version.

positional arguments:
  version      optional release tag such as v1.2.3

options:
  -h, --help  show this help message and exit
  --json      write machine-readable JSON to stdout

configuration:
  No mailbox runtime configuration is required. Release assets are downloaded
  from github.com/agentteamhq/agentteam-email and verified with checksums.txt.

Examples:
  at-email self-update
  at-email self-update v1.2.3
  at-email self-update 1.2.3 --json
`
	case commandSkill:
		return commandUsage(commandSkill) + `
Print the bundled Codex skill markdown for operating the at-email CLI.

options:
  -h, --help  show this help message and exit

configuration:
  No mailbox runtime configuration is required.

Examples:
  at-email skill
  at-email skill > at-email-cli/SKILL.md

Pipe stdout to the SKILL.md destination for the runtime that should install it.
`
	default:
		return fmt.Sprintf("%s\nRun `at-email %s --help` for command options.\n", rootUsage(), command)
	}
}
