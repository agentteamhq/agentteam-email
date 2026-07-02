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

	jose "github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
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
	kidHash := sha256.Sum256(publicKey)
	key, err := agentKeyFromJSONWebKey(jose.JSONWebKey{
		Key:   privateKey,
		KeyID: base64.RawURLEncoding.EncodeToString(kidHash[:12]),
	})
	if err != nil {
		return agentKeyJWK{}, newAgentMailError("could not generate Agent Auth key")
	}
	return key, nil
}

func agentKeyFromJSONWebKey(jwk jose.JSONWebKey) (agentKeyJWK, error) {
	data, err := json.Marshal(jwk)
	if err != nil {
		return agentKeyJWK{}, err
	}
	var key agentKeyJWK
	if err := json.Unmarshal(data, &key); err != nil {
		return agentKeyJWK{}, err
	}
	return key, nil
}

func (key agentKeyJWK) jsonWebKey() (jose.JSONWebKey, error) {
	if key.Kty != "OKP" || key.Crv != "Ed25519" {
		return jose.JSONWebKey{}, newAgentMailError("local at-email agent key is invalid")
	}
	data, err := json.Marshal(key)
	if err != nil {
		return jose.JSONWebKey{}, newAgentMailError("local at-email agent key is invalid")
	}
	var jwk jose.JSONWebKey
	if err := json.Unmarshal(data, &jwk); err != nil || !jwk.Valid() {
		return jose.JSONWebKey{}, newAgentMailError("local at-email agent key is invalid")
	}
	return jwk, nil
}

func (key agentKeyJWK) publicJWK() (map[string]any, error) {
	jwk, err := key.jsonWebKey()
	if err != nil {
		return nil, err
	}
	data, err := json.Marshal(jwk.Public())
	if err != nil {
		return nil, newAgentMailError("local at-email agent key is invalid")
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, newAgentMailError("local at-email agent key is invalid")
	}
	return result, nil
}

func signAgentAuthJWT(key agentKeyJWK, typ string, claims map[string]any) (string, error) {
	jwk, err := key.jsonWebKey()
	if err != nil {
		return "", err
	}
	privateKey, ok := jwk.Key.(ed25519.PrivateKey)
	if !ok {
		return "", newAgentMailError("local at-email agent key is invalid")
	}

	options := (&jose.SignerOptions{}).WithType(jose.ContentType(typ))
	if jwk.KeyID != "" {
		options = options.WithHeader(jose.HeaderKey("kid"), jwk.KeyID)
	}
	signer, err := jose.NewSigner(jose.SigningKey{
		Algorithm: jose.EdDSA,
		Key:       privateKey,
	}, options)
	if err != nil {
		return "", newAgentMailError("could not sign Agent Auth JWT")
	}
	token, err := jwt.Signed(signer).Claims(claims).Serialize()
	if err != nil {
		return "", newAgentMailError("could not sign Agent Auth JWT")
	}
	return token, nil
}

func newAgentAuthClaims(issuer string, subject string, audience string, method string, htu string) (map[string]any, error) {
	jti, err := randomBase64URL(16)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	claims, err := agentJWTClaimsMap(jwt.Claims{
		Audience: jwt.Audience{audience},
		Expiry:   jwt.NewNumericDate(now.Add(agentJWTLifetime)),
		ID:       jti,
		IssuedAt: jwt.NewNumericDate(now),
		Issuer:   issuer,
	})
	if err != nil {
		return nil, err
	}
	claims["aud"] = audience
	claims["iss"] = issuer
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

func agentJWTClaimsMap(claims jwt.Claims) (map[string]any, error) {
	data, err := json.Marshal(claims)
	if err != nil {
		return nil, err
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return result, nil
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
	return strings.TrimRight(baseURL, "/") + "/api/auth" + path
}

func requireAgentKeyLabel(key agentKeyJWK, label string) error {
	if key.Kty != "OKP" || key.Crv != "Ed25519" || key.X == "" || key.D == "" {
		return newAgentMailError(fmt.Sprintf("local at-email %s key is incomplete", label))
	}
	return nil
}
