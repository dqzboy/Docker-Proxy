package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBearerChallengeAfterCrossHostRedirect(t *testing.T) {
	var registry *httptest.Server
	var tokenScope string
	auth := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenScope = r.URL.Query().Get("scope")
		fmt.Fprint(w, `{"token":"test-token","expires_in":60}`)
	}))
	defer auth.Close()
	registry = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-token" {
			w.Header().Set("WWW-Authenticate", fmt.Sprintf(`Bearer realm="%s",service="ghcr.io",scope="repository:actual/repo:pull"`, auth.URL))
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		fmt.Fprint(w, "manifest")
	}))
	defer registry.Close()
	aliasHits := 0
	alias := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		aliasHits++
		// Use a different host so Go does not forward Authorization automatically.
		redirect := strings.Replace(registry.URL, "127.0.0.1", "localhost", 1)
		http.Redirect(w, r, redirect+r.URL.RequestURI(), http.StatusTemporaryRedirect)
	}))
	defer alias.Close()

	cfg := &Config{Default: "lscr", Registries: []RegistryConfig{{
		Name: "lscr", Hosts: []string{"lscr.example"}, Upstream: alias.URL,
		Auth: AuthConfig{Type: AuthToken},
	}}}
	proxy := NewProxy(cfg)
	req := httptest.NewRequest(http.MethodGet, "/v2/linuxserver/sonarr/manifests/latest", nil)
	req.Host = "lscr.example"
	w := httptest.NewRecorder()
	proxy.ServeHTTP(w, req)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "manifest") {
		t.Fatalf("redirected challenge must succeed, got %d: %s", w.Code, w.Body.String())
	}
	if tokenScope != "repository:actual/repo:pull" {
		t.Fatalf("challenge scope ignored: %q", tokenScope)
	}
	if aliasHits != 1 {
		t.Fatalf("token retry should target the challenged registry directly, alias received %d requests", aliasHits)
	}
}
