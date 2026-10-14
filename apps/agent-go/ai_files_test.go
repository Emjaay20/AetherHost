package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSanitizeEscapedSignaldeskFiles(t *testing.T) {
	files, err := sanitizeAiFiles([]AiFile{
		{Path: "package.json", Content: `{\n  \"name\": \"signaldesk\",\n  \"version\": \"0.1.0\",\n  \"scripts\": {\n    \"start:dev\": \"ts-node src/main.ts\"\n  }\n}`},
		{Path: "src/main.ts", Content: `import { NestFactory } from '@nestjs/core';\nimport { AppModule } from './app.module';\n\nasync function bootstrap() {\n  await NestFactory.create(AppModule);\n}\n`},
		{Path: "Dockerfile", Content: "FROM node:20-alpine\nWORKDIR /app\nCOPY package.json ./\nRUN npm ci && npm run build\nCOPY src ./src\nCOPY tsconfig.json ./\nCMD [\"npm\", \"run\", \"start\"]\n"},
	})
	if err != nil {
		t.Fatal(err)
	}

	var pkg map[string]any
	if err := json.Unmarshal([]byte(files[0].Content), &pkg); err != nil {
		t.Fatal(err)
	}
	if pkg["name"] != "signaldesk" {
		t.Fatalf("name = %v", pkg["name"])
	}
	scripts := pkg["scripts"].(map[string]any)
	if scripts["start"] != "ts-node src/main.ts" {
		t.Fatalf("start = %v", scripts["start"])
	}
	if strings.Contains(files[1].Content, `\n`) || !strings.Contains(files[1].Content, "\n") {
		t.Fatalf("main.ts was not unescaped: %s", files[1].Content)
	}
	if !strings.HasPrefix(files[1].Content, "import 'reflect-metadata';") {
		t.Fatalf("missing reflect-metadata import: %s", files[1].Content)
	}
	if strings.Contains(files[2].Content, "npm ci") {
		t.Fatalf("npm ci was not rewritten: %s", files[2].Content)
	}
	if strings.Index(files[2].Content, "RUN npm run build") < strings.Index(files[2].Content, "COPY src ./src") {
		t.Fatalf("build still runs before source copy:\n%s", files[2].Content)
	}
}

func TestSanitizeRejectsBadPackageJSON(t *testing.T) {
	_, err := sanitizeAiFiles([]AiFile{{Path: "package.json", Content: "{ not json"}})
	if err == nil {
		t.Fatal("expected error")
	}
}
