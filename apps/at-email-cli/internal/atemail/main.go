package atemail

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
)

func Main(ctx context.Context, argv []string, env []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) int {
	jsonMode := argvRequestsJSON(argv)
	args, err := parseArgs(argv)
	if err != nil {
		switch typed := err.(type) {
		case noCommandError:
			fmt.Fprint(stdout, rootHelp())
			return 2
		case helpRequest:
			fmt.Fprint(stdout, typed.text)
			return 0
		case usageError:
			writeUsageError(failureWriter(jsonMode, stdout, stderr), typed)
			return 2
		default:
			writeInterpretedError(failureWriter(jsonMode, stdout, stderr), err)
			return 1
		}
	}

	switch args.Command {
	case commandVersion:
		err = handleVersion(args, stdout)
		if err != nil {
			writeInterpretedError(failureWriter(args.JSON, stdout, stderr), err)
			return exitCodeForError(err)
		}
		return 0
	case commandUpdate:
		err = handleSelfUpdate(ctx, args, stdout)
		if err != nil {
			writeInterpretedError(failureWriter(args.JSON, stdout, stderr), err)
			return exitCodeForError(err)
		}
		return 0
	case commandSkill:
		err = handleSkill(stdout)
		if err != nil {
			writeInterpretedError(failureWriter(args.JSON, stdout, stderr), err)
			return exitCodeForError(err)
		}
		return 0
	case commandAuth:
		err = handleAuth(ctx, args, env, stdout, stderr)
		if err != nil {
			writeInterpretedError(failureWriter(args.JSON, stdout, stderr), err)
			return exitCodeForError(err)
		}
		return 0
	case commandAgent:
		err = handleAgent(ctx, args, env, stdout, stderr)
		if err != nil {
			writeInterpretedError(failureWriter(args.JSON, stdout, stderr), err)
			return exitCodeForError(err)
		}
		return 0
	case commandPaperclipTool:
		err = handlePaperclipTool(ctx, env, stdin, stdout)
		if err != nil {
			writeInterpretedError(failureWriter(args.JSON, stdout, stderr), err)
			return exitCodeForError(err)
		}
		return 0
	}

	args, err = prepareBodyInput(args, stdin)
	if err != nil {
		switch typed := err.(type) {
		case usageError:
			writeUsageError(failureWriter(args.JSON, stdout, stderr), typed)
			return 2
		default:
			writeInterpretedError(failureWriter(args.JSON, stdout, stderr), err)
			return exitCodeForError(err)
		}
	}

	if handled, err := handleAgentMailCommand(ctx, args, env, stdout); handled {
		if err != nil {
			writeInterpretedError(failureWriter(args.JSON, stdout, stderr), err)
			return exitCodeForError(err)
		}
		if !args.JSON {
			writeUpdateNotice(ctx, stderr)
		}
		return 0
	}

	err = newAgentCredentialRequiredError()
	writeInterpretedError(failureWriter(args.JSON, stdout, stderr), err)
	return exitCodeForError(err)
}

func handleAgentMailCommand(ctx context.Context, args parsedArgs, env []string, stdout io.Writer) (bool, error) {
	credential, found, err := loadAgentCredential(defaultAgentProfileName)
	if err != nil {
		return true, err
	}
	if !found {
		return false, nil
	}
	values := envMap(env)
	preferredAccountID := lookupEnv(values, "AT_EMAIL_MAILBOX_ADDRESS")
	client := newWebMailClient(credential, preferredAccountID, buildInternalIdentityTerms(values))
	cfg := config{
		APIBaseURL:            credential.APIBaseURL,
		MailboxAddress:        preferredAccountID,
		UserID:                credential.AgentID,
		InternalIdentityTerms: buildInternalIdentityTerms(values),
	}
	if args.Command == commandReply && cfg.MailboxAddress == "" {
		accountID, err := client.accountID(ctx)
		if err != nil {
			return true, err
		}
		cfg.MailboxAddress = accountID
		client.preferredAccountID = accountID
	}

	switch args.Command {
	case commandStatus:
		return true, handleStatus(ctx, args, client, cfg, stdout)
	case commandInbox:
		return true, handleInbox(ctx, args, client, stdout)
	case commandRead:
		return true, handleRead(ctx, args, client, stdout)
	case commandSearch:
		return true, handleSearch(ctx, args, client, stdout)
	case commandMarkRead:
		return true, handleMarkRead(ctx, args, client, stdout)
	case commandArchive:
		return true, handleArchive(ctx, args, client, stdout)
	case commandSend:
		return true, handleSend(ctx, args, client, stdinReader(args), stdout)
	case commandReply:
		return true, handleReply(ctx, args, client, cfg, stdinReader(args), stdout)
	default:
		return false, nil
	}
}

func stdinReader(args parsedArgs) io.Reader {
	if args.Body == nil {
		return strings.NewReader("")
	}
	return strings.NewReader(*args.Body)
}

func prepareBodyInput(args parsedArgs, stdin io.Reader) (parsedArgs, error) {
	if args.Command != commandSend && args.Command != commandReply {
		return args, nil
	}
	body, err := readBody(args, stdin)
	if err != nil {
		return args, err
	}
	args.Body = &body
	args.BodyFile = ""
	return args, nil
}

func failureWriter(jsonMode bool, stdout io.Writer, stderr io.Writer) io.Writer {
	if jsonMode {
		return stderr
	}
	return stdout
}

func writeUsageError(writer io.Writer, err usageError) {
	fmt.Fprintf(writer, "error: %s\n", err.Error())
	fmt.Fprint(writer, commandUsage(err.command))
	if err.command != "" {
		fmt.Fprintf(writer, "hint: run `at-email %s --help`\n", err.command)
		return
	}
	fmt.Fprint(writer, "hint: run `at-email --help`\n")
}

func writeInterpretedError(writer io.Writer, err error) {
	fmt.Fprintf(writer, "error: %s\n", err)
	var cfgErr configError
	if errors.As(err, &cfgErr) {
		fmt.Fprint(writer, "hint: this is a managed-runtime setup issue; report the command and context instead of creating local credentials\n")
	}
	var credentialErr agentCredentialRequiredError
	if errors.As(err, &credentialErr) {
		fmt.Fprint(writer, "hint: mailbox commands use the webserver Agent Auth boundary; personal auth sessions and WildDuck environment variables are not accepted.\n")
	}
}

func writeUpdateNotice(ctx context.Context, stderr io.Writer) {
	notice, err := runUpdateNotice(ctx, Version)
	if err != nil || notice == "" {
		return
	}
	fmt.Fprintln(stderr, notice)
}

func exitCodeForError(err error) int {
	var credentialErr agentCredentialRequiredError
	if errors.As(err, &credentialErr) {
		return 78
	}
	var cfgErr configError
	if errors.As(err, &cfgErr) {
		return 78
	}
	var protoErr protocolError
	if errors.As(err, &protoErr) {
		return 70
	}
	var transportErr transportError
	if errors.As(err, &transportErr) {
		return 69
	}
	return 1
}

func argvRequestsJSON(argv []string) bool {
	if len(argv) < 2 {
		return false
	}
	for _, token := range argv[1:] {
		if token == "--" {
			return false
		}
		if token == "--json" {
			return true
		}
	}
	return false
}
