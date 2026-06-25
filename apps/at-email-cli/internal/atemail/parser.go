package atemail

import (
	"fmt"
	"strconv"
	"strings"
)

type commandName string

const (
	commandStatus          commandName = "status"
	commandInbox           commandName = "inbox"
	commandRead            commandName = "read"
	commandSearch          commandName = "search"
	commandMarkRead        commandName = "mark-read"
	commandArchive         commandName = "archive"
	commandSend            commandName = "send"
	commandReply           commandName = "reply"
	commandPaperclipTool   commandName = "paperclip-tool"
	commandAuth            commandName = "auth"
	commandAuthLogin       commandName = "auth login"
	commandAuthStatus      commandName = "auth status"
	commandAuthLogout      commandName = "auth logout"
	commandAgent           commandName = "agent"
	commandAgentConnect    commandName = "agent connect"
	commandAgentTrial      commandName = "agent trial"
	commandAgentEnroll     commandName = "agent enroll"
	commandAgentStatus     commandName = "agent status"
	commandAgentDisconnect commandName = "agent disconnect"
	commandVersion         commandName = "version"
	commandUpdate          commandName = "self-update"
	commandSkill           commandName = "skill"
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

	AuthAction                 string
	AgentAction                string
	AgentCapabilities          []string
	AgentPostClaimCapabilities []string
	AgentReason                string
	AgentName                  string
	AgentToken                 string
	APIBaseURL                 string
	Device                     bool
	Force                      bool
	MailboxAddress             string
	NoOpen                     bool
	Open                       bool
	OrganizationID             string
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
	case commandPaperclipTool:
		return parsePaperclipTool(rest)
	case commandAuth:
		return parseAuth(rest)
	case commandAgent:
		return parseAgent(rest)
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

func parsePaperclipTool(argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: commandPaperclipTool, JSON: true}
	for i := 0; i < len(argv); i++ {
		switch argv[i] {
		case "-h", "--help":
			return parsedArgs{}, helpRequest{text: commandHelp(commandPaperclipTool)}
		case "--":
			if i+1 < len(argv) {
				return parsedArgs{}, unrecognized(commandPaperclipTool, argv[i+1:])
			}
			return args, nil
		case "--json":
			args.JSON = true
		default:
			return parsedArgs{}, unrecognized(commandPaperclipTool, argv[i:])
		}
	}
	return args, nil
}

func parseAgent(argv []string) (parsedArgs, error) {
	if len(argv) == 0 {
		return parsedArgs{}, newCommandUsageError(commandAgent, "the following arguments are required: agent_command")
	}
	if argv[0] == "-h" || argv[0] == "--help" {
		return parsedArgs{}, helpRequest{text: commandHelp(commandAgent)}
	}
	action := argv[0]
	rest := argv[1:]
	switch action {
	case "connect":
		return parseAgentConnect(rest)
	case "trial":
		return parseAgentTrial(rest)
	case "enroll":
		return parseAgentEnroll(rest)
	case "status":
		return parseAgentStatus(rest)
	case "disconnect":
		return parseAgentDisconnect(rest)
	default:
		return parsedArgs{}, newCommandUsageError(commandAgent, fmt.Sprintf("argument agent_command: invalid choice: %q", action))
	}
}

func parseAgentConnect(argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: commandAgent, AgentAction: "connect"}
	for i := 0; i < len(argv); i++ {
		token := argv[i]
		switch {
		case token == "-h" || token == "--help":
			return parsedArgs{}, helpRequest{text: commandHelp(commandAgentConnect)}
		case token == "--":
			if i+1 < len(argv) {
				return parsedArgs{}, unrecognized(commandAgentConnect, argv[i+1:])
			}
			return args, nil
		case token == "--json":
			args.JSON = true
		case token == "--force":
			args.Force = true
		case token == "--device":
			args.Device = true
		case token == "--no-open":
			args.NoOpen = true
		case token == "--api-base-url" || strings.HasPrefix(token, "--api-base-url="):
			value, err := flagValue(commandAgentConnect, argv, &i, "--api-base-url")
			if err != nil {
				return parsedArgs{}, err
			}
			args.APIBaseURL = value
		case token == "--name" || strings.HasPrefix(token, "--name="):
			value, err := flagValue(commandAgentConnect, argv, &i, "--name")
			if err != nil {
				return parsedArgs{}, err
			}
			args.AgentName = value
		case token == "--reason" || strings.HasPrefix(token, "--reason="):
			value, err := flagValue(commandAgentConnect, argv, &i, "--reason")
			if err != nil {
				return parsedArgs{}, err
			}
			args.AgentReason = value
		case token == "--capability" || strings.HasPrefix(token, "--capability="):
			value, err := flagValue(commandAgentConnect, argv, &i, "--capability")
			if err != nil {
				return parsedArgs{}, err
			}
			args.AgentCapabilities = append(args.AgentCapabilities, value)
		case token == "--mailbox-address" || strings.HasPrefix(token, "--mailbox-address="):
			value, err := flagValue(commandAgentConnect, argv, &i, "--mailbox-address")
			if err != nil {
				return parsedArgs{}, err
			}
			args.MailboxAddress = value
		case token == "--organization-id" || strings.HasPrefix(token, "--organization-id="):
			value, err := flagValue(commandAgentConnect, argv, &i, "--organization-id")
			if err != nil {
				return parsedArgs{}, err
			}
			args.OrganizationID = value
		default:
			return parsedArgs{}, unrecognized(commandAgentConnect, argv[i:])
		}
	}
	return args, nil
}

func parseAgentTrial(argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: commandAgent, AgentAction: "trial"}
	for i := 0; i < len(argv); i++ {
		token := argv[i]
		switch {
		case token == "-h" || token == "--help":
			return parsedArgs{}, helpRequest{text: commandHelp(commandAgentTrial)}
		case token == "--":
			if i+1 < len(argv) {
				return parsedArgs{}, unrecognized(commandAgentTrial, argv[i+1:])
			}
			return args, nil
		case token == "--json":
			args.JSON = true
		case token == "--force":
			args.Force = true
		case token == "--api-base-url" || strings.HasPrefix(token, "--api-base-url="):
			value, err := flagValue(commandAgentTrial, argv, &i, "--api-base-url")
			if err != nil {
				return parsedArgs{}, err
			}
			args.APIBaseURL = value
		case token == "--name" || strings.HasPrefix(token, "--name="):
			value, err := flagValue(commandAgentTrial, argv, &i, "--name")
			if err != nil {
				return parsedArgs{}, err
			}
			args.AgentName = value
		case token == "--capability" || strings.HasPrefix(token, "--capability="):
			value, err := flagValue(commandAgentTrial, argv, &i, "--capability")
			if err != nil {
				return parsedArgs{}, err
			}
			args.AgentCapabilities = append(args.AgentCapabilities, value)
		case token == "--post-claim-capability" || strings.HasPrefix(token, "--post-claim-capability="):
			value, err := flagValue(commandAgentTrial, argv, &i, "--post-claim-capability")
			if err != nil {
				return parsedArgs{}, err
			}
			args.AgentPostClaimCapabilities = append(args.AgentPostClaimCapabilities, value)
		default:
			return parsedArgs{}, unrecognized(commandAgentTrial, argv[i:])
		}
	}
	return args, nil
}

func parseAgentEnroll(argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: commandAgent, AgentAction: "enroll"}
	positionals := make([]string, 0, 1)
	parsingOptions := true
	for i := 0; i < len(argv); i++ {
		token := argv[i]
		switch {
		case parsingOptions && (token == "-h" || token == "--help"):
			return parsedArgs{}, helpRequest{text: commandHelp(commandAgentEnroll)}
		case parsingOptions && token == "--":
			parsingOptions = false
		case parsingOptions && token == "--json":
			args.JSON = true
		case parsingOptions && token == "--force":
			args.Force = true
		case parsingOptions && (token == "--api-base-url" || strings.HasPrefix(token, "--api-base-url=")):
			value, err := flagValue(commandAgentEnroll, argv, &i, "--api-base-url")
			if err != nil {
				return parsedArgs{}, err
			}
			args.APIBaseURL = value
		case parsingOptions && (token == "--name" || strings.HasPrefix(token, "--name=")):
			value, err := flagValue(commandAgentEnroll, argv, &i, "--name")
			if err != nil {
				return parsedArgs{}, err
			}
			args.AgentName = value
		case parsingOptions && strings.HasPrefix(token, "-"):
			return parsedArgs{}, unrecognized(commandAgentEnroll, argv[i:])
		default:
			positionals = append(positionals, token)
		}
	}
	if len(positionals) == 0 {
		return parsedArgs{}, newCommandUsageError(commandAgentEnroll, "the following arguments are required: enrollment_token")
	}
	if len(positionals) > 1 {
		return parsedArgs{}, unrecognized(commandAgentEnroll, positionals[1:])
	}
	args.AgentToken = positionals[0]
	return args, nil
}

func parseAgentStatus(argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: commandAgent, AgentAction: "status"}
	for i := 0; i < len(argv); i++ {
		switch argv[i] {
		case "-h", "--help":
			return parsedArgs{}, helpRequest{text: commandHelp(commandAgentStatus)}
		case "--":
			if i+1 < len(argv) {
				return parsedArgs{}, unrecognized(commandAgentStatus, argv[i+1:])
			}
			return args, nil
		case "--json":
			args.JSON = true
		default:
			return parsedArgs{}, unrecognized(commandAgentStatus, argv[i:])
		}
	}
	return args, nil
}

func parseAgentDisconnect(argv []string) (parsedArgs, error) {
	args := parsedArgs{Command: commandAgent, AgentAction: "disconnect"}
	for i := 0; i < len(argv); i++ {
		switch argv[i] {
		case "-h", "--help":
			return parsedArgs{}, helpRequest{text: commandHelp(commandAgentDisconnect)}
		case "--":
			if i+1 < len(argv) {
				return parsedArgs{}, unrecognized(commandAgentDisconnect, argv[i+1:])
			}
			return args, nil
		case "--json":
			args.JSON = true
		default:
			return parsedArgs{}, unrecognized(commandAgentDisconnect, argv[i:])
		}
	}
	return args, nil
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
		case token == "--device":
			args.Device = true
		case token == "--no-open":
			args.NoOpen = true
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
Work with an agent mailbox through the AgentTeam Email webserver.

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
    agent      Manage local Agent Auth credentials
    version    Print the at-email version
    self-update
              Update the at-email binary from GitHub Releases
    skill      Print the bundled Codex skill markdown

options:
  -h, --help   show this help message and exit
  -v, -V, --version
              show the at-email version and exit

configuration:
	Mailbox commands require a local Agent Auth credential created by
  at-email agent connect, at-email agent trial, or at-email agent enroll TOKEN.
  They sign requests to the webserver and never use WildDuck or mail-control
  credentials. CLI auth uses
  https://app.agentteam.email by default and discovers
  /.well-known/at-email.json when available; set AT_EMAIL_API_BASE_URL for
  another app origin.

Examples:
  at-email status
  at-email inbox --unseen
  at-email auth login
  at-email agent connect
  at-email agent trial
  at-email agent enroll TOKEN
  at-email agent status
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
	case commandPaperclipTool:
		return "usage: at-email paperclip-tool [-h] [--json]\n"
	case commandAuth:
		return "usage: at-email auth [-h] AUTH_COMMAND ...\n"
	case commandAuthLogin:
		return "usage: at-email auth login [-h] [--json] [--api-base-url URL] [--device] [--no-open] [--open]\n"
	case commandAuthStatus:
		return "usage: at-email auth status [-h] [--json]\n"
	case commandAuthLogout:
		return "usage: at-email auth logout [-h] [--json]\n"
	case commandAgent:
		return "usage: at-email agent [-h] AGENT_COMMAND ...\n"
	case commandAgentConnect:
		return "usage: at-email agent connect [-h] [--json] [--force] [--api-base-url URL] [--name NAME] [--capability CAPABILITY] [--mailbox-address ADDRESS] [--organization-id ORGANIZATION_ID] [--reason REASON] [--device] [--no-open]\n"
	case commandAgentTrial:
		return "usage: at-email agent trial [-h] [--json] [--force] [--api-base-url URL] [--name NAME] [--capability CAPABILITY] [--post-claim-capability CAPABILITY]\n"
	case commandAgentEnroll:
		return "usage: at-email agent enroll [-h] [--json] [--force] [--api-base-url URL] [--name NAME] enrollment_token\n"
	case commandAgentStatus:
		return "usage: at-email agent status [-h] [--json]\n"
	case commandAgentDisconnect:
		return "usage: at-email agent disconnect [-h] [--json]\n"
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
  Requires a local Agent Auth credential created by at-email agent connect,
  at-email agent trial, or at-email agent enroll.
  AT_EMAIL_MAILBOX_ADDRESS selects and displays a specific authorized mailbox
  when set.

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
  Requires a local Agent Auth credential created by at-email agent connect,
  at-email agent trial, or at-email agent enroll.

Examples:
  at-email inbox
  at-email inbox --unseen
  at-email inbox --folder Archive --limit 10 --json
`
	case commandRead:
		return commandUsage(commandRead) + `
Read one message through the AgentTeam Email webserver.

positional arguments:
  message_id        positive message UID in the selected folder

options:
  -h, --help       show this help message and exit
  --json           write machine-readable JSON to stdout
  --folder FOLDER  mailbox folder to read from (default: INBOX)

configuration:
  Requires a local Agent Auth credential created by at-email agent connect,
  at-email agent trial, or at-email agent enroll.

Examples:
  at-email read 7
  at-email read --folder Archive 7
  at-email read 7 --json
`
	case commandSearch:
		return commandUsage(commandSearch) + `
Search messages across the mailbox.

positional arguments:
  query            search text to send through the webserver

options:
  -h, --help       show this help message and exit
  --json           write machine-readable JSON to stdout
  --limit LIMIT    maximum messages to return (default: 20)

configuration:
  Requires a local Agent Auth credential created by at-email agent connect,
  at-email agent trial, or at-email agent enroll.

Examples:
  at-email search invoice
  at-email search 'from:alice@example.net' --limit 5
  at-email search invoice --json
`
	case commandMarkRead:
		return commandUsage(commandMarkRead) + `
Mark one message as read.

positional arguments:
  message_id        positive message UID in the selected folder

options:
  -h, --help       show this help message and exit
  --json           write machine-readable JSON to stdout
  --folder FOLDER  mailbox folder containing the message (default: INBOX)

configuration:
  Requires a local Agent Auth credential created by at-email agent connect,
  at-email agent trial, or at-email agent enroll.

Examples:
  at-email mark-read 7
  at-email mark-read --folder Archive 7
  at-email mark-read 7 --json
`
	case commandArchive:
		return commandUsage(commandArchive) + `
Move one message to the Archive mailbox.

positional arguments:
  message_id        positive message UID in the selected folder

options:
  -h, --help       show this help message and exit
  --json           write machine-readable JSON to stdout
  --folder FOLDER  source mailbox folder (default: INBOX)

configuration:
  Requires a local Agent Auth credential created by at-email agent connect,
  at-email agent trial, or at-email agent enroll.

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
  Requires a local Agent Auth credential created by at-email agent connect,
  at-email agent trial, or at-email agent enroll.

Examples:
  at-email send --to alice@example.net --subject Hello --body 'Hi there'
  at-email send --to alice@example.net --subject= --body 'No subject'
  at-email send --to alice@example.net --subject Report --body-file message.txt --json
`
	case commandReply:
		return commandUsage(commandReply) + `
Reply to one message.

positional arguments:
  message_id        positive message UID in the selected folder

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
  Requires a local Agent Auth credential created by at-email agent connect,
  at-email agent trial, or at-email agent enroll.
  AT_EMAIL_MAILBOX_ADDRESS selects an authorized mailbox and is used to avoid
  replying to the mailbox itself when set.

Examples:
  at-email reply 7 --body 'Thanks, received.'
  at-email reply 7 --all --body-file reply.txt
  at-email reply --folder Archive 7 --json
`
	case commandPaperclipTool:
		return commandUsage(commandPaperclipTool) + `
Run one Paperclip email tool envelope from stdin.

options:
  -h, --help        show this help message and exit
  --json            write the Paperclip tool result JSON to stdout

configuration:
  Requires a local Agent Auth credential created by at-email agent connect,
  at-email agent trial, or at-email agent enroll.

Examples:
  at-email paperclip-tool --json < envelope.json
`
	case commandAuth:
		return commandUsage(commandAuth) + `
Authenticate at-email with AgentTeam Email.

auth commands:
  login   Open a Better Auth login and store the CLI session locally
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
Open a browser for Better Auth login and store the at-email session locally.

options:
  -h, --help          show this help message and exit
  --json              write machine-readable JSON to stdout
  --api-base-url URL  app origin to authenticate against
  --device            print the verification URL and code without opening a browser
  --no-open           print the complete verification URL without opening a browser
  --open              accepted for compatibility; text mode opens by default

defaults:
  Opens the complete verification URL in a browser, prints the URL, then waits
  until the request is approved or denied. Use --device for a code-entry flow
  or --no-open to copy the complete URL manually.

configuration:
  Uses https://app.agentteam.email by default and discovers
  /.well-known/at-email.json when available. Set AT_EMAIL_API_BASE_URL to use
  another app origin.

Examples:
  at-email auth login
  at-email auth login --device
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
	case commandAgent:
		return commandUsage(commandAgent) + `
Manage local Agent Auth credentials.

agent commands:
  connect     Request delegated Agent Auth access for this device
  trial       Start an autonomous trial agent and mailbox
  enroll      Enroll this device as an Agent Auth host and agent
  status      Show the local agent credential status
  disconnect  Revoke the local agent and remove local agent credentials

options:
  -h, --help  show this help message and exit

configuration:
  Agent credentials are stored separately from personal auth sessions. Private
  keys, signed JWTs, and enrollment tokens are never printed by status output.

Examples:
  at-email agent connect
  at-email agent connect --mailbox-address support@example.com
  at-email agent trial
  at-email agent enroll TOKEN
  at-email agent status
  at-email agent status --json
`
	case commandAgentConnect:
		return commandUsage(commandAgentConnect) + `
Request delegated Agent Auth access for this device.

options:
  -h, --help              show this help message and exit
  --json                  write machine-readable JSON to stdout
  --force                 replace an existing local agent credential
  --api-base-url URL      AgentTeam Email app origin
  --name NAME             local agent display name
  --capability CAPABILITY request a specific email capability; repeat as needed
  --mailbox-address ADDRESS
                          mailbox constraint for email.message.* capabilities
  --organization-id ORGANIZATION_ID
                          accepted for approval flows that preselect an organization
  --reason REASON         reason shown in the approval request
  --device                show a code-entry approval flow and do not open a browser
  --no-open               print the approval URL without opening a browser

defaults:
  Creates or reuses a local host key, registers a pending delegated agent, then
  stores a separate Agent Auth credential after browser approval. Requests
  email.status by default. The approving user selects the organization during
  browser or device approval. When --mailbox-address is set, default
  message-list/read/search capabilities are requested for that mailbox.

configuration:
  Personal auth sessions and agent credentials are separate credential classes.
  Signed JWTs, private keys, and user session tokens are never printed.

Examples:
  at-email agent connect
  at-email agent connect --mailbox-address support@example.com
  at-email agent connect --capability email.message.send --mailbox-address support@example.com --json
`
	case commandAgentTrial:
		return commandUsage(commandAgentTrial) + `
Start an autonomous Agent Auth trial with a server-provisioned trial mailbox.

options:
  -h, --help              show this help message and exit
  --json                  write machine-readable JSON to stdout
  --force                 replace an existing local agent credential
  --api-base-url URL      AgentTeam Email app origin (default: discovered app)
  --name NAME             local agent display name
  --capability CAPABILITY request a trial-safe email capability; repeat as needed
  --post-claim-capability CAPABILITY
                          request a capability for the claimed agent; repeat as needed

configuration:
  Does not use a personal auth session. Stores agent credentials separately
  from personal auth sessions. Signed JWTs and private keys are never printed.

Examples:
  at-email agent trial
  at-email agent trial --name "Research Agent" --json
`
	case commandAgentEnroll:
		return commandUsage(commandAgentEnroll) + `
Enroll this device with an Agent Auth enrollment token from the web app.

positional arguments:
  enrollment_token  one-time host enrollment token

options:
  -h, --help          show this help message and exit
  --json              write machine-readable JSON to stdout
  --force             replace an existing local agent credential
  --api-base-url URL  AgentTeam Email app origin (default: discovered app)
  --name NAME         local agent display name

configuration:
  Stores agent credentials separately from personal auth sessions. Signed JWTs
  and enrollment tokens are not persisted.

Examples:
  at-email agent enroll TOKEN
  at-email agent enroll TOKEN --name "Research Agent" --json
`
	case commandAgentStatus:
		return commandUsage(commandAgentStatus) + `
Show the local Agent Auth credential status.

options:
  -h, --help  show this help message and exit
  --json      write machine-readable JSON to stdout

configuration:
  Reads the default local agent credential. Personal auth sessions are not used.

Examples:
  at-email agent status
  at-email agent status --json
`
	case commandAgentDisconnect:
		return commandUsage(commandAgentDisconnect) + `
Revoke the local agent and remove the local Agent Auth credential.

options:
  -h, --help  show this help message and exit
  --json      write machine-readable JSON to stdout

configuration:
  Reads and removes only the local agent credential. Personal auth sessions are
  not used or modified.

Examples:
  at-email agent disconnect
  at-email agent disconnect --json
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
