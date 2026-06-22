package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"at-email-cli/internal/atemail"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	os.Exit(atemail.Main(ctx, os.Args[1:], os.Environ(), os.Stdin, os.Stdout, os.Stderr))
}
