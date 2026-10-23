package main

import "testing"

func TestWatcherConstants(t *testing.T) {
	if maxRestartsIn < 1 || watchInterval <= 0 {
		t.Fatal("invalid watcher config")
	}
}
