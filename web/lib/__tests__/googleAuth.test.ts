import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isGoogleAuthConfigured,
  signGoogleState,
  verifyGoogleState,
  buildGoogleAuthUrl,
  signPendingGoogleProfile,
  verifyPendingGoogleProfile,
} from "../googleAuth";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("isGoogleAuthConfigured", () => {
  it("her iki env de yoksa false döner", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(isGoogleAuthConfigured()).toBe(false);
  });

  it("sadece biri varsa false döner", () => {
    process.env.GOOGLE_CLIENT_ID = "abc";
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(isGoogleAuthConfigured()).toBe(false);
  });

  it("ikisi de varsa true döner", () => {
    process.env.GOOGLE_CLIENT_ID = "abc";
    process.env.GOOGLE_CLIENT_SECRET = "def";
    expect(isGoogleAuthConfigured()).toBe(true);
  });
});

describe("signGoogleState / verifyGoogleState", () => {
  it("login intent'i round-trip doğru çözülür", async () => {
    const state = await signGoogleState("login");
    const result = await verifyGoogleState(state);
    expect(result).toEqual({ intent: "login" });
  });

  it("register intent'i round-trip doğru çözülür", async () => {
    const state = await signGoogleState("register");
    const result = await verifyGoogleState(state);
    expect(result).toEqual({ intent: "register" });
  });

  it("bozuk/geçersiz state için null döner", async () => {
    const result = await verifyGoogleState("not-a-real-jwt");
    expect(result).toBeNull();
  });
});

describe("buildGoogleAuthUrl", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
  });

  it("Google'ın auth endpoint'ine gerekli parametrelerle URL kurar", () => {
    const url = buildGoogleAuthUrl("some-state-token");
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
    expect(parsed.searchParams.get("state")).toBe("some-state-token");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("scope")).toBe("openid email profile");
  });
});

describe("signPendingGoogleProfile / verifyPendingGoogleProfile", () => {
  it("profil round-trip doğru çözülür", async () => {
    const token = await signPendingGoogleProfile({
      googleId: "g-123",
      email: "ayse@example.com",
      name: "Ayşe Yılmaz",
    });
    const result = await verifyPendingGoogleProfile(token);
    expect(result).toEqual({
      googleId: "g-123",
      email: "ayse@example.com",
      name: "Ayşe Yılmaz",
    });
  });

  it("bozuk token için null döner", async () => {
    const result = await verifyPendingGoogleProfile("garbage");
    expect(result).toBeNull();
  });
});
