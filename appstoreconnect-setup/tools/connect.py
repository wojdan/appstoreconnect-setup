#!/usr/bin/env python3
"""Writes the script that puts the product page's texts into App Store Connect through the page's own interface.

    python3 connect.py de fr --version-id ID [--app-info-id ID] [--save]

Run it from the project's root. The texts come from store/listing/<code>.json and pass listing.py's checks first; a
language with a problem is refused. The output is one JavaScript expression, run in the browser pane on a page of
App Store Connect where the owner is signed in (app-store-connect.md, "Texts through the page's own interface"):

  - Promotional Text, Description and Keywords of the version (--version-id: the appStoreVersions id);
  - Name and Subtitle of App Information (--app-info-id: the appInfos id).

Without --save the script only reads and reports, per language and field, whether App Store Connect holds the same
text; with --save it also saves what differs and reads every field back. Each text carries the SHA-256 of the file's
text: the script refuses to save a text whose copy in the page does not match it, so a character changed on the way
(a no-break space that became a space) is caught before it reaches the store. Invisible and space-like characters are
written as \\u escapes for the same reason. Keep a call to a few languages: long descriptions make a long script.
"""
import hashlib, json, os, re, sys, unicodedata
sys.dont_write_bytecode = True
from store import config, read
from listing import check

# The store folder's language codes and the locales App Store Connect's interface names them by. Apple adds
# languages: the localizations the script reads are the authority, and a code missing here is refused with a message.
LOCALE = {
    "ar": "ar-SA", "ca": "ca", "zh": "zh-Hans", "zh-hant": "zh-Hant", "hr": "hr", "cs": "cs", "da": "da", "nl": "nl-NL",
    "en-au": "en-AU", "en-ca": "en-CA", "en-gb": "en-GB", "en": "en-US", "fi": "fi", "fr": "fr-FR", "fr-ca": "fr-CA",
    "de": "de-DE", "el": "el", "he": "he", "hi": "hi", "hu": "hu", "id": "id", "it": "it", "ja": "ja", "ko": "ko",
    "ms": "ms", "no": "no", "pl": "pl", "pt-br": "pt-BR", "pt": "pt-PT", "ro": "ro", "ru": "ru", "sk": "sk",
    "es-419": "es-MX", "es-mx": "es-MX", "es": "es-ES", "sv": "sv", "th": "th", "tr": "tr", "uk": "uk", "vi": "vi",
}
VERSION_FIELDS = {"promotional": "promotionalText", "description": "description", "keywords": "keywords"}
APP_INFO_FIELDS = {"name": "name", "subtitle": "subtitle"}

def literal(value):
    """JSON for the script, with every invisible or space-like character other than a plain space as a \\u escape."""
    text = json.dumps(value, ensure_ascii=False, indent=1)
    return "".join(f"\\u{ord(c):04x}" if c != " " and unicodedata.category(c) in ("Zs", "Zl", "Zp", "Cf", "Cc") and c not in "\n" else c for c in text)

def texts(codes, fields):
    out = {}
    for code in codes:
        listing = read("listing", f"{code}.json")
        out[LOCALE[code]] = {}
        for ours, theirs in fields.items():
            if ours in listing:
                text = "\n".join(listing[ours]) if ours == "description" else listing[ours]
                out[LOCALE[code]][theirs] = {"text": text, "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest()}
    return out

SCRIPT = """(async () => {
  const save = %(save)s;
  const parts = %(parts)s;
  const sha256 = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const call = async (method, url, body) => {
    const answer = await fetch(url, { method, credentials: "include", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const text = await answer.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
    return { status: answer.status, json };
  };
  const read = async (part) => {
    const answer = await call("GET", part.list);
    if (answer.status !== 200 || !Array.isArray(answer.json?.data)) return null;
    return Object.fromEntries(answer.json.data.map((d) => [d.attributes.locale, d]));
  };
  const report = [];
  for (const part of parts) {
    const held = await read(part);
    if (!held) { report.push(`${part.type}: reading the localizations failed; enter these texts by hand`); continue; }
    for (const [locale, fields] of Object.entries(part.texts)) {
      const localization = held[locale];
      if (!localization) { report.push(`${locale}: App Store Connect has no such localization (${part.type}); add the language on the page first`); continue; }
      for (const [field, { text, sha256: expected }] of Object.entries(fields)) {
        if (await sha256(text) !== expected) { report.push(`${locale} ${field}: the text changed on its way into the page; not saved`); continue; }
        if (localization.attributes[field] === text) { report.push(`${locale} ${field}: already the same`); continue; }
        if (!save) { report.push(`${locale} ${field}: differs; --save would save it`); continue; }
        const saved = await call("PATCH", `/iris/v1/${part.type}/${localization.id}`, { data: { type: part.type, id: localization.id, attributes: { [field]: text } } });
        report.push(`${locale} ${field}: ${saved.status === 200 ? "saved" : `not saved (${saved.status}${saved.json?.errors?.[0]?.detail ? ": " + saved.json.errors[0].detail : ""})`}`);
      }
    }
    if (!save) continue;
    const back = await read(part);
    for (const [locale, fields] of Object.entries(part.texts))
      for (const [field, { text, sha256: expected }] of Object.entries(fields))
        if (back?.[locale] && await sha256(text) === expected && back[locale].attributes[field] !== text) report.push(`${locale} ${field}: what App Store Connect holds now differs from the file`);
    if (back) report.push(`${part.type}: read back after saving`);
  }
  return report.join("\\n");
})()"""

if __name__ == "__main__":
    args, options = [], {}
    argv = sys.argv[1:]
    while argv:
        a = argv.pop(0)
        if a in ("--version-id", "--app-info-id"):
            if not argv or not re.fullmatch(r"[\w-]+", argv[0]):
                sys.exit(f"{a} needs the id App Store Connect gives (in the page's network requests)")
            options[a] = argv.pop(0)
        elif a == "--save":
            options[a] = True
        elif a.startswith("--"):
            sys.exit(f"unknown option {a}")
        else:
            args.append(a)
    if not options.get("--version-id") and not options.get("--app-info-id"):
        sys.exit("usage: python3 connect.py <code>… --version-id ID [--app-info-id ID] [--save]")
    cfg = config()
    codes = args or cfg["languages"]
    for code in codes:
        if code not in LOCALE:
            sys.exit(f"{code}: no App Store Connect locale known for it; add it to LOCALE in connect.py after reading the "
                     "locale from the page")
        problems = check(cfg, code)
        if problems:
            sys.exit(f"{code}: listing.py finds {len(problems)} problem(s); fix them first ({problems[0]})")
    parts = []
    if options.get("--version-id"):
        parts.append({"type": "appStoreVersionLocalizations", "texts": texts(codes, VERSION_FIELDS),
                      "list": f"/iris/v1/appStoreVersionLocalizations?filter[appStoreVersion]={options['--version-id']}&limit=50"})
    if options.get("--app-info-id"):
        parts.append({"type": "appInfoLocalizations", "texts": texts(codes, APP_INFO_FIELDS),
                      "list": f"/iris/v1/appInfoLocalizations?filter[appInfo]={options['--app-info-id']}&limit=50"})
    print(SCRIPT % {"save": "true" if options.get("--save") else "false", "parts": literal(parts)})
