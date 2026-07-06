package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"mail-control-service/internal/control/controlservice"
	"mail-control-service/internal/safelog"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	if err := controlservice.Main(ctx, os.Args[1:]); err != nil {
		log.Printf("agent-mail-control-service event=fatal error=%q", safelog.Error(err))
		os.Exit(1)
	}
}
