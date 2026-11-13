package main

import "fmt"

// WordPressResources is an explicit per-workload budget. Values are expressed
// in MiB because Docker's mem_limit uses the same unit. The profile keeps the
// web server, PHP, database and cache inside one bounded application budget.
type WordPressResources struct {
	NginxMB int
	PHPMB   int
	MariaMB int
	RedisMB int
}

const (
	defaultWordPressMemoryMB = 1024
	minimumWordPressMemoryMB = 1024
	maximumWordPressMemoryMB = 4096

	phpFixedReserveMB        = 96
	phpWorkerBudgetMB        = 64
	phpMinimumMemoryLimitMB  = 64
	databaseFixedReserveMB   = 96
	databaseConnectionBudget = 4
)

// wordpressResources splits an application-wide memory budget into bounded
// service budgets. The fixed nginx/Redis allocations avoid starving ingress or
// the object cache; the remaining capacity is shared between PHP and MariaDB.
func wordpressResources(totalMB int) (WordPressResources, error) {
	if totalMB == 0 {
		totalMB = defaultWordPressMemoryMB
	}
	if totalMB < minimumWordPressMemoryMB || totalMB > maximumWordPressMemoryMB {
		return WordPressResources{}, fmt.Errorf("wordpress memory budget must be between %dMiB and %dMiB", minimumWordPressMemoryMB, maximumWordPressMemoryMB)
	}

	resources := WordPressResources{NginxMB: 64, RedisMB: 96}
	remaining := totalMB - resources.NginxMB - resources.RedisMB
	resources.MariaMB = remaining * 42 / 100
	resources.PHPMB = remaining - resources.MariaMB
	if resources.PHPMB < 384 || resources.MariaMB < 256 {
		return WordPressResources{}, fmt.Errorf("wordpress memory budget leaves too little room for PHP or MariaDB")
	}
	return resources, nil
}

// WordPressTuning is deliberately derived only from a bounded service budget.
// It is conservative: a PHP worker is charged at its allowed PHP memory plus
// a fixed native-process reserve, and MariaDB reserves memory for connections
// before assigning the InnoDB buffer pool.
type WordPressTuning struct {
	PHPMaxChildren int
	PHPStart       int
	PHPMinSpare    int
	PHPMaxSpare    int
	PHPMemoryMB    int
	OPcacheMB      int
	MariaBufferMB  int
	MariaMaxConns  int
}

func deriveWordPressTuning(resources WordPressResources) (WordPressTuning, error) {
	if resources.PHPMB < 384 || resources.MariaMB < 256 {
		return WordPressTuning{}, fmt.Errorf("wordpress resources are below the supported minimum")
	}

	opcache := resources.PHPMB / 8
	if opcache < 32 {
		opcache = 32
	}
	if opcache > 128 {
		opcache = 128
	}
	phpMemory := resources.PHPMB / 5
	if phpMemory < phpMinimumMemoryLimitMB {
		phpMemory = phpMinimumMemoryLimitMB
	}
	if phpMemory > 128 {
		phpMemory = 128
	}
	workerCharge := phpMemory + phpWorkerBudgetMB
	children := (resources.PHPMB - opcache - phpFixedReserveMB) / workerCharge
	if children < 2 {
		children = 2
	}
	start := children / 2
	if start < 2 {
		start = 2
	}
	minSpare := start / 2
	if minSpare < 1 {
		minSpare = 1
	}
	maxSpare := start

	maxConnections := children + 12 // PHP capacity plus admin, backup, and health-check headroom.
	bufferPool := resources.MariaMB - databaseFixedReserveMB - (maxConnections * databaseConnectionBudget)
	if bufferPool < 128 {
		return WordPressTuning{}, fmt.Errorf("mariadb budget leaves less than 128MiB for the InnoDB buffer pool")
	}
	// Keep the pool below 70% of the container so spikes in per-thread buffers
	// cannot turn a slow query into an OOM kill.
	if cap := resources.MariaMB * 70 / 100; bufferPool > cap {
		bufferPool = cap
	}

	return WordPressTuning{
		PHPMaxChildren: children,
		PHPStart:       start,
		PHPMinSpare:    minSpare,
		PHPMaxSpare:    maxSpare,
		PHPMemoryMB:    phpMemory,
		OPcacheMB:      opcache,
		MariaBufferMB:  bufferPool,
		MariaMaxConns:  maxConnections,
	}, nil
}
