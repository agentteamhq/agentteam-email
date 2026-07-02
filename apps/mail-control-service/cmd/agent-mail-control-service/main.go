package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"mail-control-service/internal/control/controlservice"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	if err := controlservice.Main(ctx, os.Args[1:]); err != nil {
		log.Fatal(err)
	}
}
