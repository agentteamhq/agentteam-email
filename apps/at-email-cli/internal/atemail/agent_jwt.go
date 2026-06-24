package atemail

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

const agentJWTLifetime = time.Minute

type agentKeyJWK struct {
	Kty string `json:"kty"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	D   string `json:"d,omitempty"`
	Kid string `json:"kid,omitempty"`
}

func newAgentEd25519JWK() (agentKeyJWK, error) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return agentKeyJWK{}, newAgentMailError("could not generate Agent Auth key")
	}
	seed := privateKey.Seed()
	kidHash := sha256.Sum256(publicKey)
	return agentKeyJWK{
		Kty: "OKP",
		Crv: "Ed25519",
		X:   base64.RawURLEncoding.EncodeToString(publicKey),
		D:   base64.RawURLEncoding.EncodeToString(seed),
		Kid: base64.RawURLEncoding.EncodeToString(kidHash[:12]),
	}, nil
}

func (key agentKeyJWK) publicJWK() map[string]any {
	result := map[string]any{
		"crv": key.Crv,
		"kty": key.Kty,
		"x":   key.X,
	}
	if key.Kid != "" {
		result["kid"] = key.Kid
	}
	return result
}

func signAgentAuthJWT(key agentKeyJWK, typ string, claims map[string]any) (string, error) {
	if key.Kty != "OKP" || key.Crv != "Ed25519" || key.D == "" {
		return "", newAgentMailError("local at-email agent key is invalid")
	}
	seed, err := base64.RawURLEncoding.DecodeString(key.D)
	if err != nil || len(seed) != ed25519.SeedSize {
		return "", newAgentMailError("local at-email agent key is invalid")
	}
	header := map[string]any{
		"alg": "EdDSA",
		"typ": typ,
	}
	if key.Kid != "" {
		header["kid"] = key.Kid
	}
	encodedHeader, err := encodeJWTSegment(header)
	if err != nil {
		return "", err
	}
	encodedPayload, err := encodeJWTSegment(claims)
	if err != nil {
		return "", err
	}
	signingInput := encodedHeader + "." + encodedPayload
	signature := ed25519.Sign(ed25519.NewKeyFromSeed(seed), []byte(signingInput))
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func newAgentAuthClaims(issuer string, subject string, audience string, method string, htu string) (map[string]any, error) {
	jti, err := randomBase64URL(16)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	claims := map[string]any{
		"aud": audience,
		"exp": now.Add(agentJWTLifetime).Unix(),
		"iat": now.Unix(),
		"iss": issuer,
		"jti": jti,
	}
	if subject != "" {
		claims["sub"] = subject
	}
	if method != "" {
		claims["htm"] = method
	}
	if htu != "" {
		claims["htu"] = htu
	}
	return claims, nil
}

func encodeJWTSegment(value any) (string, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func randomBase64URL(size int) (string, error) {
	data := make([]byte, size)
	if _, err := rand.Read(data); err != nil {
		return "", newAgentMailError("could not generate Agent Auth nonce")
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func agentAuthAudience(baseURL string) string {
	return strings.TrimRight(baseURL, "/")
}

func agentAuthRequestURL(baseURL string, path string) string {
	return strings.TrimRight(baseURL, "/") + "/rpc/auth/api" + path
}

func requireAgentKeyLabel(key agentKeyJWK, label string) error {
	if key.Kty != "OKP" || key.Crv != "Ed25519" || key.X == "" || key.D == "" {
		return newAgentMailError(fmt.Sprintf("local at-email %s key is incomplete", label))
	}
	return nil
}
