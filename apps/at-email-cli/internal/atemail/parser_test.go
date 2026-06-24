package atemail

import (
	"errors"
	"strings"
	"testing"
)

func TestCommandHelpIsScopedForEveryCommand(t *testing.T) {
	commands := []commandName{
		commandStatus,
		commandInbox,
		commandRead,
		commandSearch,
		commandMarkRead,
		commandArchive,
		commandSend,
		commandReply,
		commandAuth,
		commandAuthLogin,
		commandAuthStatus,
		commandAuthLogout,
		commandAgent,
		commandAgentConnect,
		commandAgentTrial,
		commandAgentEnroll,
		commandAgentStatus,
		commandAgentDisconnect,
		commandVersion,
		commandUpdate,
		commandSkill,
	}
	for _, command := range commands {
		t.Run(string(command), func(t *testing.T) {
			help := commandHelp(command)
			for _, want := range []string{
				commandUsage(command),
				"Examples:\n",
				"configuration:\n",
			} {
				if !strings.Contains(help, want) {
					t.Fatalf("help for %s missing %q:\n%s", command, want, help)
				}
			}
			if strings.Contains(help, "usage: at-email [-h] COMMAND ...") {
				t.Fatalf("help for %s used root usage:\n%s", command, help)
			}
		})
	}
}

func TestParseRootHelpFlags(t *testing.T) {
	for _, flag := range []string{"-h", "--help"} {
		t.Run(flag, func(t *testing.T) {
			_, err := parseArgs([]string{flag})
			var help helpRequest
			if !errors.As(err, &help) {
				t.Fatalf("err = %T %v, want helpRequest", err, err)
			}
			if !strings.Contains(help.text, rootUsage()) {
				t.Fatalf("help = %q", help.text)
			}
		})
	}
}

func TestParseCommandHelpFlags(t *testing.T) {
	commands := []commandName{
		commandStatus,
		commandInbox,
		commandRead,
		commandSearch,
		commandMarkRead,
		commandArchive,
		commandSend,
		commandReply,
		commandAuth,
		commandAgent,
		commandVersion,
		commandUpdate,
		commandSkill,
	}
	for _, command := range commands {
		for _, flag := range []string{"-h", "--help"} {
			t.Run(string(command)+"/"+flag, func(t *testing.T) {
				_, err := parseArgs([]string{string(command), flag})
				var help helpRequest
				if !errors.As(err, &help) {
					t.Fatalf("err = %T %v, want helpRequest", err, err)
				}
				if !strings.Contains(help.text, commandUsage(command)) {
					t.Fatalf("help for %s missing usage %q:\n%s", command, commandUsage(command), help.text)
				}
			})
		}
	}
}

func TestParseNestedAuthHelpFlags(t *testing.T) {
	cases := []struct {
		argv    []string
		command commandName
	}{
		{argv: []string{"auth", "login", "--help"}, command: commandAuthLogin},
		{argv: []string{"auth", "status", "-h"}, command: commandAuthStatus},
		{argv: []string{"auth", "logout", "--help"}, command: commandAuthLogout},
	}
	for _, tc := range cases {
		t.Run(strings.Join(tc.argv, " "), func(t *testing.T) {
			_, err := parseArgs(tc.argv)
			var help helpRequest
			if !errors.As(err, &help) {
				t.Fatalf("err = %T %v, want helpRequest", err, err)
			}
			if !strings.Contains(help.text, commandUsage(tc.command)) {
				t.Fatalf("help missing usage %q:\n%s", commandUsage(tc.command), help.text)
			}
		})
	}
}

func TestParseNestedAgentHelpFlags(t *testing.T) {
	cases := []struct {
		argv    []string
		command commandName
	}{
		{argv: []string{"agent", "status", "--help"}, command: commandAgentStatus},
		{argv: []string{"agent", "status", "-h"}, command: commandAgentStatus},
		{argv: []string{"agent", "connect", "--help"}, command: commandAgentConnect},
		{argv: []string{"agent", "trial", "-h"}, command: commandAgentTrial},
		{argv: []string{"agent", "enroll", "--help"}, command: commandAgentEnroll},
		{argv: []string{"agent", "disconnect", "-h"}, command: commandAgentDisconnect},
	}
	for _, tc := range cases {
		t.Run(strings.Join(tc.argv, " "), func(t *testing.T) {
			_, err := parseArgs(tc.argv)
			var help helpRequest
			if !errors.As(err, &help) {
				t.Fatalf("err = %T %v, want helpRequest", err, err)
			}
			if !strings.Contains(help.text, commandUsage(tc.command)) {
				t.Fatalf("help missing usage %q:\n%s", commandUsage(tc.command), help.text)
			}
		})
	}
}

func TestParseGlobalVersionFlag(t *testing.T) {
	args, err := parseArgs([]string{"--version", "--json"})
	if err != nil {
		t.Fatalf("parseArgs returned error: %v", err)
	}
	if args.Command != commandVersion || !args.JSON {
		t.Fatalf("args = %#v", args)
	}
}

func TestParseAuthLoginFlags(t *testing.T) {
	args, err := parseArgs([]string{
		"auth",
		"login",
		"--api-base-url",
		"http://localhost:4321",
		"--open",
		"--device",
		"--no-open",
		"--json",
	})
	if err != nil {
		t.Fatalf("parseArgs returned error: %v", err)
	}
	if args.Command != commandAuth ||
		args.AuthAction != "login" ||
		args.APIBaseURL != "http://localhost:4321" ||
		!args.Open ||
		!args.Device ||
		!args.NoOpen ||
		!args.JSON {
		t.Fatalf("args = %#v", args)
	}
}

func TestParseAgentConnectFlags(t *testing.T) {
	args, err := parseArgs([]string{
		"agent",
		"connect",
		"--api-base-url",
		"http://localhost:4321",
		"--name",
		"Research Agent",
		"--capability",
		"email.message.read",
		"--capability=email.message.send",
		"--mailbox-address",
		"support@example.com",
		"--organization-id",
		"org-1",
		"--reason",
		"Help with support replies",
		"--device",
		"--no-open",
		"--force",
		"--json",
	})
	if err != nil {
		t.Fatalf("parseArgs returned error: %v", err)
	}
	if args.Command != commandAgent ||
		args.AgentAction != "connect" ||
		args.APIBaseURL != "http://localhost:4321" ||
		args.AgentName != "Research Agent" ||
		strings.Join(args.AgentCapabilities, ",") != "email.message.read,email.message.send" ||
		args.MailboxAddress != "support@example.com" ||
		args.OrganizationID != "org-1" ||
		args.AgentReason != "Help with support replies" ||
		!args.Device ||
		!args.NoOpen ||
		!args.Force ||
		!args.JSON {
		t.Fatalf("args = %#v", args)
	}
}

func TestParseAgentTrialFlags(t *testing.T) {
	args, err := parseArgs([]string{
		"agent",
		"trial",
		"--api-base-url",
		"http://localhost:4321",
		"--name",
		"Research Agent",
		"--capability",
		"email.status",
		"--capability=email.message.read",
		"--post-claim-capability",
		"email.message.send",
		"--force",
		"--json",
	})
	if err != nil {
		t.Fatalf("parseArgs returned error: %v", err)
	}
	if args.Command != commandAgent ||
		args.AgentAction != "trial" ||
		args.APIBaseURL != "http://localhost:4321" ||
		args.AgentName != "Research Agent" ||
		strings.Join(args.AgentCapabilities, ",") != "email.status,email.message.read" ||
		strings.Join(args.AgentPostClaimCapabilities, ",") != "email.message.send" ||
		!args.Force ||
		!args.JSON {
		t.Fatalf("args = %#v", args)
	}
}

func TestParseAgentStatusFlags(t *testing.T) {
	args, err := parseArgs([]string{"agent", "status", "--json"})
	if err != nil {
		t.Fatalf("parseArgs returned error: %v", err)
	}
	if args.Command != commandAgent || args.AgentAction != "status" || !args.JSON {
		t.Fatalf("args = %#v", args)
	}
}

func TestParseAgentEnrollFlags(t *testing.T) {
	args, err := parseArgs([]string{
		"agent",
		"enroll",
		"TOKEN",
		"--api-base-url",
		"http://localhost:4321",
		"--name",
		"Research Agent",
		"--force",
		"--json",
	})
	if err != nil {
		t.Fatalf("parseArgs returned error: %v", err)
	}
	if args.Command != commandAgent ||
		args.AgentAction != "enroll" ||
		args.AgentToken != "TOKEN" ||
		args.APIBaseURL != "http://localhost:4321" ||
		args.AgentName != "Research Agent" ||
		!args.Force ||
		!args.JSON {
		t.Fatalf("args = %#v", args)
	}
}

func TestParseAgentDisconnectFlags(t *testing.T) {
	args, err := parseArgs([]string{"agent", "disconnect", "--json"})
	if err != nil {
		t.Fatalf("parseArgs returned error: %v", err)
	}
	if args.Command != commandAgent || args.AgentAction != "disconnect" || !args.JSON {
		t.Fatalf("args = %#v", args)
	}
}

func TestParseAuthRequiresSubcommand(t *testing.T) {
	_, err := parseArgs([]string{"auth"})
	if err == nil {
		t.Fatal("expected parse error")
	}
	want := "the following arguments are required: auth_command"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}

func TestParseAgentRequiresSubcommand(t *testing.T) {
	_, err := parseArgs([]string{"agent"})
	if err == nil {
		t.Fatal("expected parse error")
	}
	want := "the following arguments are required: agent_command"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}

func TestParseSkillRejectsArgs(t *testing.T) {
	args, err := parseArgs([]string{"skill"})
	if err != nil {
		t.Fatalf("parseArgs returned error: %v", err)
	}
	if args.Command != commandSkill {
		t.Fatalf("args = %#v", args)
	}

	_, err = parseArgs([]string{"skill", "extra"})
	if err == nil {
		t.Fatal("expected parse error")
	}
	want := "unrecognized arguments: extra"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}

func TestParseSelfUpdateTargetVersion(t *testing.T) {
	args, err := parseArgs([]string{"self-update", "v1.2.3", "--json"})
	if err != nil {
		t.Fatalf("parseArgs returned error: %v", err)
	}
	if args.Command != commandUpdate || args.TargetVersion != "v1.2.3" || !args.JSON {
		t.Fatalf("args = %#v", args)
	}
}

func TestParseSelfUpdateRejectsExtraArgs(t *testing.T) {
	_, err := parseArgs([]string{"self-update", "v1.2.3", "extra"})
	if err == nil {
		t.Fatal("expected parse error")
	}
	want := "unrecognized arguments: extra"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}

func TestParseLimitErrorMatchesArgparseStyle(t *testing.T) {
	_, err := parseArgs([]string{"inbox", "--limit", "0"})
	if err == nil {
		t.Fatal("expected parse error")
	}
	want := "argument --limit: value must be greater than zero"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}

func TestParseLimitNegativeValueUsesPositiveIntValidation(t *testing.T) {
	_, err := parseArgs([]string{"inbox", "--limit", "-1"})
	if err == nil {
		t.Fatal("expected parse error")
	}
	want := "argument --limit: value must be greater than zero"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}

func TestParseValueFlagRejectsOptionLookingToken(t *testing.T) {
	_, err := parseArgs([]string{
		"send",
		"--to", "alice@example.com",
		"--subject", "Hello",
		"--body", "--json",
	})
	if err == nil {
		t.Fatal("expected parse error")
	}
	want := "argument --body: expected one argument"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}

func TestParseSendRequiresToAndSubject(t *testing.T) {
	_, err := parseArgs([]string{"send", "--body", "hello"})
	if err == nil {
		t.Fatal("expected parse error")
	}
	want := "the following arguments are required: --to, --subject"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}

func TestParseSendAllowsExplicitEmptyBody(t *testing.T) {
	args, err := parseArgs([]string{"send", "--to", "alice@example.com", "--subject", "Hello", "--body="})
	if err != nil {
		t.Fatalf("parseArgs returned error: %v", err)
	}
	if args.Body == nil || *args.Body != "" {
		t.Fatalf("body state = %#v", args)
	}
}

func TestParseSendAllowsExplicitEmptySubject(t *testing.T) {
	args, err := parseArgs([]string{"send", "--to", "alice@example.com", "--subject=", "--body", "hello"})
	if err != nil {
		t.Fatalf("parseArgs returned error: %v", err)
	}
	if !args.SubjectSet || args.Subject != "" {
		t.Fatalf("subject state = %#v", args)
	}
}

func TestParseNegativeMessageIDUsesPositiveIntError(t *testing.T) {
	_, err := parseArgs([]string{"read", "-1"})
	if err == nil {
		t.Fatal("expected parse error")
	}
	want := "argument message_id: value must be greater than zero"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}

func TestParseDoubleDashAllowsDashPrefixedPositional(t *testing.T) {
	args, err := parseArgs([]string{"search", "--", "--invoice"})
	if err != nil {
		t.Fatalf("parseArgs returned error: %v", err)
	}
	if args.Query != "--invoice" {
		t.Fatalf("query = %q", args.Query)
	}
}

func TestParseSendDoubleDashStillValidatesRequiredOptions(t *testing.T) {
	_, err := parseArgs([]string{"send", "--"})
	if err == nil {
		t.Fatal("expected parse error")
	}
	want := "the following arguments are required: --to, --subject"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}

func TestParseRepeatedRecipients(t *testing.T) {
	args, err := parseArgs([]string{
		"send",
		"--to", "alice@example.com",
		"--to=bob@example.com",
		"--cc", "carol@example.com",
		"--bcc", "dan@example.com",
		"--subject", "Hello",
		"--body", "Body",
		"--json",
	})
	if err != nil {
		t.Fatalf("parseArgs returned error: %v", err)
	}
	if args.Command != commandSend || !args.JSON {
		t.Fatalf("unexpected args: %#v", args)
	}
	if got := len(args.To); got != 2 {
		t.Fatalf("len(To) = %d", got)
	}
	if args.Cc[0] != "carol@example.com" || args.Bcc[0] != "dan@example.com" {
		t.Fatalf("recipients = %#v", args)
	}
}
