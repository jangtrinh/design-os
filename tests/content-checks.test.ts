/**
 * `content-checks.ts` — pure per-rule content/UX-writing checks.
 * For each of the 9 checks: one positive fixture (fires the expected checkId/severity)
 * and one negative fixture (returns [] / does not include that checkId).
 */
import { describe, expect, it } from "vitest";
import {
  checkLoremIpsum, checkPlaceholderCopy, checkPlaceholderName, checkClickHereLink, checkErrorCodeAlone,
  checkExclamationOverload, checkInsensitiveTerms, checkPluralSHack, checkTextInImage, checkAllCapsShout,
} from "../src/core/content-checks.js";

describe("checkLoremIpsum (error)", () => {
  it("fires on 'lorem ipsum'", () => {
    const out = checkLoremIpsum("<p>Lorem ipsum placeholder content</p>");
    expect(out).toHaveLength(1);
    expect(out[0]?.checkId).toBe("lorem-ipsum");
    expect(out[0]?.severity).toBe("error");
  });
  it("fires on 'dolor sit amet' too", () => {
    const out = checkLoremIpsum("<p>consectetur dolor sit amet</p>");
    expect(out.map((f) => f.checkId)).toEqual(["lorem-ipsum"]);
  });
  it("does not fire on real copy", () => {
    expect(checkLoremIpsum("<p>Welcome back, please sign in</p>")).toEqual([]);
  });
});

describe("checkPlaceholderCopy (error)", () => {
  it("fires on 'insert text here'", () => {
    const out = checkPlaceholderCopy("<p>Insert text here</p>");
    expect(out).toHaveLength(1);
    expect(out[0]?.checkId).toBe("placeholder-copy");
    expect(out[0]?.severity).toBe("error");
  });
  it("fires on 'xxxx'", () => {
    const out = checkPlaceholderCopy("<p>Phone: xxxx-xxxx</p>");
    expect(out.map((f) => f.checkId)).toEqual(["placeholder-copy", "placeholder-copy"]);
  });
  it("does not fire on TODO", () => {
    expect(checkPlaceholderCopy("<p>TODO: ship it</p>")).toEqual([]);
  });
});

describe("checkPlaceholderName (error)", () => {
  it("fires on 'Jane Doe' in visible copy", () => {
    const out = checkPlaceholderName("<p>Signed, Jane Doe</p>");
    expect(out).toHaveLength(1);
    expect(out[0]?.checkId).toBe("placeholder-name");
    expect(out[0]?.severity).toBe("error");
  });
  it("fires on the 'Acme' company filler (with or without a suffix)", () => {
    expect(checkPlaceholderName("<h2>Welcome to Acme Corp</h2>")).toHaveLength(1);
    expect(checkPlaceholderName("<h2>Welcome to Acme</h2>")).toHaveLength(1);
  });
  it("ALSO fires inside an attribute value — the check scans raw HTML by design", () => {
    // A demo form shipping placeholder="Jane Doe" is still a placeholder-name tell,
    // so matching in an attribute is the intended, accepted behavior (not a false positive).
    expect(checkPlaceholderName('<input placeholder="Jane Doe">')).toHaveLength(1);
  });
  it("does not fire on a plausible real name outside the filler set", () => {
    expect(checkPlaceholderName("<p>Contact Sarah Chen for access</p>")).toEqual([]);
  });
});

describe("checkClickHereLink (warning)", () => {
  it("fires on vague link text 'click here'", () => {
    const out = checkClickHereLink('<a href="/x">Click here</a>');
    expect(out).toHaveLength(1);
    expect(out[0]?.checkId).toBe("click-here-link");
    expect(out[0]?.severity).toBe("warning");
  });
  it("does not fire on descriptive link text", () => {
    expect(checkClickHereLink('<a href="/x">View your invoice</a>')).toEqual([]);
  });
});

describe("checkErrorCodeAlone (warning)", () => {
  it("fires when an alert region shows only a bare code", () => {
    const out = checkErrorCodeAlone('<div role="alert">404</div>');
    expect(out).toHaveLength(1);
    expect(out[0]?.checkId).toBe("error-code-alone");
    expect(out[0]?.severity).toBe("warning");
  });
  it("does not fire when the region has a real sentence", () => {
    const out = checkErrorCodeAlone('<div role="alert">We could not process your request, please try again.</div>');
    expect(out).toEqual([]);
  });
});

describe("checkExclamationOverload (warning)", () => {
  it("fires on '!!'", () => {
    const out = checkExclamationOverload("<p>Wow!!</p>");
    expect(out).toHaveLength(1);
    expect(out[0]?.checkId).toBe("exclamation-overload");
    expect(out[0]?.severity).toBe("warning");
  });
  it("does not fire on a single exclamation mark", () => {
    expect(checkExclamationOverload("<p>Great job!</p>")).toEqual([]);
  });
});

describe("checkInsensitiveTerms (warning)", () => {
  it("fires on 'whitelist' and suggests 'allowlist'", () => {
    const out = checkInsensitiveTerms("<p>Add the IP to the whitelist</p>");
    expect(out).toHaveLength(1);
    expect(out[0]?.checkId).toBe("insensitive-terms");
    expect(out[0]?.severity).toBe("warning");
    expect(out[0]?.message).toContain("allowlist");
  });
  it("does not fire on other words", () => {
    expect(checkInsensitiveTerms("<p>Add the IP to the allowlist</p>")).toEqual([]);
  });
});

describe("checkPluralSHack (warning)", () => {
  it("fires on 'item(s)'", () => {
    const out = checkPluralSHack("<p>Select item(s) to delete</p>");
    expect(out).toHaveLength(1);
    expect(out[0]?.checkId).toBe("plural-s-hack");
    expect(out[0]?.severity).toBe("warning");
  });
  it("does not fire on a real plural", () => {
    expect(checkPluralSHack("<p>Select items to delete</p>")).toEqual([]);
  });
});

describe("checkTextInImage (warning)", () => {
  it("fires on a headline-looking src with a long alt", () => {
    const out = checkTextInImage('<img src="hero-banner.jpg" alt="Get fifty percent off your first order today">');
    expect(out).toHaveLength(1);
    expect(out[0]?.checkId).toBe("text-in-image");
    expect(out[0]?.severity).toBe("warning");
  });
  it("does not fire on a normal photo with a short alt", () => {
    expect(checkTextInImage('<img src="photo.jpg" alt="A dog">')).toEqual([]);
  });
});

describe("checkAllCapsShout (warning)", () => {
  it("fires on a run of 3+ all-caps words", () => {
    const out = checkAllCapsShout("<p>WARNING DANGER ALERT proceed carefully</p>");
    expect(out).toHaveLength(1);
    expect(out[0]?.checkId).toBe("all-caps-shout");
    expect(out[0]?.severity).toBe("warning");
  });
  it("does not fire on short acronyms", () => {
    expect(checkAllCapsShout("<p>The NASA API is great</p>")).toEqual([]);
  });
  it("does not fire on a single caps word", () => {
    expect(checkAllCapsShout("<p>STOP before continuing</p>")).toEqual([]);
  });
});
