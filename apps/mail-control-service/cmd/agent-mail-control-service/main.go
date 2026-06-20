package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"agent-mail/internal/control/controlservice"
	"agent-mail/internal/control/fastpathgate"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	if len(os.Args) > 1 && os.Args[1] == "fastpath-gate" {
		if err := fastpathgate.Main(ctx, os.Args[2:]); err != nil {
			log.Fatal(err)
		}
		return
	}

	if err := controlservice.Main(ctx, os.Args[1:]); err != nil {
		log.Fatal(err)
	}
}
