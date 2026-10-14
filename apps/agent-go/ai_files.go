package main

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

var (
	lockfilePath = regexp.MustCompile(`(^|/)(package-lock\.json|npm-shrinkwrap\.json)$`)
	buildRun     = regexp.MustCompile(`(?i)^\s*RUN\b`)
	buildCmd     = regexp.MustCompile(`\b(npm\s+run\s+build|npx\s+tsc|\btsc\b)`)
	copyLine     = regexp.MustCompile(`(?i)^\s*COPY\s+`)
	runPrefix    = regexp.MustCompile(`(?i)^(\s*RUN\s+)(.*)$`)
	versionMajor = regexp.MustCompile(`(\d+)`)
	npmCi        = regexp.MustCompile(`\bnpm\s+ci\b`)
)

func sanitizeAiFiles(files []AiFile) ([]AiFile, error) {
	normalized := make([]AiFile, 0, len(files))
	for _, file := range files {
		path, err := safeAiPath(file.Path)
		if err != nil {
			return nil, err
		}
		normalized = append(normalized, AiFile{Path: path, Content: normalizeFileContent(file.Content)})
	}
	return repairProject(normalized)
}

func normalizeFileContent(content string) string {
	current := unwrapJSONString(content)
	for i := 0; i < 3; i++ {
		next := unescapePass(current)
		if next == current {
			break
		}
		current = next
	}
	return current
}

func repairProject(files []AiFile) ([]AiFile, error) {
	hasLock := false
	usesNest := false
	for _, file := range files {
		if lockfilePath.MatchString(file.Path) {
			hasLock = true
		}
		if strings.Contains(file.Content, "@nestjs/") {
			usesNest = true
		}
	}

	out := make([]AiFile, len(files))
	for i, file := range files {
		content := file.Content
		var err error
		switch {
		case file.Path == "package.json" || strings.HasSuffix(file.Path, "/package.json"):
			content, err = repairPackageJSON(content)
		case file.Path == "Dockerfile" || strings.HasSuffix(file.Path, "/Dockerfile"):
			content = repairDockerfile(content, hasLock)
		case file.Path == "docker-compose.yml" || strings.HasSuffix(file.Path, "/docker-compose.yml"):
			content = repairComposeInstall(content, hasLock)
		case usesNest && (file.Path == "tsconfig.json" || strings.HasSuffix(file.Path, "/tsconfig.json")):
			content = repairTsconfig(content)
		case usesNest && (file.Path == "src/main.ts" || strings.HasSuffix(file.Path, "/src/main.ts")):
			content = repairNestMain(content)
		}
		if err != nil {
			return nil, err
		}
		out[i] = AiFile{Path: file.Path, Content: content}
	}
	return out, nil
}

func unwrapJSONString(content string) string {
	trimmed := strings.TrimSpace(content)
	if len(trimmed) < 2 || trimmed[0] != '"' || trimmed[len(trimmed)-1] != '"' {
		return content
	}
	var parsed string
	if err := json.Unmarshal([]byte(trimmed), &parsed); err != nil {
		return content
	}
	return parsed
}

func unescapePass(content string) string {
	next := content
	if strings.Count(next, "\n") == 0 && strings.Count(next, `\n`) >= 1 {
		next = strings.ReplaceAll(next, `\r\n`, "\n")
		next = strings.ReplaceAll(next, `\n`, "\n")
		next = strings.ReplaceAll(next, `\r`, "\r")
		next = strings.ReplaceAll(next, `\t`, "\t")
	}
	escaped, raw := quoteStats(next)
	if escaped >= 1 && raw == 0 {
		next = strings.ReplaceAll(next, `\"`, `"`)
	}
	return next
}

func repairPackageJSON(content string) (string, error) {
	var parsed map[string]any
	if err := json.Unmarshal([]byte(content), &parsed); err != nil {
		return "", fmt.Errorf("package.json is not valid JSON (%s). Refusing to deploy", err.Error())
	}

	scripts, _ := parsed["scripts"].(map[string]any)
	if scripts == nil {
		scripts = map[string]any{}
		parsed["scripts"] = scripts
	}
	if _, ok := scripts["start"].(string); !ok {
		if dev, ok := scripts["start:dev"].(string); ok && dev != "" {
			scripts["start"] = dev
		} else if main, ok := parsed["main"].(string); ok && strings.TrimSpace(main) != "" {
			scripts["start"] = "node " + strings.TrimSpace(main)
		} else {
			scripts["start"] = "node dist/main.js"
		}
	}

	deps, _ := parsed["dependencies"].(map[string]any)
	if deps == nil {
		deps = map[string]any{}
		parsed["dependencies"] = deps
	}
	nestRange := stringValue(deps["@nestjs/common"])
	if nestRange == "" {
		nestRange = stringValue(deps["@nestjs/core"])
	}
	nestMajor := majorOf(nestRange)
	staticMajor := majorOf(stringValue(deps["@nestjs/serve-static"]))
	if nestMajor >= 10 && staticMajor > 0 && staticMajor < 4 {
		deps["@nestjs/serve-static"] = "^4.0.2"
	}
	if stringValue(deps["@nestjs/core"]) != "" && stringValue(deps["@nestjs/platform-express"]) == "" {
		deps["@nestjs/platform-express"] = stringValue(deps["@nestjs/core"])
	}

	dev, _ := parsed["devDependencies"].(map[string]any)
	if dev == nil {
		dev = map[string]any{}
	}
	hasTS := stringValue(dev["typescript"]) != "" || stringValue(deps["typescript"]) != ""
	if hasTS && stringValue(dev["@types/node"]) == "" && stringValue(deps["@types/node"]) == "" {
		dev["@types/node"] = "^20.17.0"
		parsed["devDependencies"] = dev
	}

	encoded, err := json.MarshalIndent(parsed, "", "  ")
	if err != nil {
		return "", err
	}
	return string(encoded) + "\n", nil
}

func repairDockerfile(content string, hasLock bool) string {
	text := repairComposeInstall(content, hasLock)
	lines := strings.Split(text, "\n")
	buildIdx := -1
	for i, line := range lines {
		if buildRun.MatchString(line) && buildCmd.MatchString(line) {
			buildIdx = i
			break
		}
	}
	if buildIdx == -1 {
		return ensureNewline(text)
	}
	sourceAfter := -1
	for i := buildIdx + 1; i < len(lines); i++ {
		if isSourceCopy(lines[i]) {
			sourceAfter = i
			break
		}
	}
	if sourceAfter == -1 {
		return ensureNewline(text)
	}

	next := append([]string{}, lines...)
	if install, build, ok := splitInstallAndBuild(next[buildIdx]); ok {
		next[buildIdx] = install
		insertAt := lastSourceCopyIndex(next, sourceAfter) + 1
		next = insertLine(next, insertAt, build)
	} else {
		removed := next[buildIdx]
		next = append(next[:buildIdx], next[buildIdx+1:]...)
		insertAt := lastSourceCopyIndex(next, 0) + 1
		next = insertLine(next, insertAt, removed)
	}
	return ensureNewline(strings.Join(next, "\n"))
}

func repairComposeInstall(content string, hasLock bool) string {
	if hasLock {
		return content
	}
	return npmCi.ReplaceAllString(content, "npm install")
}

func repairTsconfig(content string) string {
	var parsed map[string]any
	if err := json.Unmarshal([]byte(content), &parsed); err != nil {
		return content
	}
	options, _ := parsed["compilerOptions"].(map[string]any)
	if options == nil {
		options = map[string]any{}
		parsed["compilerOptions"] = options
	}
	options["experimentalDecorators"] = true
	options["emitDecoratorMetadata"] = true
	encoded, err := json.MarshalIndent(parsed, "", "  ")
	if err != nil {
		return content
	}
	return string(encoded) + "\n"
}

func repairNestMain(content string) string {
	if !strings.Contains(content, "NestFactory") || strings.Contains(content, "reflect-metadata") {
		return content
	}
	if strings.HasSuffix(content, "\n") {
		return "import 'reflect-metadata';\n" + content
	}
	return "import 'reflect-metadata';\n" + content + "\n"
}

func splitInstallAndBuild(line string) (string, string, bool) {
	match := runPrefix.FindStringSubmatch(line)
	if match == nil {
		return "", "", false
	}
	parts := regexp.MustCompile(`\s*&&\s*`).Split(match[2], -1)
	var buildParts, other []string
	for _, part := range parts {
		if buildCmd.MatchString(part) {
			buildParts = append(buildParts, part)
		} else {
			other = append(other, part)
		}
	}
	if len(buildParts) == 0 || len(other) == 0 {
		return "", "", false
	}
	return match[1] + strings.Join(other, " && "), match[1] + strings.Join(buildParts, " && "), true
}

func isSourceCopy(line string) bool {
	if !copyLine.MatchString(line) {
		return false
	}
	rest := copyLine.ReplaceAllString(line, "")
	tokens := strings.Fields(rest)
	if len(tokens) < 2 {
		return false
	}
	sources := tokens[:len(tokens)-1]
	for _, token := range sources {
		if token != "package.json" && token != "package-lock.json" && token != "npm-shrinkwrap.json" {
			return true
		}
	}
	return false
}

func lastSourceCopyIndex(lines []string, from int) int {
	last := -1
	for i := from; i < len(lines); i++ {
		if isSourceCopy(lines[i]) {
			last = i
		}
	}
	return last
}

func insertLine(lines []string, at int, line string) []string {
	if at < 0 {
		at = 0
	}
	if at > len(lines) {
		at = len(lines)
	}
	out := make([]string, 0, len(lines)+1)
	out = append(out, lines[:at]...)
	out = append(out, line)
	out = append(out, lines[at:]...)
	return out
}

func safeAiPath(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", fmt.Errorf("file path is missing")
	}
	normalized := strings.TrimPrefix(strings.ReplaceAll(path, "\\", "/"), "./")
	if strings.HasPrefix(normalized, "/") || strings.Contains(normalized, "\x00") {
		return "", fmt.Errorf("unsafe file path: %s", path)
	}
	for _, part := range strings.Split(normalized, "/") {
		if part == ".." {
			return "", fmt.Errorf("unsafe file path: %s", path)
		}
	}
	return normalized, nil
}

func majorOf(rangeValue string) int {
	match := versionMajor.FindStringSubmatch(rangeValue)
	if match == nil {
		return 0
	}
	n := 0
	fmt.Sscanf(match[1], "%d", &n)
	return n
}

func stringValue(value any) string {
	text, _ := value.(string)
	return text
}

func quoteStats(content string) (escaped int, raw int) {
	for i := 0; i < len(content); i++ {
		if content[i] == '\\' && i+1 < len(content) && content[i+1] == '"' {
			escaped++
			i++
			continue
		}
		if content[i] == '"' {
			raw++
		}
	}
	return escaped, raw
}

func ensureNewline(content string) string {
	if strings.HasSuffix(content, "\n") {
		return content
	}
	return content + "\n"
}
