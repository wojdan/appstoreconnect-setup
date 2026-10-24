#!/usr/bin/env node
// Puts the approved pictures and the video into App Store Connect through its API, with the owner's API key: the
// screenshots of every set, the product page header and the search-results video of each language, on the iOS
// version in "Prepare for Submission". Nothing is submitted to Apple.
//
// Usage: node upload.mjs --check [code…] [options]     reads the account and says what it would do; changes nothing
//        node upload.mjs [code…] [options]             does it
//        node upload.mjs --ref                         prints the shape of Apple's reference data, when a lookup fails
// Options: --only frames,header,video   which assets (all three by default)
//          --frames <pattern> --header <pattern> --video <pattern>
//                                        where the files are; {code} is the language, {set} the set's folder, {n}
//                                        the frame. Defaults: store/approved/{code}/{set}frame-{n}.png,
//                                        store/approved/{code}/header.png, store/approved/{code}/search-video.mp4
// Run from the project's root. The key: ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH from the environment, or from the
// file that ASC_ENV or "connect.env" in store.config.json names (lines KEY=value); the key file defaults to
// ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8. The key and the token made from it are never printed.
// The app: "connect.bundleId" in store.config.json.
//
// Through App Store Connect's asset library: each file is reserved, sent in the parts the API names, committed and
// waited for; the specification it must match, the placement type and the placement group come from Apple's
// reference data and the file's own size, not from a list kept here. A file already in the library under the same
// reference name (the language, the file's name and its checksum) is placed again instead of uploaded again, so a
// run that stopped halfway can simply be repeated. In each language, the placements of that type and group that are
// there are removed first (a group holds a limited number), then the new ones are placed and put in order. Assets
// are never deleted from the library.
import { createHash, createPrivateKey, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { config, shown, toolsDir } from "./lib.mjs";

const API = process.env.ASC_API ?? "https://api.appstoreconnect.apple.com";
const KINDS = ["frames", "header", "video"];
const stop = (message) => { console.error(`stop: ${message}`); process.exit(1); };

// ---- arguments ----
const argv = process.argv.slice(2), opts = { only: KINDS }, codes = [];
while (argv.length) {
  const a = argv.shift();
  if (a === "--check") opts.check = true;
  else if (a === "--ref") opts.ref = true;
  else if (a === "--only") opts.only = (argv.shift() ?? "").split(",").filter(Boolean);
  else if (["--frames", "--header", "--video"].includes(a)) opts[a.slice(2)] = argv.shift();
  else if (a.startsWith("--")) stop(`unknown option ${a}`);
  else codes.push(a);
}
for (const kind of opts.only) if (!KINDS.includes(kind)) stop(`--only takes ${KINDS.join(", ")}`);

const cfg = await config();
const locales = JSON.parse(readFileSync(path.join(toolsDir, "locales.json"), "utf8"));
const languages = codes.length ? codes : cfg.languages;
for (const code of languages) if (!locales[code]) stop(`${code}: no App Store Connect locale known for it; add it to tools/locales.json`);

// ---- the key, and a token signed in memory ----
function keyConfig() {
  const values = {};
  const file = process.env.ASC_ENV ?? cfg.connect?.env;
  if (file) {
    const full = file.replace(/^~(?=\/)/, homedir());
    if (!existsSync(full)) stop(`${file}: no such file (it holds ASC_KEY_ID and ASC_ISSUER_ID)`);
    for (const line of readFileSync(full, "utf8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?(ASC_\w+)\s*=\s*["']?(.*?)["']?\s*$/);
      if (m) values[m[1]] = m[2];
    }
  }
  for (const name of ["ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_PATH"]) if (process.env[name]) values[name] = process.env[name];
  if (!values.ASC_KEY_ID || !values.ASC_ISSUER_ID) stop("no API key: ASC_KEY_ID and ASC_ISSUER_ID are needed (upload.md, \"The owner's API key\")");
  const keyPath = (values.ASC_KEY_PATH ?? `~/.appstoreconnect/private_keys/AuthKey_${values.ASC_KEY_ID}.p8`).replace(/^~(?=\/)/, homedir());
  if (!existsSync(keyPath)) stop(`the key file is not where it should be (${shown(keyPath)})`);
  return { id: values.ASC_KEY_ID, issuer: values.ASC_ISSUER_ID, key: createPrivateKey(readFileSync(keyPath)) };
}
const key = keyConfig();
let token = null, tokenUntil = 0;
function bearer() {
  const now = Math.floor(Date.now() / 1000);
  if (token && now < tokenUntil - 60) return token;
  const part = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${part({ alg: "ES256", kid: key.id, typ: "JWT" })}.${part({ iss: key.issuer, iat: now, exp: now + 1080, aud: "appstoreconnect-v1" })}`;
  token = `${body}.${sign("sha256", Buffer.from(body), { key: key.key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  tokenUntil = now + 1080;
  return token;
}

// ---- the API ----
async function call(method, route, { query, body, allow = [] } = {}) {
  const url = new URL(API + route);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  for (let attempt = 1; ; attempt++) {
    const answer = await fetch(url, { method, headers: { Authorization: `Bearer ${bearer()}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await answer.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
    if (answer.status === 429 && attempt < 5) { await sleep(2000 * attempt); continue; }
    if (answer.ok || allow.includes(answer.status)) return { status: answer.status, json };
    const error = json?.errors?.[0];
    if (answer.status === 401) stop("App Store Connect refused the key (401): the key ID, the issuer ID or the file do not match, or the key was revoked");
    if (answer.status === 403) stop(`the key may not do this (403${error?.detail ? `: ${error.detail}` : ""}); the asset library needs the role App Manager, Admin or Account Holder`);
    stop(`${method} ${route}: ${answer.status}${error ? ` ${error.code ?? ""} ${error.detail ?? error.title ?? ""}` : ""}`);
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function all(route, query) {
  const out = [];
  let next = route, q = { limit: "200", ...query };
  while (next) {
    const { json } = await call("GET", next, { query: q });
    out.push(...(json.data ?? []));
    next = json.links?.next ? json.links.next.replace(API, "") : null;
    q = undefined;
  }
  return out;
}

// ---- the files ----
function pattern(kind) {
  if (opts[kind]) return opts[kind];
  return { frames: "store/approved/{code}/{set}frame-{n}.png", header: "store/approved/{code}/header.png", video: "store/approved/{code}/search-video.mp4" }[kind];
}
const fill = (p, values) => p.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");
function pngSize(file) {
  const b = readFileSync(file);
  if (b.toString("ascii", 1, 4) !== "PNG") return jpegSize(b, file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}
function jpegSize(b, file) {
  for (let i = 2; i < b.length;) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1], length = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    i += 2 + length;
  }
  stop(`${shown(file)}: neither a PNG nor a JPEG`);
}
// The video's size from its first track header with a width (an MP4 or MOV's tkhd box); ffprobe when that fails.
function videoSize(file) {
  const b = readFileSync(file);
  for (let at = b.indexOf("tkhd"); at > 3; at = b.indexOf("tkhd", at + 4)) {
    const v = at + 4, offset = b[v] === 1 ? 88 : 76;
    if (v + offset + 8 > b.length) break;
    const width = b.readUInt32BE(v + offset) >>> 16, height = b.readUInt32BE(v + offset + 4) >>> 16;
    if (width && height) return { width, height };
  }
  try {
    const [width, height] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" }).trim().split(",").map(Number);
    return { width, height };
  } catch { stop("ffprobe (from ffmpeg) is needed to read the video's size"); }
}
// What goes up for one language: a list of groups of files, each group one placement type in order.
function filesOf(code) {
  const out = [];
  if (opts.only.includes("frames")) {
    const sets = [null, ...Object.keys(cfg.frames?.sets ?? {})];
    for (const set of sets) {
      const files = [];
      for (let n = 1; ; n++) {
        const file = path.resolve(fill(pattern("frames"), { code, set: set ? `${set}/` : "", n }));
        if (!existsSync(file)) break;
        files.push(file);
      }
      if (files.length) out.push({ kind: "frames", label: set ? `frames (${set})` : "frames", files, media: "image" });
      else if (!set) stop(`${code}: no frames at ${fill(pattern("frames"), { code, set: "", n: 1 })}`);
    }
  }
  if (opts.only.includes("header")) {
    const file = path.resolve(fill(pattern("header"), { code }));
    if (existsSync(file)) out.push({ kind: "header", label: "header", files: [file], media: "image" });
    else console.error(`${code}: no header at ${shown(file)}, left out`);
  }
  if (opts.only.includes("video")) {
    const file = path.resolve(fill(pattern("video"), { code }));
    if (existsSync(file)) out.push({ kind: "video", label: "search-results video", files: [file], media: "video" });
    else console.error(`${code}: no search-results video at ${shown(file)}, left out`);
  }
  return out;
}

// ---- Apple's reference data: which specification, placement type and group a file belongs to ----
const { json: refAnswer } = await call("GET", "/v1/appAssetLibraryRefData");
const ref = (Array.isArray(refAnswer.data) ? refAnswer.data[0] : refAnswer.data).attributes;
if (opts.ref) {
  for (const [name, list] of Object.entries(ref)) console.log(`${name}: ${Array.isArray(list) ? `${list.length} entries, the first: ${JSON.stringify(list[0])?.slice(0, 600)}` : JSON.stringify(list)?.slice(0, 300)}`);
  process.exit(0);
}
const versionPolicy = (ref.features ?? []).find((f) => (f.featureId ?? f.feature) === "APP_STORE_VERSIONS");
const typesOnVersions = new Set((versionPolicy?.placementPolicies ?? []).map((p) => p.placementType));
const limitOf = (type, group) => {
  const policy = (versionPolicy?.placementPolicies ?? []).find((p) => p.placementType === type);
  return (policy?.groupLimits ?? []).find((l) => (l.groupIds ?? []).includes(group))?.maxCount;
};
function resolve(entry, size, ext) {
  const specs = (entry.media === "video" ? ref.videoSpecs : ref.imageSpecs) ?? [];
  const fits = specs.filter((s) => s.dimensions?.minWidth <= size.width && size.width <= s.dimensions?.maxWidth && s.dimensions?.minHeight <= size.height && size.height <= s.dimensions?.maxHeight && (s.fileExtensions ?? [ext]).includes(ext));
  let types;
  if (entry.kind === "frames") types = ["APP_SCREENSHOT"];
  else if (entry.kind === "header") types = ["PRODUCT_PAGE_HEADER_ASSET"];
  else types = [...new Set(fits.flatMap((s) => s.compatiblePlacementTypes ?? []))].filter((t) => t !== "PRODUCT_PAGE_HEADER_ASSET" && t !== "APP_PREVIEW" && (typesOnVersions.size === 0 || typesOnVersions.has(t)));
  if (types.length !== 1) return { problem: types.length ? `fits several placement types (${types.join(", ")}); say which with the owner` : `${size.width} × ${size.height} fits no placement type of an App Store version` };
  const type = types[0], spec = fits.find((s) => (s.compatiblePlacementTypes ?? []).includes(type));
  if (!spec) return { problem: `${size.width} × ${size.height} is no size App Store Connect takes for ${type}` };
  const typeEntry = (ref.placementTypes ?? []).find((t) => (t.placementTypeId ?? t.placementType) === type);
  const groups = (typeEntry?.specMappings ?? []).filter((m) => (m.specs ?? []).includes(spec.specId)).map((m) => m.placementGroupId ?? m.placementGroup);
  if (!groups.length) return { problem: `no placement group takes ${spec.shortName} for ${type}${typeEntry ? "" : " (the reference data names it differently: node upload.mjs --ref)"}` };
  if (entry.kind === "frames" && groups.length > 1) return { problem: `${spec.shortName} fits several groups (${groups.join(", ")}); render the set at the size of one display class` };
  return { type, spec, groups, category: (typeEntry?.acceptsAssetCategories ?? [entry.kind === "frames" ? "APP_SCREENSHOTS_AND_PREVIEWS" : "CREATIVE_ASSETS"])[0] };
}

// ---- the app, its version and its localizations ----
const bundleId = cfg.connect?.bundleId ?? stop('"connect": {"bundleId": "…"} is missing in store.config.json');
const [app] = await all("/v1/apps", { "filter[bundleId]": bundleId, "fields[apps]": "bundleId,name" });
if (!app) stop(`the key sees no app with the bundle ID ${bundleId}`);
const [version] = await all(`/v1/apps/${app.id}/appStoreVersions`, { "filter[platform]": "IOS", "filter[appStoreState]": "PREPARE_FOR_SUBMISSION", "fields[appStoreVersions]": "versionString" });
if (!version) stop('no iOS version in "Prepare for Submission": pictures can be placed only on a version that is still being prepared');
const localizations = Object.fromEntries((await all(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`, { "fields[appStoreVersionLocalizations]": "locale" })).map((d) => [d.attributes.locale, d.id]));
const { json: libraryAnswer } = await call("GET", `/v1/apps/${app.id}/assetLibrary`);
const library = libraryAnswer.data.id;
console.log(`${app.attributes.name}, version ${version.attributes.versionString}: ${languages.length} language(s)${opts.check ? " (check: nothing changes)" : ""}`);

// ---- the plan ----
const plan = [];
for (const code of languages) {
  const locale = locales[code], localization = localizations[locale];
  if (!localization) { console.log(`${code} (${locale}): the version has no such localization; add the language in App Store Connect first`); continue; }
  for (const entry of filesOf(code)) {
    const first = entry.files[0], ext = path.extname(first).toLowerCase();
    const sizes = entry.files.map((f) => (entry.media === "video" ? videoSize(f) : pngSize(f)));
    if (sizes.some((s) => s.width !== sizes[0].width || s.height !== sizes[0].height)) { console.log(`${code} ${entry.label}: the files are not all one size`); continue; }
    const found = resolve(entry, sizes[0], ext);
    if (found.problem) { console.log(`${code} ${entry.label}: ${found.problem}`); continue; }
    for (const group of found.groups) {
      const limit = limitOf(found.type, group);
      if (limit && entry.files.length > limit) { console.log(`${code} ${entry.label}: ${entry.files.length} files, ${group} holds ${limit}`); continue; }
      const existing = await all(`/v1/appStoreVersionLocalizations/${localization}/placements`, { "filter[placementType]": found.type, "filter[placementGroup]": group, sort: "placementGroupPosition" });
      plan.push({ code, locale, localization, entry, ...found, group, existing });
      console.log(`${code} ${entry.label}: ${entry.files.length} file(s), ${found.spec.shortName}, ${found.type} in ${group}; ${existing.length} there now ${opts.check ? "would be replaced" : "to be replaced"}`);
    }
  }
}
if (opts.check || !plan.length) { console.log(opts.check ? "checked; nothing changed" : "nothing to do"); process.exit(0); }

// ---- uploading ----
const assetType = (media) => (media === "video" ? "appAssetLibraryVideos" : "appAssetLibraryImages");
async function asset(item, file) {
  const data = readFileSync(file), sum = createHash("sha256").update(data).digest("hex").slice(0, 16);
  const type = assetType(item.entry.media), referenceName = `${item.code}/${path.basename(file)} ${sum}`;
  const [kept] = await all(`/v1/appAssetLibraries/${library}/${item.entry.media === "video" ? "videos" : "images"}`, { "filter[referenceName]": referenceName });
  if (kept && !["FAILED", "AWAITING_UPLOAD"].includes(kept.attributes.state)) return kept.id;
  const { json } = await call("POST", `/v1/${type}`, { body: { data: { type, attributes: { fileName: path.basename(file), fileSize: data.length, category: item.category, referenceName }, relationships: { assetLibrary: { data: { type: "appAssetLibraries", id: library } } } } } });
  const reserved = json.data;
  await Promise.all(reserved.attributes.uploadOperations.map(async (part) => {
    for (let attempt = 1; ; attempt++) {
      const answer = await fetch(part.url, { method: part.method, headers: Object.fromEntries((part.requestHeaders ?? []).map((h) => [h.name, h.value])), body: data.subarray(part.offset, part.offset + part.length) }).catch(() => null);
      if (answer?.ok) return;
      if (attempt === 3) stop(`${shown(file)}: a part of the upload was refused (${answer?.status ?? "no answer"})`);
    }
  }));
  await call("PATCH", `/v1/${type}/${reserved.id}`, { body: { data: { type, id: reserved.id, attributes: { uploaded: true } } } });
  return reserved.id;
}
async function processed(item, id, file) {
  const type = assetType(item.entry.media), until = Date.now() + (item.entry.media === "video" ? 45 : 15) * 60000;
  while (Date.now() < until) {
    const { json } = await call("GET", `/v1/${type}/${id}`);
    const a = json.data.attributes;
    if (a.state === "FAILED") stop(`${shown(file)}: App Store Connect could not process it${a.stateDetails ? ` (${JSON.stringify(a.stateDetails)})` : ""}`);
    if (!["AWAITING_UPLOAD", "UPLOAD_COMPLETE"].includes(a.state)) {
      if (a.specId && a.specId !== item.spec.specId) console.error(`warning: ${shown(file)} was matched to another specification than ${item.spec.shortName}`);
      return;
    }
    await sleep(5000);
  }
  stop(`${shown(file)}: still processing; run the same command again later`);
}

for (const item of plan) {
  const ids = [];
  for (const file of item.entry.files) ids.push(await asset(item, file));
  for (const [i, id] of ids.entries()) await processed(item, id, item.entry.files[i]);
  for (const old of item.existing) await call("DELETE", `/v1/appAssetLibraryPlacements/${old.id}`, { allow: [404] });
  const placed = [];
  for (const id of ids) {
    const { json } = await call("POST", "/v1/appAssetLibraryPlacements", { body: { data: { type: "appAssetLibraryPlacements", attributes: { placementType: item.type, placementGroup: item.group }, relationships: { [item.entry.media]: { data: { type: assetType(item.entry.media), id } }, appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: item.localization } } } } } });
    placed.push(json.data.id);
  }
  if (placed.length > 1) await call("POST", "/v1/appAssetLibraryPlacementOrderingRequests", { body: { data: { type: "appAssetLibraryPlacementOrderingRequests", attributes: { placementGroup: item.group }, relationships: { orderedPlacements: { data: placed.map((id) => ({ type: "appAssetLibraryPlacements", id })) }, appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: item.localization } } } } } });
  const now = await all(`/v1/appStoreVersionLocalizations/${item.localization}/placements`, { "filter[placementType]": item.type, "filter[placementGroup]": item.group, sort: "placementGroupPosition" });
  const inOrder = now.map((p) => p.id).join() === placed.join();
  console.log(`${item.code} ${item.entry.label}: ${item.existing.length} removed, ${placed.length} placed${placed.length > 1 ? (inOrder ? ", in order" : ", ORDER DIFFERS: look at it") : ""}`);
}
console.log("done; nothing was submitted");
