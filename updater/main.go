// lc-updater — the native-messaging host that keeps the unpacked "PNE LC AI"
// extension up to date from our own server (no Chrome Web Store, no cloud
// management). It is started by Chrome, reads ONE request on stdin, does the
// work, writes ONE response on stdout, and exits.
//
// Protocol (Chrome native messaging): each message is a 4-byte little-endian
// length prefix followed by that many bytes of UTF-8 JSON. IMPORTANT: nothing
// except framed messages may be written to stdout — stray output corrupts the
// channel. All logging goes to stderr + a log file.
//
// Request:  {"cmd":"check","currentVersion":"1.0.0"}
// Response: {"status":"updated","version":"1.0.1"}   (extension should reload)
//           {"status":"current","version":"1.0.0"}   (nothing to do)
//           {"status":"error","message":"..."}
//
// The extension folder is a sibling of this binary ("<dir>/extension"), so the
// installer only has to drop both in the same directory.
package main

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Where we look for the update manifest. Overridable via env for testing.
const defaultManifestURL = "https://ai.lcportal.cloud/ext/latest.json"

const (
	maxManifestBytes = 1 << 20   // 1 MB
	maxZipBytes      = 100 << 20 // 100 MB
)

type inMsg struct {
	Cmd            string `json:"cmd"`
	CurrentVersion string `json:"currentVersion"`
}

type outMsg struct {
	Status  string `json:"status"` // "updated" | "current" | "error"
	Version string `json:"version,omitempty"`
	Message string `json:"message,omitempty"`
}

type latest struct {
	Version string `json:"version"`
	ZipURL  string `json:"zip_url"`
	SHA256  string `json:"sha256"`
}

func main() {
	raw, err := readMessage(os.Stdin)
	if err != nil {
		logf("no readable request (%v) — exiting", err)
		return
	}

	var in inMsg
	if err := json.Unmarshal(raw, &in); err != nil {
		reply(outMsg{Status: "error", Message: "bad request json"})
		return
	}
	if in.Cmd != "check" {
		reply(outMsg{Status: "error", Message: "unknown cmd: " + in.Cmd})
		return
	}

	reply(runCheck(in.CurrentVersion))
}

func runCheck(current string) outMsg {
	manifestURL := os.Getenv("LC_UPDATE_MANIFEST_URL")
	if manifestURL == "" {
		manifestURL = defaultManifestURL
	}

	lt, err := fetchLatest(manifestURL)
	if err != nil {
		logf("fetchLatest: %v", err)
		return outMsg{Status: "error", Message: "fetch manifest: " + err.Error()}
	}

	if !versionNewer(lt.Version, current) {
		logf("running %q >= latest %q — up to date", current, lt.Version)
		return outMsg{Status: "current", Version: lt.Version}
	}
	logf("update available: %q -> %q", current, lt.Version)

	extDir, err := extensionDir()
	if err != nil {
		return outMsg{Status: "error", Message: err.Error()}
	}

	// A previous run may have already swapped the files but the extension never
	// reloaded (crash/restart). If the on-disk build is already latest, just ask
	// the extension to reload rather than downloading again.
	if onDiskVersion(extDir) == lt.Version {
		logf("on-disk build already %q — prompting reload", lt.Version)
		return outMsg{Status: "updated", Version: lt.Version}
	}

	tmpZip, err := download(lt.ZipURL)
	if err != nil {
		logf("download: %v", err)
		return outMsg{Status: "error", Message: "download: " + err.Error()}
	}
	defer os.Remove(tmpZip)

	if err := verifySHA256(tmpZip, lt.SHA256); err != nil {
		logf("verifySHA256: %v", err)
		return outMsg{Status: "error", Message: "verify: " + err.Error()}
	}

	staging := extDir + ".new"
	_ = os.RemoveAll(staging)
	if err := unzip(tmpZip, staging); err != nil {
		_ = os.RemoveAll(staging)
		logf("unzip: %v", err)
		return outMsg{Status: "error", Message: "unzip: " + err.Error()}
	}

	// Guard against a corrupt/unexpected build clobbering a working extension.
	if _, err := os.Stat(filepath.Join(staging, "manifest.json")); err != nil {
		_ = os.RemoveAll(staging)
		return outMsg{Status: "error", Message: "downloaded build has no manifest.json"}
	}

	if err := replaceDir(extDir, staging); err != nil {
		_ = os.RemoveAll(staging)
		logf("replaceDir: %v", err)
		return outMsg{Status: "error", Message: "swap: " + err.Error()}
	}

	logf("updated to %q", lt.Version)
	return outMsg{Status: "updated", Version: lt.Version}
}

// extensionDir returns "<dir of this binary>/extension".
func extensionDir() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("locate self: %w", err)
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	return filepath.Join(filepath.Dir(exe), "extension"), nil
}

func onDiskVersion(extDir string) string {
	b, err := os.ReadFile(filepath.Join(extDir, "manifest.json"))
	if err != nil {
		return ""
	}
	var m struct {
		Version string `json:"version"`
	}
	if json.Unmarshal(b, &m) != nil {
		return ""
	}
	return m.Version
}

func fetchLatest(url string) (latest, error) {
	var lt latest
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Get(url)
	if err != nil {
		return lt, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return lt, fmt.Errorf("status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxManifestBytes))
	if err != nil {
		return lt, err
	}
	if err := json.Unmarshal(body, &lt); err != nil {
		return lt, err
	}
	if lt.Version == "" || lt.ZipURL == "" || lt.SHA256 == "" {
		return lt, fmt.Errorf("manifest missing version/zip_url/sha256")
	}
	return lt, nil
}

func download(url string) (string, error) {
	resp, err := (&http.Client{Timeout: 5 * time.Minute}).Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("status %d", resp.StatusCode)
	}
	f, err := os.CreateTemp("", "lc-ext-*.zip")
	if err != nil {
		return "", err
	}
	_, copyErr := io.Copy(f, io.LimitReader(resp.Body, maxZipBytes))
	closeErr := f.Close()
	if copyErr != nil {
		os.Remove(f.Name())
		return "", copyErr
	}
	if closeErr != nil {
		os.Remove(f.Name())
		return "", closeErr
	}
	return f.Name(), nil
}

func verifySHA256(path, want string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	got := hex.EncodeToString(h.Sum(nil))
	if !strings.EqualFold(got, strings.TrimSpace(want)) {
		return fmt.Errorf("sha256 mismatch (got %s, want %s)", got, want)
	}
	return nil
}

// unzip extracts src into dest, guarding against zip-slip path traversal.
func unzip(src, dest string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()

	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}
	destAbs, err := filepath.Abs(dest)
	if err != nil {
		return err
	}

	for _, zf := range r.File {
		target := filepath.Join(dest, zf.Name)
		targetAbs, err := filepath.Abs(target)
		if err != nil {
			return err
		}
		if targetAbs != destAbs && !strings.HasPrefix(targetAbs, destAbs+string(os.PathSeparator)) {
			return fmt.Errorf("illegal path in zip: %q", zf.Name)
		}
		if zf.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		if err := writeZipEntry(zf, target); err != nil {
			return err
		}
	}
	return nil
}

func writeZipEntry(zf *zip.File, target string) error {
	rc, err := zf.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	out, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, io.LimitReader(rc, maxZipBytes))
	closeErr := out.Close()
	if err != nil {
		return err
	}
	return closeErr
}

// replaceDir replaces dst with src. Prefers an atomic rename-swap; falls back to
// an in-place overwrite (with retries) when the OS locks the loaded directory
// (common on Windows while Chrome has the extension loaded).
func replaceDir(dst, src string) error {
	old := dst + ".old"
	_ = os.RemoveAll(old)

	if err := os.Rename(dst, old); err == nil {
		if err := os.Rename(src, dst); err != nil {
			_ = os.Rename(old, dst) // roll back
			return err
		}
		_ = os.RemoveAll(old)
		return nil
	}

	// Fallback: overwrite files in place, then prune stale ones.
	if err := copyTreeOver(src, dst); err != nil {
		return err
	}
	_ = os.RemoveAll(src)
	return nil
}

func copyTreeOver(src, dst string) error {
	if err := filepath.WalkDir(src, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, p)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		return copyFileRetry(p, target)
	}); err != nil {
		return err
	}

	// Remove files present in dst but not in src (leftovers from the old build).
	return filepath.WalkDir(dst, func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		rel, err := filepath.Rel(dst, p)
		if err != nil {
			return err
		}
		if _, statErr := os.Stat(filepath.Join(src, rel)); os.IsNotExist(statErr) {
			_ = os.Remove(p) // best-effort
		}
		return nil
	})
}

func copyFileRetry(src, dst string) error {
	var lastErr error
	for i := 0; i < 5; i++ {
		if lastErr = copyFile(src, dst); lastErr == nil {
			return nil
		}
		time.Sleep(200 * time.Millisecond)
	}
	return lastErr
}

func copyFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, in)
	closeErr := out.Close()
	if err != nil {
		return err
	}
	return closeErr
}

// versionNewer reports whether version a is strictly newer than b (numeric,
// dot-separated, e.g. "1.2.10" > "1.2.9").
func versionNewer(a, b string) bool {
	pa, pb := parseVersion(a), parseVersion(b)
	n := len(pa)
	if len(pb) > n {
		n = len(pb)
	}
	for i := 0; i < n; i++ {
		var x, y int
		if i < len(pa) {
			x = pa[i]
		}
		if i < len(pb) {
			y = pb[i]
		}
		if x != y {
			return x > y
		}
	}
	return false
}

func parseVersion(v string) []int {
	parts := strings.Split(strings.TrimSpace(v), ".")
	out := make([]int, 0, len(parts))
	for _, p := range parts {
		n, _ := strconv.Atoi(strings.TrimSpace(p))
		out = append(out, n)
	}
	return out
}

// --- native messaging framing ---------------------------------------------

func readMessage(r io.Reader) ([]byte, error) {
	var lenBuf [4]byte
	if _, err := io.ReadFull(r, lenBuf[:]); err != nil {
		return nil, err
	}
	n := binary.LittleEndian.Uint32(lenBuf[:])
	if n == 0 || n > 64<<20 {
		return nil, fmt.Errorf("bad message length %d", n)
	}
	buf := make([]byte, n)
	if _, err := io.ReadFull(r, buf); err != nil {
		return nil, err
	}
	return buf, nil
}

func writeMessage(w io.Writer, payload []byte) error {
	var lenBuf [4]byte
	binary.LittleEndian.PutUint32(lenBuf[:], uint32(len(payload)))
	if _, err := w.Write(lenBuf[:]); err != nil {
		return err
	}
	_, err := w.Write(payload)
	return err
}

func reply(m outMsg) {
	b, _ := json.Marshal(m)
	if err := writeMessage(os.Stdout, b); err != nil {
		logf("reply failed: %v", err)
	}
}

// logf writes to stderr (ignored by Chrome) and best-effort to updater.log next
// to the binary. Never writes to stdout.
func logf(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	fmt.Fprintln(os.Stderr, "[lc-updater] "+msg)
	if exe, err := os.Executable(); err == nil {
		lp := filepath.Join(filepath.Dir(exe), "updater.log")
		if f, err := os.OpenFile(lp, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644); err == nil {
			fmt.Fprintf(f, "%s %s\n", time.Now().Format(time.RFC3339), msg)
			f.Close()
		}
	}
}
