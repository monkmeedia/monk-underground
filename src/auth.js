// Spotify Authorization Code flow with PKCE.
//
// Spotify removed the Implicit Grant flow (`response_type=token`), which is why
// /authorize now answers "response_type must be code". PKCE is the replacement
// for browser-only apps like this one: no client secret is involved, the app
// proves it started the login by holding on to a random `code_verifier`.
//
// The redirect URI is derived from wherever the app is being served, so the
// same build works locally and on monkunderground.com. Both of these must be
// registered, character for character, in the Spotify developer dashboard:
//
//     http://127.0.0.1:3000       (dev — Spotify no longer accepts "localhost")
//     https://monkunderground.com (production)

const CLIENT_ID = "d0db6dd1a5ef4b7f8a493a84259ae21c";
const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const SCOPE = "user-top-read";

// No trailing slash: window.location.origin never has one, and the redirect URI
// sent here has to match the registered one character for character.
const REDIRECT_URI = window.location.origin;

const ACCESS_TOKEN_KEY = "spotify_access_token";
const REFRESH_TOKEN_KEY = "spotify_refresh_token";
const EXPIRES_AT_KEY = "spotify_expires_at";
const VERIFIER_KEY = "spotify_code_verifier";
const STATE_KEY = "spotify_auth_state";
const LEGACY_TOKEN_KEY = "token"; // left over from the old implicit flow

// Refresh a little early so a request never goes out with a just-expired token.
const EXPIRY_SKEW_MS = 60 * 1000;

const base64url = (bytes) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

const randomString = (byteLength = 64) =>
    base64url(window.crypto.getRandomValues(new Uint8Array(byteLength)));

const codeChallenge = async (verifier) => {
    const digest = await window.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier)
    );
    return base64url(digest);
};

const storeTokens = (data) => {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
    window.localStorage.setItem(
        EXPIRES_AT_KEY,
        String(Date.now() + data.expires_in * 1000)
    );
    // A refresh only returns a new refresh_token some of the time; keep the old
    // one when it doesn't.
    if (data.refresh_token) {
        window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
    }
};

export const logout = () => {
    [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, EXPIRES_AT_KEY, LEGACY_TOKEN_KEY].forEach(
        (key) => window.localStorage.removeItem(key)
    );
    window.sessionStorage.removeItem(VERIFIER_KEY);
    window.sessionStorage.removeItem(STATE_KEY);
};

export const redirectToSpotifyAuth = async () => {
    const verifier = randomString();
    const state = randomString(16);

    window.sessionStorage.setItem(VERIFIER_KEY, verifier);
    window.sessionStorage.setItem(STATE_KEY, state);

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        redirect_uri: REDIRECT_URI,
        scope: SCOPE,
        state,
        code_challenge_method: "S256",
        code_challenge: await codeChallenge(verifier),
        show_dialog: "true",
    });

    window.location.href = `${AUTH_ENDPOINT}?${params}`;
};

const postToken = async (body) => {
    const response = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error_description || data.error || "Token request failed");
    }
    return data;
};

// React StrictMode runs effects twice in development. An authorization code is
// single use, so the second run has to reuse the first exchange rather than
// trade the same code in again.
let pendingExchange = null;

const exchangeCode = async (code) => {
    const verifier = window.sessionStorage.getItem(VERIFIER_KEY);
    if (!verifier) {
        throw new Error("Missing PKCE verifier — start the login again.");
    }

    const data = await postToken({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
    });

    window.sessionStorage.removeItem(VERIFIER_KEY);
    window.sessionStorage.removeItem(STATE_KEY);
    storeTokens(data);
    return data.access_token;
};

const refreshAccessToken = async () => {
    const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    try {
        const data = await postToken({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        });
        storeTokens(data);
        return data.access_token;
    } catch {
        logout();
        return null;
    }
};

// Consumes ?code=… if we just came back from Spotify, otherwise falls back to
// the stored token (refreshing it when it has aged out). Returns null when the
// user still needs to log in.
export const getAccessToken = async () => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const clearQuery = () =>
        window.history.replaceState({}, document.title, url.pathname);

    if (error) {
        clearQuery();
        throw new Error(error);
    }

    if (code) {
        if (!pendingExchange) {
            const expectedState = window.sessionStorage.getItem(STATE_KEY);
            pendingExchange =
                state && state === expectedState
                    ? exchangeCode(code)
                    : Promise.reject(new Error("State mismatch — login was not started here."));
            pendingExchange.catch(() => {}); // handled by the caller awaiting it
        }
        clearQuery();
        return pendingExchange;
    }

    const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);
    const expiresAt = Number(window.localStorage.getItem(EXPIRES_AT_KEY));

    if (token && expiresAt - EXPIRY_SKEW_MS > Date.now()) {
        return token;
    }

    return refreshAccessToken();
};
