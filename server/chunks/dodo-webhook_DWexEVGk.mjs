globalThis.process ??= {};
globalThis.process.env ??= {};
import nodeCrypto from "node:crypto";
import { env } from "cloudflare:workers";
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (typeof state === "function" ? receiver !== state || true : !state.has(receiver))
    throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return state.set(receiver, value), value;
}
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f)
    throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
    throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
let uuid4 = function() {
  const { crypto: crypto2 } = globalThis;
  if (crypto2?.randomUUID) {
    uuid4 = crypto2.randomUUID.bind(crypto2);
    return crypto2.randomUUID();
  }
  const u8 = new Uint8Array(1);
  const randomByte = crypto2 ? () => crypto2.getRandomValues(u8)[0] : () => Math.random() * 255 & 255;
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ randomByte() & 15 >> +c / 4).toString(16));
};
function isAbortError(err) {
  return typeof err === "object" && err !== null && // Spec-compliant fetch implementations
  ("name" in err && err.name === "AbortError" || // Expo fetch
  "message" in err && String(err.message).includes("FetchRequestCanceledException"));
}
const castToError = (err) => {
  if (err instanceof Error)
    return err;
  if (typeof err === "object" && err !== null) {
    try {
      if (Object.prototype.toString.call(err) === "[object Error]") {
        const error = new Error(err.message, err.cause ? { cause: err.cause } : {});
        if (err.stack)
          error.stack = err.stack;
        if (err.cause && !error.cause)
          error.cause = err.cause;
        if (err.name)
          error.name = err.name;
        return error;
      }
    } catch {
    }
    try {
      return new Error(JSON.stringify(err));
    } catch {
    }
  }
  return new Error(err);
};
class DodoPaymentsError extends Error {
}
class APIError extends DodoPaymentsError {
  constructor(status, error, message, headers) {
    super(`${APIError.makeMessage(status, error, message)}`);
    this.status = status;
    this.headers = headers;
    this.error = error;
  }
  static makeMessage(status, error, message) {
    const msg = error?.message ? typeof error.message === "string" ? error.message : JSON.stringify(error.message) : error ? JSON.stringify(error) : message;
    if (status && msg) {
      return `${status} ${msg}`;
    }
    if (status) {
      return `${status} status code (no body)`;
    }
    if (msg) {
      return msg;
    }
    return "(no status code or body)";
  }
  static generate(status, errorResponse, message, headers) {
    if (!status || !headers) {
      return new APIConnectionError({ message, cause: castToError(errorResponse) });
    }
    const error = errorResponse;
    if (status === 400) {
      return new BadRequestError(status, error, message, headers);
    }
    if (status === 401) {
      return new AuthenticationError(status, error, message, headers);
    }
    if (status === 403) {
      return new PermissionDeniedError(status, error, message, headers);
    }
    if (status === 404) {
      return new NotFoundError(status, error, message, headers);
    }
    if (status === 409) {
      return new ConflictError(status, error, message, headers);
    }
    if (status === 422) {
      return new UnprocessableEntityError(status, error, message, headers);
    }
    if (status === 429) {
      return new RateLimitError(status, error, message, headers);
    }
    if (status >= 500) {
      return new InternalServerError(status, error, message, headers);
    }
    return new APIError(status, error, message, headers);
  }
}
class APIUserAbortError extends APIError {
  constructor({ message } = {}) {
    super(void 0, void 0, message || "Request was aborted.", void 0);
  }
}
class APIConnectionError extends APIError {
  constructor({ message, cause }) {
    super(void 0, void 0, message || "Connection error.", void 0);
    if (cause)
      this.cause = cause;
  }
}
class APIConnectionTimeoutError extends APIConnectionError {
  constructor({ message } = {}) {
    super({ message: message ?? "Request timed out." });
  }
}
class BadRequestError extends APIError {
}
class AuthenticationError extends APIError {
}
class PermissionDeniedError extends APIError {
}
class NotFoundError extends APIError {
}
class ConflictError extends APIError {
}
class UnprocessableEntityError extends APIError {
}
class RateLimitError extends APIError {
}
class InternalServerError extends APIError {
}
const startsWithSchemeRegexp = /^[a-z][a-z0-9+.-]*:/i;
const isAbsoluteURL = (url) => {
  return startsWithSchemeRegexp.test(url);
};
let isArray = (val) => (isArray = Array.isArray, isArray(val));
let isReadonlyArray = isArray;
function maybeObj(x) {
  if (typeof x !== "object") {
    return {};
  }
  return x ?? {};
}
function isEmptyObj(obj) {
  if (!obj)
    return true;
  for (const _k in obj)
    return false;
  return true;
}
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
const validatePositiveInteger = (name, n) => {
  if (typeof n !== "number" || !Number.isInteger(n)) {
    throw new DodoPaymentsError(`${name} must be an integer`);
  }
  if (n < 0) {
    throw new DodoPaymentsError(`${name} must be a positive integer`);
  }
  return n;
};
const safeJSON = (text) => {
  try {
    return JSON.parse(text);
  } catch (err) {
    return void 0;
  }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const VERSION = "2.42.2";
function getDetectedPlatform() {
  if (typeof Deno !== "undefined" && Deno.build != null) {
    return "deno";
  }
  if (typeof EdgeRuntime !== "undefined") {
    return "edge";
  }
  if (Object.prototype.toString.call(typeof globalThis.process !== "undefined" ? globalThis.process : 0) === "[object process]") {
    return "node";
  }
  return "unknown";
}
const getPlatformProperties = () => {
  const detectedPlatform = getDetectedPlatform();
  if (detectedPlatform === "deno") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": normalizePlatform(Deno.build.os),
      "X-Stainless-Arch": normalizeArch(Deno.build.arch),
      "X-Stainless-Runtime": "deno",
      "X-Stainless-Runtime-Version": typeof Deno.version === "string" ? Deno.version : Deno.version?.deno ?? "unknown"
    };
  }
  if (typeof EdgeRuntime !== "undefined") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": "Unknown",
      "X-Stainless-Arch": `other:${EdgeRuntime}`,
      "X-Stainless-Runtime": "edge",
      "X-Stainless-Runtime-Version": globalThis.process.version
    };
  }
  if (detectedPlatform === "node") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": normalizePlatform(globalThis.process.platform ?? "unknown"),
      "X-Stainless-Arch": normalizeArch(globalThis.process.arch ?? "unknown"),
      "X-Stainless-Runtime": "node",
      "X-Stainless-Runtime-Version": globalThis.process.version ?? "unknown"
    };
  }
  const browserInfo = getBrowserInfo();
  if (browserInfo) {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": "Unknown",
      "X-Stainless-Arch": "unknown",
      "X-Stainless-Runtime": `browser:${browserInfo.browser}`,
      "X-Stainless-Runtime-Version": browserInfo.version
    };
  }
  return {
    "X-Stainless-Lang": "js",
    "X-Stainless-Package-Version": VERSION,
    "X-Stainless-OS": "Unknown",
    "X-Stainless-Arch": "unknown",
    "X-Stainless-Runtime": "unknown",
    "X-Stainless-Runtime-Version": "unknown"
  };
};
function getBrowserInfo() {
  if (typeof navigator === "undefined" || !navigator) {
    return null;
  }
  const browserPatterns = [
    { key: "edge", pattern: /Edge(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "ie", pattern: /MSIE(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "ie", pattern: /Trident(?:.*rv\:(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "chrome", pattern: /Chrome(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "firefox", pattern: /Firefox(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "safari", pattern: /(?:Version\W+(\d+)\.(\d+)(?:\.(\d+))?)?(?:\W+Mobile\S*)?\W+Safari/ }
  ];
  for (const { key, pattern } of browserPatterns) {
    const match = pattern.exec(navigator.userAgent);
    if (match) {
      const major = match[1] || 0;
      const minor = match[2] || 0;
      const patch = match[3] || 0;
      return { browser: key, version: `${major}.${minor}.${patch}` };
    }
  }
  return null;
}
const normalizeArch = (arch) => {
  if (arch === "x32")
    return "x32";
  if (arch === "x86_64" || arch === "x64")
    return "x64";
  if (arch === "arm")
    return "arm";
  if (arch === "aarch64" || arch === "arm64")
    return "arm64";
  if (arch)
    return `other:${arch}`;
  return "unknown";
};
const normalizePlatform = (platform) => {
  platform = platform.toLowerCase();
  if (platform.includes("ios"))
    return "iOS";
  if (platform === "android")
    return "Android";
  if (platform === "darwin")
    return "MacOS";
  if (platform === "win32")
    return "Windows";
  if (platform === "freebsd")
    return "FreeBSD";
  if (platform === "openbsd")
    return "OpenBSD";
  if (platform === "linux")
    return "Linux";
  if (platform)
    return `Other:${platform}`;
  return "Unknown";
};
let _platformHeaders;
const getPlatformHeaders = () => {
  return _platformHeaders ?? (_platformHeaders = getPlatformProperties());
};
function getDefaultFetch() {
  if (typeof fetch !== "undefined") {
    return fetch;
  }
  throw new Error("`fetch` is not defined as a global; Either pass `fetch` to the client, `new DodoPayments({ fetch })` or polyfill the global, `globalThis.fetch = fetch`");
}
function makeReadableStream(...args) {
  const ReadableStream = globalThis.ReadableStream;
  if (typeof ReadableStream === "undefined") {
    throw new Error("`ReadableStream` is not defined as a global; You will need to polyfill it, `globalThis.ReadableStream = ReadableStream`");
  }
  return new ReadableStream(...args);
}
function ReadableStreamFrom(iterable) {
  let iter = Symbol.asyncIterator in iterable ? iterable[Symbol.asyncIterator]() : iterable[Symbol.iterator]();
  return makeReadableStream({
    start() {
    },
    async pull(controller) {
      const { done, value } = await iter.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    async cancel() {
      await iter.return?.();
    }
  });
}
async function CancelReadableStream(stream) {
  if (stream === null || typeof stream !== "object")
    return;
  if (stream[Symbol.asyncIterator]) {
    await stream[Symbol.asyncIterator]().return?.();
    return;
  }
  const reader = stream.getReader();
  const cancelPromise = reader.cancel();
  reader.releaseLock();
  await cancelPromise;
}
const FallbackEncoder = ({ headers, body }) => {
  return {
    bodyHeaders: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  };
};
function stringifyQuery(query) {
  return Object.entries(query).filter(([_, value]) => typeof value !== "undefined").map(([key, value]) => {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    }
    if (value === null) {
      return `${encodeURIComponent(key)}=`;
    }
    throw new DodoPaymentsError(`Cannot stringify type ${typeof value}; Expected string, number, boolean, or null. If you need to pass nested query parameters, you can manually encode them, e.g. { query: { 'foo[key1]': value1, 'foo[key2]': value2 } }, and please open a GitHub issue requesting better support for your use case.`);
  }).join("&");
}
const levelNumbers = {
  off: 0,
  error: 200,
  warn: 300,
  info: 400,
  debug: 500
};
const parseLogLevel = (maybeLevel, sourceName, client) => {
  if (!maybeLevel) {
    return void 0;
  }
  if (hasOwn(levelNumbers, maybeLevel)) {
    return maybeLevel;
  }
  loggerFor(client).warn(`${sourceName} was set to ${JSON.stringify(maybeLevel)}, expected one of ${JSON.stringify(Object.keys(levelNumbers))}`);
  return void 0;
};
function noop() {
}
function makeLogFn(fnLevel, logger, logLevel) {
  if (!logger || levelNumbers[fnLevel] > levelNumbers[logLevel]) {
    return noop;
  } else {
    return logger[fnLevel].bind(logger);
  }
}
const noopLogger = {
  error: noop,
  warn: noop,
  info: noop,
  debug: noop
};
let cachedLoggers = /* @__PURE__ */ new WeakMap();
function loggerFor(client) {
  const logger = client.logger;
  const logLevel = client.logLevel ?? "off";
  if (!logger) {
    return noopLogger;
  }
  const cachedLogger = cachedLoggers.get(logger);
  if (cachedLogger && cachedLogger[0] === logLevel) {
    return cachedLogger[1];
  }
  const levelLogger = {
    error: makeLogFn("error", logger, logLevel),
    warn: makeLogFn("warn", logger, logLevel),
    info: makeLogFn("info", logger, logLevel),
    debug: makeLogFn("debug", logger, logLevel)
  };
  cachedLoggers.set(logger, [logLevel, levelLogger]);
  return levelLogger;
}
const formatRequestDetails = (details) => {
  if (details.options) {
    details.options = { ...details.options };
    delete details.options["headers"];
  }
  if (details.headers) {
    details.headers = Object.fromEntries((details.headers instanceof Headers ? [...details.headers] : Object.entries(details.headers)).map(([name, value]) => [
      name,
      name.toLowerCase() === "authorization" || name.toLowerCase() === "api-key" || name.toLowerCase() === "x-api-key" || name.toLowerCase() === "cookie" || name.toLowerCase() === "set-cookie" ? "***" : value
    ]));
  }
  if ("retryOfRequestLogID" in details) {
    if (details.retryOfRequestLogID) {
      details.retryOf = details.retryOfRequestLogID;
    }
    delete details.retryOfRequestLogID;
  }
  return details;
};
async function defaultParseResponse(client, props) {
  const { response, requestLogID, retryOfRequestLogID, startTime } = props;
  const body = await (async () => {
    if (response.status === 204) {
      return null;
    }
    if (props.options.__binaryResponse) {
      return response;
    }
    const contentType = response.headers.get("content-type");
    const mediaType = contentType?.split(";")[0]?.trim();
    const isJSON = mediaType?.includes("application/json") || mediaType?.endsWith("+json");
    if (isJSON) {
      const contentLength = response.headers.get("content-length");
      if (contentLength === "0") {
        return void 0;
      }
      const json = await response.json();
      return json;
    }
    const text = await response.text();
    return text;
  })();
  loggerFor(client).debug(`[${requestLogID}] response parsed`, formatRequestDetails({
    retryOfRequestLogID,
    url: response.url,
    status: response.status,
    body,
    durationMs: Date.now() - startTime
  }));
  return body;
}
var _APIPromise_client;
class APIPromise extends Promise {
  constructor(client, responsePromise, parseResponse = defaultParseResponse) {
    super((resolve) => {
      resolve(null);
    });
    this.responsePromise = responsePromise;
    this.parseResponse = parseResponse;
    _APIPromise_client.set(this, void 0);
    __classPrivateFieldSet(this, _APIPromise_client, client);
  }
  _thenUnwrap(transform) {
    return new APIPromise(__classPrivateFieldGet(this, _APIPromise_client, "f"), this.responsePromise, async (client, props) => transform(await this.parseResponse(client, props), props));
  }
  /**
   * Gets the raw `Response` instance instead of parsing the response
   * data.
   *
   * If you want to parse the response body but still get the `Response`
   * instance, you can use {@link withResponse()}.
   *
   * 👋 Getting the wrong TypeScript type for `Response`?
   * Try setting `"moduleResolution": "NodeNext"` or add `"lib": ["DOM"]`
   * to your `tsconfig.json`.
   */
  asResponse() {
    return this.responsePromise.then((p) => p.response);
  }
  /**
   * Gets the parsed response data and the raw `Response` instance.
   *
   * If you just want to get the raw `Response` instance without parsing it,
   * you can use {@link asResponse()}.
   *
   * 👋 Getting the wrong TypeScript type for `Response`?
   * Try setting `"moduleResolution": "NodeNext"` or add `"lib": ["DOM"]`
   * to your `tsconfig.json`.
   */
  async withResponse() {
    const [data, response] = await Promise.all([this.parse(), this.asResponse()]);
    return { data, response };
  }
  parse() {
    if (!this.parsedPromise) {
      this.parsedPromise = this.responsePromise.then((data) => this.parseResponse(__classPrivateFieldGet(this, _APIPromise_client, "f"), data));
    }
    return this.parsedPromise;
  }
  then(onfulfilled, onrejected) {
    return this.parse().then(onfulfilled, onrejected);
  }
  catch(onrejected) {
    return this.parse().catch(onrejected);
  }
  finally(onfinally) {
    return this.parse().finally(onfinally);
  }
}
_APIPromise_client = /* @__PURE__ */ new WeakMap();
var _AbstractPage_client;
class AbstractPage {
  constructor(client, response, body, options) {
    _AbstractPage_client.set(this, void 0);
    __classPrivateFieldSet(this, _AbstractPage_client, client);
    this.options = options;
    this.response = response;
    this.body = body;
  }
  hasNextPage() {
    const items = this.getPaginatedItems();
    if (!items.length)
      return false;
    return this.nextPageRequestOptions() != null;
  }
  async getNextPage() {
    const nextOptions = this.nextPageRequestOptions();
    if (!nextOptions) {
      throw new DodoPaymentsError("No next page expected; please check `.hasNextPage()` before calling `.getNextPage()`.");
    }
    return await __classPrivateFieldGet(this, _AbstractPage_client, "f").requestAPIList(this.constructor, nextOptions);
  }
  async *iterPages() {
    let page2 = this;
    yield page2;
    while (page2.hasNextPage()) {
      page2 = await page2.getNextPage();
      yield page2;
    }
  }
  async *[(_AbstractPage_client = /* @__PURE__ */ new WeakMap(), Symbol.asyncIterator)]() {
    for await (const page2 of this.iterPages()) {
      for (const item of page2.getPaginatedItems()) {
        yield item;
      }
    }
  }
}
class PagePromise extends APIPromise {
  constructor(client, request, Page) {
    super(client, request, async (client2, props) => new Page(client2, props.response, await defaultParseResponse(client2, props), props.options));
  }
  /**
   * Allow auto-paginating iteration on an unawaited list call, eg:
   *
   *    for await (const item of client.items.list()) {
   *      console.log(item)
   *    }
   */
  async *[Symbol.asyncIterator]() {
    const page2 = await this;
    for await (const item of page2) {
      yield item;
    }
  }
}
class DefaultPageNumberPagination extends AbstractPage {
  constructor(client, response, body, options) {
    super(client, response, body, options);
    this.items = body.items || [];
  }
  getPaginatedItems() {
    return this.items ?? [];
  }
  nextPageRequestOptions() {
    const query = this.options.query;
    const currentPage = query?.page_number ?? 1;
    return {
      ...this.options,
      query: {
        ...maybeObj(this.options.query),
        page_number: currentPage + 1
      }
    };
  }
}
class CursorPagePagination extends AbstractPage {
  constructor(client, response, body, options) {
    super(client, response, body, options);
    this.data = body.data || [];
    this.iterator = body.iterator || "";
    this.done = body.done || false;
  }
  getPaginatedItems() {
    return this.data ?? [];
  }
  nextPageRequestOptions() {
    const cursor = this.iterator;
    if (!cursor) {
      return null;
    }
    return {
      ...this.options,
      query: {
        ...maybeObj(this.options.query),
        iterator: cursor
      }
    };
  }
}
const checkFileSupport = () => {
  if (typeof File === "undefined") {
    const { process } = globalThis;
    const isOldNode = typeof process?.versions?.node === "string" && parseInt(process.versions.node.split(".")) < 20;
    throw new Error("`File` is not defined as a global, which is required for file uploads." + (isOldNode ? " Update to Node 20 LTS or newer, or set `globalThis.File` to `import('node:buffer').File`." : ""));
  }
};
function makeFile(fileBits, fileName, options) {
  checkFileSupport();
  return new File(fileBits, fileName ?? "unknown_file", options);
}
function getName(value) {
  return (typeof value === "object" && value !== null && ("name" in value && value.name && String(value.name) || "url" in value && value.url && String(value.url) || "filename" in value && value.filename && String(value.filename) || "path" in value && value.path && String(value.path)) || "").split(/[\\/]/).pop() || void 0;
}
const isAsyncIterable = (value) => value != null && typeof value === "object" && typeof value[Symbol.asyncIterator] === "function";
const isBlobLike = (value) => value != null && typeof value === "object" && typeof value.size === "number" && typeof value.type === "string" && typeof value.text === "function" && typeof value.slice === "function" && typeof value.arrayBuffer === "function";
const isFileLike = (value) => value != null && typeof value === "object" && typeof value.name === "string" && typeof value.lastModified === "number" && isBlobLike(value);
const isResponseLike = (value) => value != null && typeof value === "object" && typeof value.url === "string" && typeof value.blob === "function";
async function toFile(value, name, options) {
  checkFileSupport();
  value = await value;
  if (isFileLike(value)) {
    if (value instanceof File) {
      return value;
    }
    return makeFile([await value.arrayBuffer()], value.name);
  }
  if (isResponseLike(value)) {
    const blob = await value.blob();
    name || (name = new URL(value.url).pathname.split(/[\\/]/).pop());
    return makeFile(await getBytes(blob), name, options);
  }
  const parts = await getBytes(value);
  name || (name = getName(value));
  if (!options?.type) {
    const type = parts.find((part) => typeof part === "object" && "type" in part && part.type);
    if (typeof type === "string") {
      options = { ...options, type };
    }
  }
  return makeFile(parts, name, options);
}
async function getBytes(value) {
  let parts = [];
  if (typeof value === "string" || ArrayBuffer.isView(value) || // includes Uint8Array, Buffer, etc.
  value instanceof ArrayBuffer) {
    parts.push(value);
  } else if (isBlobLike(value)) {
    parts.push(value instanceof Blob ? value : await value.arrayBuffer());
  } else if (isAsyncIterable(value)) {
    for await (const chunk of value) {
      parts.push(...await getBytes(chunk));
    }
  } else {
    const constructor = value?.constructor?.name;
    throw new Error(`Unexpected data type: ${typeof value}${constructor ? `; constructor: ${constructor}` : ""}${propsForError(value)}`);
  }
  return parts;
}
function propsForError(value) {
  if (typeof value !== "object" || value === null)
    return "";
  const props = Object.getOwnPropertyNames(value);
  return `; props: [${props.map((p) => `"${p}"`).join(", ")}]`;
}
class APIResource {
  constructor(client) {
    this._client = client;
  }
}
function encodeURIPath(str) {
  return str.replace(/[^A-Za-z0-9\-._~!$&'()*+,;=:@]+/g, encodeURIComponent);
}
const EMPTY = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.create(null));
const createPathTagFunction = (pathEncoder = encodeURIPath) => function path2(statics, ...params) {
  if (statics.length === 1)
    return statics[0];
  let postPath = false;
  const invalidSegments = [];
  const path3 = statics.reduce((previousValue, currentValue, index) => {
    if (/[?#]/.test(currentValue)) {
      postPath = true;
    }
    const value = params[index];
    let encoded = (postPath ? encodeURIComponent : pathEncoder)("" + value);
    if (index !== params.length && (value == null || typeof value === "object" && // handle values from other realms
    value.toString === Object.getPrototypeOf(Object.getPrototypeOf(value.hasOwnProperty ?? EMPTY) ?? EMPTY)?.toString)) {
      encoded = value + "";
      invalidSegments.push({
        start: previousValue.length + currentValue.length,
        length: encoded.length,
        error: `Value of type ${Object.prototype.toString.call(value).slice(8, -1)} is not a valid path parameter`
      });
    }
    return previousValue + currentValue + (index === params.length ? "" : encoded);
  }, "");
  const pathOnly = path3.split(/[?#]/, 1)[0];
  const invalidSegmentPattern = /(?<=^|\/)(?:\.|%2e){1,2}(?=\/|$)/gi;
  let match;
  while ((match = invalidSegmentPattern.exec(pathOnly)) !== null) {
    invalidSegments.push({
      start: match.index,
      length: match[0].length,
      error: `Value "${match[0]}" can't be safely passed as a path parameter`
    });
  }
  invalidSegments.sort((a, b) => a.start - b.start);
  if (invalidSegments.length > 0) {
    let lastEnd = 0;
    const underline = invalidSegments.reduce((acc, segment) => {
      const spaces = " ".repeat(segment.start - lastEnd);
      const arrows = "^".repeat(segment.length);
      lastEnd = segment.start + segment.length;
      return acc + spaces + arrows;
    }, "");
    throw new DodoPaymentsError(`Path parameters result in path with invalid segments:
${invalidSegments.map((e) => e.error).join("\n")}
${path3}
${underline}`);
  }
  return path3;
};
const path = /* @__PURE__ */ createPathTagFunction(encodeURIPath);
class Addons extends APIResource {
  /**
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const addonResponse of client.addons.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/addons", DefaultPageNumberPagination, {
      query,
      ...options
    });
  }
  /**
   * @example
   * ```ts
   * const addonResponse = await client.addons.create({
   *   currency: 'AED',
   *   name: 'name',
   *   price: 0,
   *   tax_category: 'digital_products',
   * });
   * ```
   */
  create(body, options) {
    return this._client.post("/addons", { body, ...options });
  }
  /**
   * @example
   * ```ts
   * const addonResponse = await client.addons.retrieve(
   *   'adn_NX1zdqW4Hbivsqz8vI9dc',
   * );
   * ```
   */
  retrieve(id, options) {
    return this._client.get(path`/addons/${id}`, options);
  }
  /**
   * @example
   * ```ts
   * const addonResponse = await client.addons.update(
   *   'adn_NX1zdqW4Hbivsqz8vI9dc',
   * );
   * ```
   */
  update(id, body, options) {
    return this._client.patch(path`/addons/${id}`, { body, ...options });
  }
  /**
   * @example
   * ```ts
   * const response = await client.addons.updateImages(
   *   'adn_NX1zdqW4Hbivsqz8vI9dc',
   * );
   * ```
   */
  updateImages(id, options) {
    return this._client.put(path`/addons/${id}/images`, options);
  }
}
let Balances$1 = class Balances extends APIResource {
  retrieveLedger(query = {}, options) {
    return this._client.getAPIList("/balances/ledger", DefaultPageNumberPagination, {
      query,
      ...options
    });
  }
};
class Brands extends APIResource {
  /**
   * @example
   * ```ts
   * const brands = await client.brands.list();
   * ```
   */
  list(options) {
    return this._client.get("/brands", options);
  }
  /**
   * @example
   * ```ts
   * const brand = await client.brands.create();
   * ```
   */
  create(body, options) {
    return this._client.post("/brands", { body, ...options });
  }
  /**
   * Thin handler just calls `get_brand` and wraps in `Json(...)`
   *
   * @example
   * ```ts
   * const brand = await client.brands.retrieve(
   *   'brnd_8dFiAW42v28JzhlVSocjq',
   * );
   * ```
   */
  retrieve(id, options) {
    return this._client.get(path`/brands/${id}`, options);
  }
  /**
   * @example
   * ```ts
   * const brand = await client.brands.update(
   *   'brnd_8dFiAW42v28JzhlVSocjq',
   * );
   * ```
   */
  update(id, body, options) {
    return this._client.patch(path`/brands/${id}`, { body, ...options });
  }
  /**
   * @example
   * ```ts
   * const response = await client.brands.updateImages(
   *   'brnd_8dFiAW42v28JzhlVSocjq',
   * );
   * ```
   */
  updateImages(id, options) {
    return this._client.put(path`/brands/${id}/images`, options);
  }
}
class CheckoutSessions extends APIResource {
  /**
   * @example
   * ```ts
   * const checkoutSessionResponse =
   *   await client.checkoutSessions.create({
   *     product_cart: [
   *       { product_id: 'product_id', quantity: 0 },
   *     ],
   *   });
   * ```
   */
  create(body, options) {
    return this._client.post("/checkouts", { body, ...options });
  }
  /**
   * @example
   * ```ts
   * const checkoutSessionStatus =
   *   await client.checkoutSessions.retrieve(
   *     'cks_n010SZaY4NXc7F1ck3Tq1',
   *   );
   * ```
   */
  retrieve(id, options) {
    return this._client.get(path`/checkouts/${id}`, options);
  }
  /**
   * @example
   * ```ts
   * const response = await client.checkoutSessions.preview({
   *   product_cart: [{ product_id: 'product_id', quantity: 0 }],
   * });
   * ```
   */
  preview(body, options) {
    return this._client.post("/checkouts/preview", { body, ...options });
  }
}
class Balances2 extends APIResource {
  /**
   * Returns a paginated list of customer credit balances for the given credit
   * entitlement.
   *
   * # Authentication
   *
   * Requires an API key with `Viewer` role or higher.
   *
   * # Path Parameters
   *
   * - `credit_entitlement_id` - The unique identifier of the credit entitlement
   *
   * # Query Parameters
   *
   * - `page_size` - Number of items per page (default: 10, max: 100)
   * - `page_number` - Zero-based page number (default: 0)
   * - `customer_id` - Optional filter by specific customer
   *
   * # Responses
   *
   * - `200 OK` - Returns list of customer balances
   * - `404 Not Found` - Credit entitlement not found
   * - `500 Internal Server Error` - Database or server error
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const customerCreditBalance of client.creditEntitlements.balances.list(
   *   'cde_ztxm5XJsKxWucRWA3rjdM',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(creditEntitlementID, query = {}, options) {
    return this._client.getAPIList(path`/credit-entitlements/${creditEntitlementID}/balances`, DefaultPageNumberPagination, { query, ...options });
  }
  /**
   * Returns the credit balance details for a specific customer and credit
   * entitlement.
   *
   * # Authentication
   *
   * Requires an API key with `Viewer` role or higher.
   *
   * # Path Parameters
   *
   * - `credit_entitlement_id` - The unique identifier of the credit entitlement
   * - `customer_id` - The unique identifier of the customer
   *
   * # Responses
   *
   * - `200 OK` - Returns the customer's balance
   * - `404 Not Found` - Credit entitlement or customer balance not found
   * - `500 Internal Server Error` - Database or server error
   *
   * @example
   * ```ts
   * const customerCreditBalance =
   *   await client.creditEntitlements.balances.retrieve(
   *     'cus_TV52uJWWXt2yIoBBxpjaa',
   *     { credit_entitlement_id: 'cde_ztxm5XJsKxWucRWA3rjdM' },
   *   );
   * ```
   */
  retrieve(customerID, params, options) {
    const { credit_entitlement_id } = params;
    return this._client.get(path`/credit-entitlements/${credit_entitlement_id}/balances/${customerID}`, options);
  }
  /**
   * Returns a paginated list of credit grants with optional filtering by status.
   *
   * # Authentication
   *
   * Requires an API key with `Viewer` role or higher.
   *
   * # Path Parameters
   *
   * - `credit_entitlement_id` - The unique identifier of the credit entitlement
   * - `customer_id` - The unique identifier of the customer
   *
   * # Query Parameters
   *
   * - `page_size` - Number of items per page (default: 10, max: 100)
   * - `page_number` - Zero-based page number (default: 0)
   * - `status` - Filter by status: active, expired, depleted
   *
   * # Responses
   *
   * - `200 OK` - Returns list of grants
   * - `404 Not Found` - Credit entitlement not found
   * - `500 Internal Server Error` - Database or server error
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const balanceListGrantsResponse of client.creditEntitlements.balances.listGrants(
   *   'cus_TV52uJWWXt2yIoBBxpjaa',
   *   { credit_entitlement_id: 'cde_ztxm5XJsKxWucRWA3rjdM' },
   * )) {
   *   // ...
   * }
   * ```
   */
  listGrants(customerID, params, options) {
    const { credit_entitlement_id, ...query } = params;
    return this._client.getAPIList(path`/credit-entitlements/${credit_entitlement_id}/balances/${customerID}/grants`, DefaultPageNumberPagination, { query, ...options });
  }
  /**
   * Returns a paginated list of credit transaction history with optional filtering.
   *
   * # Authentication
   *
   * Requires an API key with `Viewer` role or higher.
   *
   * # Path Parameters
   *
   * - `credit_entitlement_id` - The unique identifier of the credit entitlement
   * - `customer_id` - The unique identifier of the customer
   *
   * # Query Parameters
   *
   * - `page_size` - Number of items per page (default: 10, max: 100)
   * - `page_number` - Zero-based page number (default: 0)
   * - `transaction_type` - Filter by transaction type
   * - `start_date` - Filter entries from this date
   * - `end_date` - Filter entries until this date
   *
   * # Responses
   *
   * - `200 OK` - Returns list of ledger entries
   * - `404 Not Found` - Credit entitlement not found
   * - `500 Internal Server Error` - Database or server error
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const creditLedgerEntry of client.creditEntitlements.balances.listLedger(
   *   'cus_TV52uJWWXt2yIoBBxpjaa',
   *   { credit_entitlement_id: 'cde_ztxm5XJsKxWucRWA3rjdM' },
   * )) {
   *   // ...
   * }
   * ```
   */
  listLedger(customerID, params, options) {
    const { credit_entitlement_id, ...query } = params;
    return this._client.getAPIList(path`/credit-entitlements/${credit_entitlement_id}/balances/${customerID}/ledger`, DefaultPageNumberPagination, { query, ...options });
  }
  /**
   * For credit entries, a new grant is created. For debit entries, credits are
   * deducted from existing grants using FIFO (oldest first).
   *
   * # Authentication
   *
   * Requires an API key with `Editor` role.
   *
   * # Path Parameters
   *
   * - `credit_entitlement_id` - The unique identifier of the credit entitlement
   * - `customer_id` - The unique identifier of the customer
   *
   * # Request Body
   *
   * - `entry_type` - "credit" or "debit"
   * - `amount` - Amount to credit or debit
   * - `reason` - Optional human-readable reason
   * - `expires_at` - Optional expiration for credited amount (only for credit type)
   * - `idempotency_key` - Optional key to prevent duplicate entries
   *
   * # Responses
   *
   * - `201 Created` - Ledger entry created successfully
   * - `400 Bad Request` - Invalid request (e.g., debit with insufficient balance)
   * - `404 Not Found` - Credit entitlement or customer not found
   * - `409 Conflict` - Idempotency key already exists
   * - `500 Internal Server Error` - Database or server error
   *
   * @example
   * ```ts
   * const response =
   *   await client.creditEntitlements.balances.createLedgerEntry(
   *     'cus_TV52uJWWXt2yIoBBxpjaa',
   *     {
   *       credit_entitlement_id: 'cde_ztxm5XJsKxWucRWA3rjdM',
   *       amount: 'amount',
   *       entry_type: 'credit',
   *     },
   *   );
   * ```
   */
  createLedgerEntry(customerID, params, options) {
    const { credit_entitlement_id, ...body } = params;
    return this._client.post(path`/credit-entitlements/${credit_entitlement_id}/balances/${customerID}/ledger-entries`, { body, ...options });
  }
}
const brand_privateNullableHeaders = /* @__PURE__ */ Symbol("brand.privateNullableHeaders");
function* iterateHeaders(headers) {
  if (!headers)
    return;
  if (brand_privateNullableHeaders in headers) {
    const { values, nulls } = headers;
    yield* values.entries();
    for (const name of nulls) {
      yield [name, null];
    }
    return;
  }
  let shouldClear = false;
  let iter;
  if (headers instanceof Headers) {
    iter = headers.entries();
  } else if (isReadonlyArray(headers)) {
    iter = headers;
  } else {
    shouldClear = true;
    iter = Object.entries(headers ?? {});
  }
  for (let row of iter) {
    const name = row[0];
    if (typeof name !== "string")
      throw new TypeError("expected header name to be a string");
    const values = isReadonlyArray(row[1]) ? row[1] : [row[1]];
    let didClear = false;
    for (const value of values) {
      if (value === void 0)
        continue;
      if (shouldClear && !didClear) {
        didClear = true;
        yield [name, null];
      }
      yield [name, value];
    }
  }
}
const buildHeaders = (newHeaders) => {
  const targetHeaders = new Headers();
  const nullHeaders = /* @__PURE__ */ new Set();
  for (const headers of newHeaders) {
    const seenHeaders = /* @__PURE__ */ new Set();
    for (const [name, value] of iterateHeaders(headers)) {
      const lowerName = name.toLowerCase();
      if (!seenHeaders.has(lowerName)) {
        targetHeaders.delete(name);
        seenHeaders.add(lowerName);
      }
      if (value === null) {
        targetHeaders.delete(name);
        nullHeaders.add(lowerName);
      } else {
        targetHeaders.append(name, value);
        nullHeaders.delete(lowerName);
      }
    }
  }
  return { [brand_privateNullableHeaders]: true, values: targetHeaders, nulls: nullHeaders };
};
class CreditEntitlements extends APIResource {
  constructor() {
    super(...arguments);
    this.balances = new Balances2(this._client);
  }
  /**
   * Returns a paginated list of credit entitlements, allowing filtering of deleted
   * entitlements. By default, only non-deleted entitlements are returned.
   *
   * # Authentication
   *
   * Requires an API key with `Viewer` role or higher.
   *
   * # Query Parameters
   *
   * - `page_size` - Number of items per page (default: 10, max: 100)
   * - `page_number` - Zero-based page number (default: 0)
   * - `deleted` - Boolean flag to list deleted entitlements instead of active ones
   *   (default: false)
   *
   * # Responses
   *
   * - `200 OK` - Returns a list of credit entitlements wrapped in a response object
   * - `422 Unprocessable Entity` - Invalid query parameters (e.g., page_size > 100)
   * - `500 Internal Server Error` - Database or server error
   *
   * # Business Logic
   *
   * - Results are ordered by creation date in descending order (newest first)
   * - Only entitlements belonging to the authenticated business are returned
   * - The `deleted` parameter controls visibility of soft-deleted entitlements
   * - Pagination uses offset-based pagination (offset = page_number \* page_size)
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const creditEntitlement of client.creditEntitlements.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/credit-entitlements", DefaultPageNumberPagination, {
      query,
      ...options
    });
  }
  /**
   * Credit entitlements define reusable credit templates that can be attached to
   * products. Each entitlement defines how credits behave in terms of expiration,
   * rollover, and overage.
   *
   * # Authentication
   *
   * Requires an API key with `Editor` role.
   *
   * # Request Body
   *
   * - `name` - Human-readable name of the credit entitlement (1-255 characters,
   *   required)
   * - `description` - Optional description (max 1000 characters)
   * - `precision` - Decimal precision for credit amounts (0-10 decimal places)
   * - `unit` - Unit of measurement for the credit (e.g., "API Calls", "Tokens",
   *   "Credits")
   * - `expires_after_days` - Number of days after which credits expire (optional)
   * - `rollover_enabled` - Whether unused credits can rollover to the next period
   * - `rollover_percentage` - Percentage of unused credits that rollover (0-100)
   * - `rollover_timeframe_count` - Count of timeframe periods for rollover limit
   * - `rollover_timeframe_interval` - Interval type (day, week, month, year)
   * - `max_rollover_count` - Maximum number of times credits can be rolled over
   * - `overage_enabled` - Whether overage charges apply when credits run out
   *   (requires price_per_unit)
   * - `overage_limit` - Maximum overage units allowed (optional)
   * - `currency` - Currency for pricing (required if price_per_unit is set)
   * - `price_per_unit` - Price per credit unit (decimal)
   *
   * # Responses
   *
   * - `201 Created` - Credit entitlement created successfully, returns the full
   *   entitlement object
   * - `422 Unprocessable Entity` - Invalid request parameters or validation failure
   * - `500 Internal Server Error` - Database or server error
   *
   * # Business Logic
   *
   * - A unique ID with prefix `cde_` is automatically generated for the entitlement
   * - Created and updated timestamps are automatically set
   * - Currency is required when price_per_unit is set
   * - price_per_unit is required when overage_enabled is true
   * - rollover_timeframe_count and rollover_timeframe_interval must both be set or
   *   both be null
   *
   * @example
   * ```ts
   * const creditEntitlement =
   *   await client.creditEntitlements.create({
   *     name: 'name',
   *     overage_enabled: true,
   *     precision: 0,
   *     rollover_enabled: true,
   *     unit: 'unit',
   *   });
   * ```
   */
  create(body, options) {
    return this._client.post("/credit-entitlements", { body, ...options });
  }
  /**
   * Returns the full details of a single credit entitlement including all
   * configuration settings for expiration, rollover, and overage policies.
   *
   * # Authentication
   *
   * Requires an API key with `Viewer` role or higher.
   *
   * # Path Parameters
   *
   * - `id` - The unique identifier of the credit entitlement (format: `cde_...`)
   *
   * # Responses
   *
   * - `200 OK` - Returns the full credit entitlement object
   * - `404 Not Found` - Credit entitlement does not exist or does not belong to the
   *   authenticated business
   * - `500 Internal Server Error` - Database or server error
   *
   * # Business Logic
   *
   * - Only non-deleted credit entitlements can be retrieved through this endpoint
   * - The entitlement must belong to the authenticated business (business_id check)
   * - Deleted entitlements return a 404 error and must be retrieved via the list
   *   endpoint with `deleted=true`
   *
   * @example
   * ```ts
   * const creditEntitlement =
   *   await client.creditEntitlements.retrieve(
   *     'cde_ztxm5XJsKxWucRWA3rjdM',
   *   );
   * ```
   */
  retrieve(id, options) {
    return this._client.get(path`/credit-entitlements/${id}`, options);
  }
  /**
   * @example
   * ```ts
   * await client.creditEntitlements.delete(
   *   'cde_ztxm5XJsKxWucRWA3rjdM',
   * );
   * ```
   */
  delete(id, options) {
    return this._client.delete(path`/credit-entitlements/${id}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * Allows partial updates to a credit entitlement's configuration. Only the fields
   * provided in the request body will be updated; all other fields remain unchanged.
   * This endpoint supports nullable fields using the double option pattern.
   *
   * # Authentication
   *
   * Requires an API key with `Editor` role.
   *
   * # Path Parameters
   *
   * - `id` - The unique identifier of the credit entitlement to update (format:
   *   `cde_...`)
   *
   * # Request Body (all fields optional)
   *
   * - `name` - Human-readable name of the credit entitlement (1-255 characters)
   * - `description` - Optional description (max 1000 characters)
   * - `unit` - Unit of measurement for the credit (1-50 characters)
   *
   * Note: `precision` cannot be modified after creation as it would invalidate
   * existing grants.
   *
   * - `expires_after_days` - Number of days after which credits expire (use `null`
   *   to remove expiration)
   * - `rollover_enabled` - Whether unused credits can rollover to the next period
   * - `rollover_percentage` - Percentage of unused credits that rollover (0-100,
   *   nullable)
   * - `rollover_timeframe_count` - Count of timeframe periods for rollover limit
   *   (nullable)
   * - `rollover_timeframe_interval` - Interval type (day, week, month, year,
   *   nullable)
   * - `max_rollover_count` - Maximum number of times credits can be rolled over
   *   (nullable)
   * - `overage_enabled` - Whether overage charges apply when credits run out
   * - `overage_limit` - Maximum overage units allowed (nullable)
   * - `currency` - Currency for pricing (nullable)
   * - `price_per_unit` - Price per credit unit (decimal, nullable)
   *
   * # Responses
   *
   * - `200 OK` - Credit entitlement updated successfully
   * - `404 Not Found` - Credit entitlement does not exist or does not belong to the
   *   authenticated business
   * - `422 Unprocessable Entity` - Invalid request parameters or validation failure
   * - `500 Internal Server Error` - Database or server error
   *
   * # Business Logic
   *
   * - Only non-deleted credit entitlements can be updated
   * - Fields set to `null` explicitly will clear the database value (using double
   *   option pattern)
   * - The `updated_at` timestamp is automatically updated on successful modification
   * - Changes take effect immediately but do not retroactively affect existing
   *   credit grants
   * - The merged state is validated: currency required with price, rollover
   *   timeframe fields together, price required for overage
   *
   * @example
   * ```ts
   * await client.creditEntitlements.update(
   *   'cde_ztxm5XJsKxWucRWA3rjdM',
   * );
   * ```
   */
  update(id, body, options) {
    return this._client.patch(path`/credit-entitlements/${id}`, {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * Undeletes a soft-deleted credit entitlement by clearing `deleted_at`, making it
   * available again through standard list and get endpoints.
   *
   * # Authentication
   *
   * Requires an API key with `Editor` role.
   *
   * # Path Parameters
   *
   * - `id` - The unique identifier of the credit entitlement to restore (format:
   *   `cde_...`)
   *
   * # Responses
   *
   * - `200 OK` - Credit entitlement restored successfully
   * - `500 Internal Server Error` - Database error, entitlement not found, or
   *   entitlement is not deleted
   *
   * # Business Logic
   *
   * - Only deleted credit entitlements can be restored
   * - The query filters for `deleted_at IS NOT NULL`, so non-deleted entitlements
   *   will result in 0 rows affected
   * - If no rows are affected (entitlement doesn't exist, doesn't belong to
   *   business, or is not deleted), returns 500
   * - The `updated_at` timestamp is automatically updated on successful restoration
   * - Once restored, the entitlement becomes immediately available in the standard
   *   list and get endpoints
   * - All configuration settings are preserved during delete/restore operations
   *
   * # Error Handling
   *
   * This endpoint returns 500 Internal Server Error in several cases:
   *
   * - The credit entitlement does not exist
   * - The credit entitlement belongs to a different business
   * - The credit entitlement is not currently deleted (already active)
   *
   * Callers should verify the entitlement exists and is deleted before calling this
   * endpoint.
   *
   * @example
   * ```ts
   * await client.creditEntitlements.undelete(
   *   'cde_ztxm5XJsKxWucRWA3rjdM',
   * );
   * ```
   */
  undelete(id, options) {
    return this._client.post(path`/credit-entitlements/${id}/undelete`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
}
CreditEntitlements.Balances = Balances2;
class CustomerPortal extends APIResource {
  /**
   * @example
   * ```ts
   * const customerPortalSession =
   *   await client.customers.customerPortal.create(
   *     'cus_TV52uJWWXt2yIoBBxpjaa',
   *   );
   * ```
   */
  create(customerID, params = {}, options) {
    const { return_url, send_email } = params ?? {};
    return this._client.post(path`/customers/${customerID}/customer-portal/session`, {
      query: { return_url, send_email },
      ...options
    });
  }
}
class LedgerEntries extends APIResource {
  /**
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const customerWalletTransaction of client.customers.wallets.ledgerEntries.list(
   *   'cus_TV52uJWWXt2yIoBBxpjaa',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(customerID, query = {}, options) {
    return this._client.getAPIList(path`/customers/${customerID}/wallets/ledger-entries`, DefaultPageNumberPagination, { query, ...options });
  }
  /**
   * @example
   * ```ts
   * const customerWallet =
   *   await client.customers.wallets.ledgerEntries.create(
   *     'cus_TV52uJWWXt2yIoBBxpjaa',
   *     {
   *       amount: 0,
   *       currency: 'AED',
   *       entry_type: 'credit',
   *     },
   *   );
   * ```
   */
  create(customerID, body, options) {
    return this._client.post(path`/customers/${customerID}/wallets/ledger-entries`, { body, ...options });
  }
}
class Wallets extends APIResource {
  constructor() {
    super(...arguments);
    this.ledgerEntries = new LedgerEntries(this._client);
  }
  /**
   * @example
   * ```ts
   * const wallets = await client.customers.wallets.list(
   *   'cus_TV52uJWWXt2yIoBBxpjaa',
   * );
   * ```
   */
  list(customerID, options) {
    return this._client.get(path`/customers/${customerID}/wallets`, options);
  }
}
Wallets.LedgerEntries = LedgerEntries;
class Customers extends APIResource {
  constructor() {
    super(...arguments);
    this.customerPortal = new CustomerPortal(this._client);
    this.wallets = new Wallets(this._client);
  }
  /**
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const customer of client.customers.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/customers", DefaultPageNumberPagination, {
      query,
      ...options
    });
  }
  /**
   * @example
   * ```ts
   * const customer = await client.customers.retrieve(
   *   'cus_TV52uJWWXt2yIoBBxpjaa',
   * );
   * ```
   */
  retrieve(customerID, options) {
    return this._client.get(path`/customers/${customerID}`, options);
  }
  /**
   * @example
   * ```ts
   * const customer = await client.customers.create({
   *   email: 'email',
   *   name: 'name',
   * });
   * ```
   */
  create(body, options) {
    return this._client.post("/customers", { body, ...options });
  }
  /**
   * @example
   * ```ts
   * const customer = await client.customers.update(
   *   'cus_TV52uJWWXt2yIoBBxpjaa',
   * );
   * ```
   */
  update(customerID, body, options) {
    return this._client.patch(path`/customers/${customerID}`, { body, ...options });
  }
  /**
   * @example
   * ```ts
   * const response =
   *   await client.customers.retrievePaymentMethods(
   *     'cus_TV52uJWWXt2yIoBBxpjaa',
   *   );
   * ```
   */
  retrievePaymentMethods(customerID, options) {
    return this._client.get(path`/customers/${customerID}/payment-methods`, options);
  }
  /**
   * List all credit entitlements for a customer with their current balances
   *
   * @example
   * ```ts
   * const response =
   *   await client.customers.listCreditEntitlements(
   *     'cus_TV52uJWWXt2yIoBBxpjaa',
   *   );
   * ```
   */
  listCreditEntitlements(customerID, options) {
    return this._client.get(path`/customers/${customerID}/credit-entitlements`, options);
  }
  /**
   * @example
   * ```ts
   * await client.customers.deletePaymentMethod(
   *   'payment_method_id',
   *   { customer_id: 'cus_TV52uJWWXt2yIoBBxpjaa' },
   * );
   * ```
   */
  deletePaymentMethod(paymentMethodID, params, options) {
    const { customer_id } = params;
    return this._client.delete(path`/customers/${customer_id}/payment-methods/${paymentMethodID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * List all entitlement grants delivered (or in flight) to a customer.
   *
   * @example
   * ```ts
   * const response = await client.customers.listEntitlements(
   *   'cus_TV52uJWWXt2yIoBBxpjaa',
   * );
   * ```
   */
  listEntitlements(customerID, options) {
    return this._client.get(path`/customers/${customerID}/entitlements`, options);
  }
  /**
   * List all of a customer's entitlement grants across every entitlement. One row
   * per grant.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const entitlementGrant of client.customers.listEntitlementGrants(
   *   'cus_TV52uJWWXt2yIoBBxpjaa',
   * )) {
   *   // ...
   * }
   * ```
   */
  listEntitlementGrants(customerID, query = {}, options) {
    return this._client.getAPIList(path`/customers/${customerID}/entitlement-grants`, DefaultPageNumberPagination, { query, ...options });
  }
}
Customers.CustomerPortal = CustomerPortal;
Customers.Wallets = Wallets;
class Discounts extends APIResource {
  /**
   * GET /discounts
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const discount of client.discounts.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/discounts", DefaultPageNumberPagination, {
      query,
      ...options
    });
  }
  /**
   * POST /discounts If `code` is omitted or empty, a random 16-char uppercase code
   * is generated.
   *
   * @example
   * ```ts
   * const discount = await client.discounts.create({
   *   amount: 0,
   *   type: 'percentage',
   * });
   * ```
   */
  create(body, options) {
    return this._client.post("/discounts", { body, ...options });
  }
  /**
   * GET /discounts/{discount_id}
   *
   * @example
   * ```ts
   * const discount = await client.discounts.retrieve(
   *   'dsc_qxxEmg5PuM1uNTE0LgkP9',
   * );
   * ```
   */
  retrieve(discountID, options) {
    return this._client.get(path`/discounts/${discountID}`, options);
  }
  /**
   * DELETE /discounts/{discount_id}
   *
   * @example
   * ```ts
   * await client.discounts.delete('dsc_qxxEmg5PuM1uNTE0LgkP9');
   * ```
   */
  delete(discountID, options) {
    return this._client.delete(path`/discounts/${discountID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * PATCH /discounts/{discount_id}
   *
   * @example
   * ```ts
   * const discount = await client.discounts.update(
   *   'dsc_qxxEmg5PuM1uNTE0LgkP9',
   * );
   * ```
   */
  update(discountID, body, options) {
    return this._client.patch(path`/discounts/${discountID}`, { body, ...options });
  }
  /**
   * Validate and fetch a discount by its code name (e.g., "SAVE20"). This allows
   * real-time validation directly against the API using the human-readable discount
   * code instead of requiring the internal discount_id.
   *
   * @example
   * ```ts
   * const discount = await client.discounts.retrieveByCode(
   *   'code',
   * );
   * ```
   */
  retrieveByCode(code, options) {
    return this._client.get(path`/discounts/code/${code}`, options);
  }
}
class Disputes extends APIResource {
  list(query = {}, options) {
    return this._client.getAPIList("/disputes", DefaultPageNumberPagination, {
      query,
      ...options
    });
  }
  retrieve(disputeID, options) {
    return this._client.get(path`/disputes/${disputeID}`, options);
  }
}
class Files extends APIResource {
  /**
   * Attach a file to a `digital_files` entitlement. Per-file size cap: 500 MiB.
   *
   * @example
   * ```ts
   * const response = await client.entitlements.files.upload(
   *   'ent_jt7jcvI79Xh8eehqgWdcm',
   * );
   * ```
   */
  upload(id, options) {
    return this._client.post(path`/entitlements/${id}/files`, options);
  }
  /**
   * Detach a previously-attached file from a `digital_files` entitlement.
   *
   * @example
   * ```ts
   * await client.entitlements.files.delete('file_id', {
   *   id: 'ent_jt7jcvI79Xh8eehqgWdcm',
   * });
   * ```
   */
  delete(fileID, params, options) {
    const { id } = params;
    return this._client.delete(path`/entitlements/${id}/files/${fileID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
}
class Grants extends APIResource {
  /**
   * GET /entitlements/{id}/grants (public API)
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const entitlementGrant of client.entitlements.grants.list(
   *   'ent_jt7jcvI79Xh8eehqgWdcm',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(id, query = {}, options) {
    return this._client.getAPIList(path`/entitlements/${id}/grants`, DefaultPageNumberPagination, { query, ...options });
  }
  /**
   * Revoke a single grant. Idempotent: re-revoking an already-revoked grant returns
   * the grant in its current state.
   *
   * @example
   * ```ts
   * const entitlementGrant =
   *   await client.entitlements.grants.revoke(
   *     'entg_w0ZCJZgNXuNDdMVzvja6p',
   *     { id: 'ent_jt7jcvI79Xh8eehqgWdcm' },
   *   );
   * ```
   */
  revoke(grantID, params, options) {
    const { id } = params;
    return this._client.delete(path`/entitlements/${id}/grants/${grantID}`, options);
  }
  /**
   * For entitlements whose license-key config uses `manual` fulfillment, grants are
   * created in the `pending` state without a key. Call this endpoint to deliver the
   * key: the grant moves to `delivered`, the customer is emailed the key, and the
   * `license_key.created` and `entitlement_grant.delivered` webhook events are sent.
   *
   * @example
   * ```ts
   * const entitlementGrant =
   *   await client.entitlements.grants.fulfillLicenseKey(
   *     'entg_w0ZCJZgNXuNDdMVzvja6p',
   *     { key: 'key' },
   *   );
   * ```
   */
  fulfillLicenseKey(grantID, body, options) {
    return this._client.post(path`/grants/${grantID}/license-key`, { body, ...options });
  }
}
class Entitlements extends APIResource {
  constructor() {
    super(...arguments);
    this.files = new Files(this._client);
    this.grants = new Grants(this._client);
  }
  /**
   * GET /entitlements
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const entitlement of client.entitlements.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/entitlements", DefaultPageNumberPagination, {
      query,
      ...options
    });
  }
  /**
   * POST /entitlements
   *
   * @example
   * ```ts
   * const entitlement = await client.entitlements.create({
   *   integration_config: {
   *     feature_id: 'feature_id',
   *     feature_type: 'boolean',
   *   },
   *   integration_type: 'discord',
   *   name: 'name',
   * });
   * ```
   */
  create(body, options) {
    return this._client.post("/entitlements", { body, ...options });
  }
  /**
   * GET /entitlements/{id}
   *
   * @example
   * ```ts
   * const entitlement = await client.entitlements.retrieve(
   *   'ent_jt7jcvI79Xh8eehqgWdcm',
   * );
   * ```
   */
  retrieve(id, options) {
    return this._client.get(path`/entitlements/${id}`, options);
  }
  /**
   * DELETE /entitlements/{id} (soft-delete)
   *
   * @example
   * ```ts
   * await client.entitlements.delete(
   *   'ent_jt7jcvI79Xh8eehqgWdcm',
   * );
   * ```
   */
  delete(id, options) {
    return this._client.delete(path`/entitlements/${id}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * PATCH /entitlements/{id}
   *
   * @example
   * ```ts
   * const entitlement = await client.entitlements.update(
   *   'ent_jt7jcvI79Xh8eehqgWdcm',
   * );
   * ```
   */
  update(id, body, options) {
    return this._client.patch(path`/entitlements/${id}`, { body, ...options });
  }
}
Entitlements.Files = Files;
Entitlements.Grants = Grants;
let Payments$1 = class Payments extends APIResource {
  /**
   * @example
   * ```ts
   * const payment = await client.invoices.payments.retrieve(
   *   'pay_gr4RizvMOXFJ6xca3y2tU',
   * );
   *
   * const content = await payment.blob();
   * console.log(content);
   * ```
   */
  retrieve(paymentID, options) {
    return this._client.get(path`/invoices/payments/${paymentID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "application/pdf" }, options?.headers]),
      __binaryResponse: true
    });
  }
  /**
   * @example
   * ```ts
   * const response =
   *   await client.invoices.payments.retrieveRefund(
   *     'ref_F0gZetLvTxxBrMU2CZcmy',
   *   );
   *
   * const content = await response.blob();
   * console.log(content);
   * ```
   */
  retrieveRefund(refundID, options) {
    return this._client.get(path`/invoices/refunds/${refundID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "application/pdf" }, options?.headers]),
      __binaryResponse: true
    });
  }
  /**
   * @example
   * ```ts
   * const response =
   *   await client.invoices.payments.retrievePayout(
   *     'pyt_zFTrrn4sk3x3y2vjDBW3T',
   *   );
   *
   * const content = await response.blob();
   * console.log(content);
   * ```
   */
  retrievePayout(payoutID, options) {
    return this._client.get(path`/invoices/payouts/${payoutID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "application/pdf" }, options?.headers]),
      __binaryResponse: true
    });
  }
};
class Invoices extends APIResource {
  constructor() {
    super(...arguments);
    this.payments = new Payments$1(this._client);
  }
}
Invoices.Payments = Payments$1;
class LicenseKeyInstances extends APIResource {
  /**
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const licenseKeyInstance of client.licenseKeyInstances.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/license_key_instances", DefaultPageNumberPagination, { query, ...options });
  }
  /**
   * @example
   * ```ts
   * const licenseKeyInstance =
   *   await client.licenseKeyInstances.retrieve(
   *     'lki_EeWORStkMc7z0KycI31VS',
   *   );
   * ```
   */
  retrieve(id, options) {
    return this._client.get(path`/license_key_instances/${id}`, options);
  }
  /**
   * @example
   * ```ts
   * const licenseKeyInstance =
   *   await client.licenseKeyInstances.update(
   *     'lki_EeWORStkMc7z0KycI31VS',
   *     { name: 'name' },
   *   );
   * ```
   */
  update(id, body, options) {
    return this._client.patch(path`/license_key_instances/${id}`, { body, ...options });
  }
}
class LicenseKeys extends APIResource {
  /**
   * @deprecated
   */
  list(query = {}, options) {
    return this._client.getAPIList("/license_keys", DefaultPageNumberPagination, {
      query,
      ...options
    });
  }
  /**
   * @deprecated
   */
  retrieve(id, options) {
    return this._client.get(path`/license_keys/${id}`, options);
  }
  /**
   * @deprecated
   */
  update(id, body, options) {
    return this._client.patch(path`/license_keys/${id}`, { body, ...options });
  }
  /**
   * @example
   * ```ts
   * const licenseKey = await client.licenseKeys.create({
   *   customer_id: 'customer_id',
   *   key: 'key',
   *   product_id: 'product_id',
   * });
   * ```
   */
  create(body, options) {
    return this._client.post("/license_keys", { body, ...options });
  }
}
class Licenses extends APIResource {
  /**
   * @example
   * ```ts
   * const response = await client.licenses.activate({
   *   license_key: 'license_key',
   *   name: 'name',
   * });
   * ```
   */
  activate(body, options) {
    return this._client.post("/licenses/activate", { body, ...options });
  }
  /**
   * @example
   * ```ts
   * await client.licenses.deactivate({
   *   license_key: 'license_key',
   *   license_key_instance_id: 'license_key_instance_id',
   * });
   * ```
   */
  deactivate(body, options) {
    return this._client.post("/licenses/deactivate", {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * @example
   * ```ts
   * const response = await client.licenses.validate({
   *   license_key: '2b1f8e2d-c41e-4e8f-b2d3-d9fd61c38f43',
   * });
   * ```
   */
  validate(body, options) {
    return this._client.post("/licenses/validate", { body, ...options });
  }
}
class Meters extends APIResource {
  /**
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const meter of client.meters.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/meters", DefaultPageNumberPagination, { query, ...options });
  }
  /**
   * @example
   * ```ts
   * const meter = await client.meters.create({
   *   aggregation: { type: 'count' },
   *   event_name: 'event_name',
   *   measurement_unit: 'measurement_unit',
   *   name: 'name',
   * });
   * ```
   */
  create(body, options) {
    return this._client.post("/meters", { body, ...options });
  }
  /**
   * @example
   * ```ts
   * const meter = await client.meters.retrieve(
   *   'mtr_h5tgTWL55OyMO0L2Q9w9v',
   * );
   * ```
   */
  retrieve(id, options) {
    return this._client.get(path`/meters/${id}`, options);
  }
  /**
   * @example
   * ```ts
   * await client.meters.archive('mtr_h5tgTWL55OyMO0L2Q9w9v');
   * ```
   */
  archive(id, options) {
    return this._client.delete(path`/meters/${id}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * @example
   * ```ts
   * await client.meters.unarchive('mtr_h5tgTWL55OyMO0L2Q9w9v');
   * ```
   */
  unarchive(id, options) {
    return this._client.post(path`/meters/${id}/unarchive`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
}
class Misc extends APIResource {
  listSupportedCountries(options) {
    return this._client.get("/checkout/supported_countries", options);
  }
}
class Payments2 extends APIResource {
  /**
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const paymentListResponse of client.payments.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/payments", DefaultPageNumberPagination, {
      query,
      ...options
    });
  }
  /**
   * @deprecated
   */
  create(body, options) {
    return this._client.post("/payments", { body, ...options });
  }
  /**
   * @example
   * ```ts
   * const payment = await client.payments.retrieve(
   *   'pay_gr4RizvMOXFJ6xca3y2tU',
   * );
   * ```
   */
  retrieve(paymentID, options) {
    return this._client.get(path`/payments/${paymentID}`, options);
  }
  /**
   * @example
   * ```ts
   * const response = await client.payments.retrieveLineItems(
   *   'pay_gr4RizvMOXFJ6xca3y2tU',
   * );
   * ```
   */
  retrieveLineItems(paymentID, options) {
    return this._client.get(path`/payments/${paymentID}/line-items`, options);
  }
}
class Details extends APIResource {
  /**
   * Returns paginated individual balance ledger entries for a payout, with each
   * entry's amount pro-rated into the payout's currency. Supports pagination via
   * `page_size` (default 10, max 100) and `page_number` (default 0) query
   * parameters.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const detailListResponse of client.payouts.breakup.details.list(
   *   'pyt_zFTrrn4sk3x3y2vjDBW3T',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(payoutID, query = {}, options) {
    return this._client.getAPIList(path`/payouts/${payoutID}/breakup/details`, DefaultPageNumberPagination, { query, ...options });
  }
  /**
   * Downloads the complete payout breakup as a CSV file. Each row represents a
   * balance ledger entry with columns: Ledger ID, Event Type, Original Amount,
   * Original Currency, Reference Object ID, Description, Created At, USD Equivalent
   * Amount, and Payout Currency Amount.
   *
   * @example
   * ```ts
   * await client.payouts.breakup.details.downloadCsv(
   *   'pyt_zFTrrn4sk3x3y2vjDBW3T',
   * );
   * ```
   */
  downloadCsv(payoutID, options) {
    return this._client.get(path`/payouts/${payoutID}/breakup/details/csv`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
}
class Breakup extends APIResource {
  constructor() {
    super(...arguments);
    this.details = new Details(this._client);
  }
  /**
   * Returns the breakdown of a payout by event type (payments, refunds, disputes,
   * fees, etc.) in the payout's currency. Each amount is proportionally allocated
   * based on USD equivalent values, ensuring the total sums exactly to the payout
   * amount.
   *
   * @example
   * ```ts
   * const breakups = await client.payouts.breakup.retrieve(
   *   'pyt_zFTrrn4sk3x3y2vjDBW3T',
   * );
   * ```
   */
  retrieve(payoutID, options) {
    return this._client.get(path`/payouts/${payoutID}/breakup`, options);
  }
}
Breakup.Details = Details;
class Payouts extends APIResource {
  constructor() {
    super(...arguments);
    this.breakup = new Breakup(this._client);
  }
  /**
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const payoutListResponse of client.payouts.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/payouts", DefaultPageNumberPagination, {
      query,
      ...options
    });
  }
}
Payouts.Breakup = Breakup;
class Items extends APIResource {
  /**
   * @example
   * ```ts
   * const productCollectionProducts =
   *   await client.productCollections.groups.items.create(
   *     '182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e',
   *     {
   *       id: 'pdc_8BWv0hojwUH7iCDabr0NI',
   *       products: [{ product_id: 'product_id' }],
   *     },
   *   );
   * ```
   */
  create(groupID, params, options) {
    const { id, ...body } = params;
    return this._client.post(path`/product-collections/${id}/groups/${groupID}/items`, { body, ...options });
  }
  /**
   * @example
   * ```ts
   * await client.productCollections.groups.items.delete(
   *   '182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e',
   *   {
   *     id: 'pdc_8BWv0hojwUH7iCDabr0NI',
   *     group_id: '182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e',
   *   },
   * );
   * ```
   */
  delete(itemID, params, options) {
    const { id, group_id } = params;
    return this._client.delete(path`/product-collections/${id}/groups/${group_id}/items/${itemID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * @example
   * ```ts
   * await client.productCollections.groups.items.update(
   *   '182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e',
   *   {
   *     id: 'pdc_8BWv0hojwUH7iCDabr0NI',
   *     group_id: '182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e',
   *     status: true,
   *   },
   * );
   * ```
   */
  update(itemID, params, options) {
    const { id, group_id, ...body } = params;
    return this._client.patch(path`/product-collections/${id}/groups/${group_id}/items/${itemID}`, {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
}
class Groups extends APIResource {
  constructor() {
    super(...arguments);
    this.items = new Items(this._client);
  }
  /**
   * @example
   * ```ts
   * const productCollectionGroupResponse =
   *   await client.productCollections.groups.create(
   *     'pdc_8BWv0hojwUH7iCDabr0NI',
   *     { products: [{ product_id: 'product_id' }] },
   *   );
   * ```
   */
  create(id, body, options) {
    return this._client.post(path`/product-collections/${id}/groups`, { body, ...options });
  }
  /**
   * @example
   * ```ts
   * await client.productCollections.groups.delete(
   *   '182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e',
   *   { id: 'pdc_8BWv0hojwUH7iCDabr0NI' },
   * );
   * ```
   */
  delete(groupID, params, options) {
    const { id } = params;
    return this._client.delete(path`/product-collections/${id}/groups/${groupID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * @example
   * ```ts
   * await client.productCollections.groups.update(
   *   '182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e',
   *   { id: 'pdc_8BWv0hojwUH7iCDabr0NI' },
   * );
   * ```
   */
  update(groupID, params, options) {
    const { id, ...body } = params;
    return this._client.patch(path`/product-collections/${id}/groups/${groupID}`, {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
}
Groups.Items = Items;
class ProductCollections extends APIResource {
  constructor() {
    super(...arguments);
    this.groups = new Groups(this._client);
  }
  /**
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const productCollectionListResponse of client.productCollections.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/product-collections", DefaultPageNumberPagination, { query, ...options });
  }
  /**
   * @example
   * ```ts
   * const productCollection =
   *   await client.productCollections.create({
   *     groups: [{ products: [{ product_id: 'product_id' }] }],
   *     name: 'name',
   *   });
   * ```
   */
  create(body, options) {
    return this._client.post("/product-collections", { body, ...options });
  }
  /**
   * @example
   * ```ts
   * const productCollection =
   *   await client.productCollections.retrieve(
   *     'pdc_8BWv0hojwUH7iCDabr0NI',
   *   );
   * ```
   */
  retrieve(id, options) {
    return this._client.get(path`/product-collections/${id}`, options);
  }
  /**
   * @example
   * ```ts
   * await client.productCollections.delete(
   *   'pdc_8BWv0hojwUH7iCDabr0NI',
   * );
   * ```
   */
  delete(id, options) {
    return this._client.delete(path`/product-collections/${id}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * @example
   * ```ts
   * await client.productCollections.update(
   *   'pdc_8BWv0hojwUH7iCDabr0NI',
   * );
   * ```
   */
  update(id, body, options) {
    return this._client.patch(path`/product-collections/${id}`, {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * @example
   * ```ts
   * const response =
   *   await client.productCollections.updateImages(
   *     'pdc_8BWv0hojwUH7iCDabr0NI',
   *   );
   * ```
   */
  updateImages(id, params = {}, options) {
    const { force_update } = params ?? {};
    return this._client.put(path`/product-collections/${id}/images`, { query: { force_update }, ...options });
  }
  /**
   * @example
   * ```ts
   * const response = await client.productCollections.unarchive(
   *   'pdc_8BWv0hojwUH7iCDabr0NI',
   * );
   * ```
   */
  unarchive(id, options) {
    return this._client.post(path`/product-collections/${id}/unarchive`, options);
  }
}
ProductCollections.Groups = Groups;
class Images extends APIResource {
  /**
   * @example
   * ```ts
   * const image = await client.products.images.update(
   *   'pdt_R8AWMPiV8RyJElcCKvAID',
   * );
   * ```
   */
  update(id, params = {}, options) {
    const { force_update } = params ?? {};
    return this._client.put(path`/products/${id}/images`, { query: { force_update }, ...options });
  }
}
class LocalizedPrices extends APIResource {
  /**
   * @example
   * ```ts
   * const listLocalizedPricesResponse =
   *   await client.products.localizedPrices.list(
   *     'pdt_R8AWMPiV8RyJElcCKvAID',
   *   );
   * ```
   */
  list(productID, options) {
    return this._client.get(path`/products/${productID}/localized-prices`, options);
  }
  /**
   * @example
   * ```ts
   * const localizedPrice =
   *   await client.products.localizedPrices.create(
   *     'pdt_R8AWMPiV8RyJElcCKvAID',
   *     { amount: 0, currency: 'AED' },
   *   );
   * ```
   */
  create(productID, body, options) {
    return this._client.post(path`/products/${productID}/localized-prices`, { body, ...options });
  }
  /**
   * @example
   * ```ts
   * const localizedPrice =
   *   await client.products.localizedPrices.retrieve(
   *     'lcp_3aOOT7ebrzBOV41yL2V6s',
   *     { product_id: 'pdt_R8AWMPiV8RyJElcCKvAID' },
   *   );
   * ```
   */
  retrieve(id, params, options) {
    const { product_id } = params;
    return this._client.get(path`/products/${product_id}/localized-prices/${id}`, options);
  }
  /**
   * @example
   * ```ts
   * const localizedPrice =
   *   await client.products.localizedPrices.update(
   *     'lcp_3aOOT7ebrzBOV41yL2V6s',
   *     { product_id: 'pdt_R8AWMPiV8RyJElcCKvAID' },
   *   );
   * ```
   */
  update(id, params, options) {
    const { product_id, ...body } = params;
    return this._client.patch(path`/products/${product_id}/localized-prices/${id}`, { body, ...options });
  }
  /**
   * @example
   * ```ts
   * await client.products.localizedPrices.archive(
   *   'lcp_3aOOT7ebrzBOV41yL2V6s',
   *   { product_id: 'pdt_R8AWMPiV8RyJElcCKvAID' },
   * );
   * ```
   */
  archive(id, params, options) {
    const { product_id } = params;
    return this._client.delete(path`/products/${product_id}/localized-prices/${id}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
}
class ShortLinks extends APIResource {
  /**
   * Lists all short links created by the business.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const shortLinkListResponse of client.products.shortLinks.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/products/short_links", DefaultPageNumberPagination, { query, ...options });
  }
  /**
   * Gives a Short Checkout URL with custom slug for a product. Uses a Static
   * Checkout URL under the hood.
   *
   * @example
   * ```ts
   * const shortLink = await client.products.shortLinks.create(
   *   'pdt_R8AWMPiV8RyJElcCKvAID',
   *   { slug: 'slug' },
   * );
   * ```
   */
  create(id, body, options) {
    return this._client.post(path`/products/${id}/short_links`, { body, ...options });
  }
}
class Products extends APIResource {
  constructor() {
    super(...arguments);
    this.images = new Images(this._client);
    this.shortLinks = new ShortLinks(this._client);
    this.localizedPrices = new LocalizedPrices(this._client);
  }
  /**
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const productListResponse of client.products.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/products", DefaultPageNumberPagination, {
      query,
      ...options
    });
  }
  /**
   * @example
   * ```ts
   * const product = await client.products.create({
   *   name: 'name',
   *   price: {
   *     currency: 'AED',
   *     discount: 0,
   *     price: 0,
   *     purchasing_power_parity: true,
   *     type: 'one_time_price',
   *   },
   *   tax_category: 'digital_products',
   * });
   * ```
   */
  create(body, options) {
    return this._client.post("/products", { body, ...options });
  }
  /**
   * @example
   * ```ts
   * const product = await client.products.retrieve(
   *   'pdt_R8AWMPiV8RyJElcCKvAID',
   * );
   * ```
   */
  retrieve(id, options) {
    return this._client.get(path`/products/${id}`, options);
  }
  /**
   * @example
   * ```ts
   * await client.products.update('pdt_R8AWMPiV8RyJElcCKvAID');
   * ```
   */
  update(id, body, options) {
    return this._client.patch(path`/products/${id}`, {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * @example
   * ```ts
   * await client.products.archive('pdt_R8AWMPiV8RyJElcCKvAID');
   * ```
   */
  archive(id, options) {
    return this._client.delete(path`/products/${id}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * @example
   * ```ts
   * await client.products.unarchive(
   *   'pdt_R8AWMPiV8RyJElcCKvAID',
   * );
   * ```
   */
  unarchive(id, options) {
    return this._client.post(path`/products/${id}/unarchive`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * @example
   * ```ts
   * const response = await client.products.updateFiles(
   *   'pdt_R8AWMPiV8RyJElcCKvAID',
   *   { file_name: 'file_name' },
   * );
   * ```
   */
  updateFiles(id, body, options) {
    return this._client.put(path`/products/${id}/files`, { body, ...options });
  }
}
Products.Images = Images;
Products.ShortLinks = ShortLinks;
Products.LocalizedPrices = LocalizedPrices;
class Refunds extends APIResource {
  /**
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const refundListItem of client.refunds.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/refunds", DefaultPageNumberPagination, {
      query,
      ...options
    });
  }
  /**
   * @example
   * ```ts
   * const refund = await client.refunds.create({
   *   payment_id: 'payment_id',
   * });
   * ```
   */
  create(body, options) {
    return this._client.post("/refunds", { body, ...options });
  }
  /**
   * @example
   * ```ts
   * const refund = await client.refunds.retrieve(
   *   'ref_F0gZetLvTxxBrMU2CZcmy',
   * );
   * ```
   */
  retrieve(refundID, options) {
    return this._client.get(path`/refunds/${refundID}`, options);
  }
}
class Subscriptions extends APIResource {
  /**
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const subscriptionListResponse of client.subscriptions.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/subscriptions", DefaultPageNumberPagination, {
      query,
      ...options
    });
  }
  /**
   * @deprecated
   */
  create(body, options) {
    return this._client.post("/subscriptions", { body, ...options });
  }
  /**
   * @example
   * ```ts
   * const subscription = await client.subscriptions.retrieve(
   *   'sub_Iuaq622bbmmfOGrVTqdXv',
   * );
   * ```
   */
  retrieve(subscriptionID, options) {
    return this._client.get(path`/subscriptions/${subscriptionID}`, options);
  }
  /**
   * @example
   * ```ts
   * const subscription = await client.subscriptions.update(
   *   'sub_Iuaq622bbmmfOGrVTqdXv',
   * );
   * ```
   */
  update(subscriptionID, body, options) {
    return this._client.patch(path`/subscriptions/${subscriptionID}`, { body, ...options });
  }
  /**
   * @example
   * ```ts
   * const response = await client.subscriptions.charge(
   *   'sub_Iuaq622bbmmfOGrVTqdXv',
   *   { product_price: 0 },
   * );
   * ```
   */
  charge(subscriptionID, body, options) {
    return this._client.post(path`/subscriptions/${subscriptionID}/charge`, { body, ...options });
  }
  /**
   * @example
   * ```ts
   * await client.subscriptions.changePlan(
   *   'sub_Iuaq622bbmmfOGrVTqdXv',
   *   {
   *     product_id: 'product_id',
   *     proration_billing_mode: 'prorated_immediately',
   *     quantity: 0,
   *   },
   * );
   * ```
   */
  changePlan(subscriptionID, body, options) {
    return this._client.post(path`/subscriptions/${subscriptionID}/change-plan`, {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * Get detailed usage history for a subscription that includes usage-based billing
   * (metered components). This endpoint provides insights into customer usage
   * patterns and billing calculations over time.
   *
   * ## What You'll Get:
   *
   * - **Billing periods**: Each item represents a billing cycle with start and end
   *   dates
   * - **Meter usage**: Detailed breakdown of usage for each meter configured on the
   *   subscription
   * - **Usage calculations**: Total units consumed, free threshold units, and
   *   chargeable units
   * - **Historical tracking**: Complete audit trail of usage-based charges
   *
   * ## Use Cases:
   *
   * - **Customer support**: Investigate billing questions and usage discrepancies
   * - **Usage analytics**: Analyze customer consumption patterns over time
   * - **Billing transparency**: Provide customers with detailed usage breakdowns
   * - **Revenue optimization**: Identify usage trends to optimize pricing strategies
   *
   * ## Filtering Options:
   *
   * - **Date range filtering**: Get usage history for specific time periods
   * - **Meter-specific filtering**: Focus on usage for a particular meter
   * - **Pagination**: Navigate through large usage histories efficiently
   *
   * ## Important Notes:
   *
   * - Only returns data for subscriptions with usage-based (metered) components
   * - Usage history is organized by billing periods (subscription cycles)
   * - Free threshold units are calculated and displayed separately from chargeable
   *   units
   * - Historical data is preserved even if meter configurations change
   *
   * ## Example Query Patterns:
   *
   * - Get last 3 months:
   *   `?start_date=2024-01-01T00:00:00Z&end_date=2024-03-31T23:59:59Z`
   * - Filter by meter: `?meter_id=mtr_api_requests`
   * - Paginate results: `?page_size=20&page_number=1`
   * - Recent usage: `?start_date=2024-03-01T00:00:00Z` (from March 1st to now)
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const subscriptionRetrieveUsageHistoryResponse of client.subscriptions.retrieveUsageHistory(
   *   'sub_Iuaq622bbmmfOGrVTqdXv',
   * )) {
   *   // ...
   * }
   * ```
   */
  retrieveUsageHistory(subscriptionID, query = {}, options) {
    return this._client.getAPIList(path`/subscriptions/${subscriptionID}/usage-history`, DefaultPageNumberPagination, { query, ...options });
  }
  /**
   * @example
   * ```ts
   * const response =
   *   await client.subscriptions.updatePaymentMethod(
   *     'sub_Iuaq622bbmmfOGrVTqdXv',
   *     { payment_method: { type: 'new' } },
   *   );
   * ```
   */
  updatePaymentMethod(subscriptionID, params, options) {
    const { payment_method } = params;
    return this._client.post(path`/subscriptions/${subscriptionID}/update-payment-method`, {
      body: payment_method,
      ...options
    });
  }
  /**
   * @example
   * ```ts
   * const response =
   *   await client.subscriptions.previewChangePlan(
   *     'sub_Iuaq622bbmmfOGrVTqdXv',
   *     {
   *       product_id: 'product_id',
   *       proration_billing_mode: 'prorated_immediately',
   *       quantity: 0,
   *     },
   *   );
   * ```
   */
  previewChangePlan(subscriptionID, body, options) {
    return this._client.post(path`/subscriptions/${subscriptionID}/change-plan/preview`, {
      body,
      ...options
    });
  }
  /**
   * @example
   * ```ts
   * const response =
   *   await client.subscriptions.retrieveCreditUsage(
   *     'sub_Iuaq622bbmmfOGrVTqdXv',
   *   );
   * ```
   */
  retrieveCreditUsage(subscriptionID, options) {
    return this._client.get(path`/subscriptions/${subscriptionID}/credit-usage`, options);
  }
  /**
   * @example
   * ```ts
   * await client.subscriptions.cancelChangePlan(
   *   'sub_Iuaq622bbmmfOGrVTqdXv',
   * );
   * ```
   */
  cancelChangePlan(subscriptionID, options) {
    return this._client.delete(path`/subscriptions/${subscriptionID}/change-plan/scheduled`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
}
class UsageEvents extends APIResource {
  /**
   * This endpoint allows you to ingest custom events that can be used for:
   *
   * - Usage-based billing and metering
   * - Analytics and reporting
   * - Customer behavior tracking
   *
   * ## Important Notes:
   *
   * - **Duplicate Prevention**:
   *   - Duplicate `event_id` values within the same request are rejected (entire
   *     request fails)
   *   - Subsequent requests with existing `event_id` values are ignored (idempotent
   *     behavior)
   * - **Rate Limiting**: Maximum 1000 events per request
   * - **Time Validation**: Events with timestamps older than 1 hour or more than 5
   *   minutes in the future will be rejected
   * - **Metadata Limits**: Maximum 50 key-value pairs per event, keys max 100 chars,
   *   values max 500 chars
   *
   * ## Example Usage:
   *
   * ```json
   * {
   *   "events": [
   *     {
   *       "event_id": "api_call_12345",
   *       "customer_id": "cus_abc123",
   *       "event_name": "api_request",
   *       "timestamp": "2024-01-15T10:30:00Z",
   *       "metadata": {
   *         "endpoint": "/api/v1/users",
   *         "method": "GET",
   *         "tokens_used": "150"
   *       }
   *     }
   *   ]
   * }
   * ```
   */
  ingest(body, options) {
    return this._client.post("/events/ingest", { body, ...options });
  }
  /**
   * Fetch events from your account with powerful filtering capabilities. This
   * endpoint is ideal for:
   *
   * - Debugging event ingestion issues
   * - Analyzing customer usage patterns
   * - Building custom analytics dashboards
   * - Auditing billing-related events
   *
   * ## Filtering Options:
   *
   * - **Customer filtering**: Filter by specific customer ID
   * - **Event name filtering**: Filter by event type/name
   * - **Meter-based filtering**: Use a meter ID to apply the meter's event name and
   *   filter criteria automatically
   * - **Time range filtering**: Filter events within a specific date range
   * - **Pagination**: Navigate through large result sets
   *
   * ## Meter Integration:
   *
   * When using `meter_id`, the endpoint automatically applies:
   *
   * - The meter's configured `event_name` filter
   * - The meter's custom filter criteria (if any)
   * - If you also provide `event_name`, it must match the meter's event name
   *
   * ## Example Queries:
   *
   * - Get all events for a customer: `?customer_id=cus_abc123`
   * - Get API request events: `?event_name=api_request`
   * - Get events from last 24 hours:
   *   `?start=2024-01-14T10:30:00Z&end=2024-01-15T10:30:00Z`
   * - Get events with meter filtering: `?meter_id=mtr_xyz789`
   * - Paginate results: `?page_size=50&page_number=2`
   */
  list(query = {}, options) {
    return this._client.getAPIList("/events", DefaultPageNumberPagination, { query, ...options });
  }
  /**
   * Fetch detailed information about a single event using its unique event ID. This
   * endpoint is useful for:
   *
   * - Debugging specific event ingestion issues
   * - Retrieving event details for customer support
   * - Validating that events were processed correctly
   * - Getting the complete metadata for an event
   *
   * ## Event ID Format:
   *
   * The event ID should be the same value that was provided during event ingestion
   * via the `/events/ingest` endpoint. Event IDs are case-sensitive and must match
   * exactly.
   *
   * ## Response Details:
   *
   * The response includes all event data including:
   *
   * - Complete metadata key-value pairs
   * - Original timestamp (preserved from ingestion)
   * - Customer and business association
   * - Event name and processing information
   *
   * ## Example Usage:
   *
   * ```text
   * GET /events/api_call_12345
   * ```
   */
  retrieve(eventID, options) {
    return this._client.get(path`/events/${eventID}`, options);
  }
}
class WebhookEvents extends APIResource {
}
let Headers$1 = class Headers2 extends APIResource {
  /**
   * Get a webhook by id
   *
   * @example
   * ```ts
   * const header = await client.webhooks.headers.retrieve(
   *   'whk_YdWqVEGKmSYKbsIyDxEab',
   * );
   * ```
   */
  retrieve(webhookID, options) {
    return this._client.get(path`/webhooks/${webhookID}/headers`, options);
  }
  /**
   * Patch a webhook by id
   *
   * @example
   * ```ts
   * await client.webhooks.headers.update(
   *   'whk_YdWqVEGKmSYKbsIyDxEab',
   *   { headers: { foo: 'string' } },
   * );
   * ```
   */
  update(webhookID, body, options) {
    return this._client.patch(path`/webhooks/${webhookID}/headers`, {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
};
var dist = {};
var timing_safe_equal = {};
var hasRequiredTiming_safe_equal;
function requireTiming_safe_equal() {
  if (hasRequiredTiming_safe_equal) return timing_safe_equal;
  hasRequiredTiming_safe_equal = 1;
  Object.defineProperty(timing_safe_equal, "__esModule", { value: true });
  timing_safe_equal.timingSafeEqual = void 0;
  function assert(expr, msg = "") {
    if (!expr) {
      throw new Error(msg);
    }
  }
  function timingSafeEqual(a, b) {
    if (a.byteLength !== b.byteLength) {
      return false;
    }
    if (!(a instanceof DataView)) {
      a = new DataView(ArrayBuffer.isView(a) ? a.buffer : a);
    }
    if (!(b instanceof DataView)) {
      b = new DataView(ArrayBuffer.isView(b) ? b.buffer : b);
    }
    assert(a instanceof DataView);
    assert(b instanceof DataView);
    const length = a.byteLength;
    let out = 0;
    let i = -1;
    while (++i < length) {
      out |= a.getUint8(i) ^ b.getUint8(i);
    }
    return out === 0;
  }
  timing_safe_equal.timingSafeEqual = timingSafeEqual;
  return timing_safe_equal;
}
var base64 = {};
var hasRequiredBase64;
function requireBase64() {
  if (hasRequiredBase64) return base64;
  hasRequiredBase64 = 1;
  var __extends = base64 && base64.__extends || /* @__PURE__ */ (function() {
    var extendStatics = function(d, b) {
      extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
        d2.__proto__ = b2;
      } || function(d2, b2) {
        for (var p in b2) if (b2.hasOwnProperty(p)) d2[p] = b2[p];
      };
      return extendStatics(d, b);
    };
    return function(d, b) {
      extendStatics(d, b);
      function __() {
        this.constructor = d;
      }
      d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
  })();
  Object.defineProperty(base64, "__esModule", { value: true });
  var INVALID_BYTE = 256;
  var Coder = (
    /** @class */
    (function() {
      function Coder2(_paddingCharacter) {
        if (_paddingCharacter === void 0) {
          _paddingCharacter = "=";
        }
        this._paddingCharacter = _paddingCharacter;
      }
      Coder2.prototype.encodedLength = function(length) {
        if (!this._paddingCharacter) {
          return (length * 8 + 5) / 6 | 0;
        }
        return (length + 2) / 3 * 4 | 0;
      };
      Coder2.prototype.encode = function(data) {
        var out = "";
        var i = 0;
        for (; i < data.length - 2; i += 3) {
          var c = data[i] << 16 | data[i + 1] << 8 | data[i + 2];
          out += this._encodeByte(c >>> 3 * 6 & 63);
          out += this._encodeByte(c >>> 2 * 6 & 63);
          out += this._encodeByte(c >>> 1 * 6 & 63);
          out += this._encodeByte(c >>> 0 * 6 & 63);
        }
        var left = data.length - i;
        if (left > 0) {
          var c = data[i] << 16 | (left === 2 ? data[i + 1] << 8 : 0);
          out += this._encodeByte(c >>> 3 * 6 & 63);
          out += this._encodeByte(c >>> 2 * 6 & 63);
          if (left === 2) {
            out += this._encodeByte(c >>> 1 * 6 & 63);
          } else {
            out += this._paddingCharacter || "";
          }
          out += this._paddingCharacter || "";
        }
        return out;
      };
      Coder2.prototype.maxDecodedLength = function(length) {
        if (!this._paddingCharacter) {
          return (length * 6 + 7) / 8 | 0;
        }
        return length / 4 * 3 | 0;
      };
      Coder2.prototype.decodedLength = function(s) {
        return this.maxDecodedLength(s.length - this._getPaddingLength(s));
      };
      Coder2.prototype.decode = function(s) {
        if (s.length === 0) {
          return new Uint8Array(0);
        }
        var paddingLength = this._getPaddingLength(s);
        var length = s.length - paddingLength;
        var out = new Uint8Array(this.maxDecodedLength(length));
        var op = 0;
        var i = 0;
        var haveBad = 0;
        var v0 = 0, v1 = 0, v2 = 0, v3 = 0;
        for (; i < length - 4; i += 4) {
          v0 = this._decodeChar(s.charCodeAt(i + 0));
          v1 = this._decodeChar(s.charCodeAt(i + 1));
          v2 = this._decodeChar(s.charCodeAt(i + 2));
          v3 = this._decodeChar(s.charCodeAt(i + 3));
          out[op++] = v0 << 2 | v1 >>> 4;
          out[op++] = v1 << 4 | v2 >>> 2;
          out[op++] = v2 << 6 | v3;
          haveBad |= v0 & INVALID_BYTE;
          haveBad |= v1 & INVALID_BYTE;
          haveBad |= v2 & INVALID_BYTE;
          haveBad |= v3 & INVALID_BYTE;
        }
        if (i < length - 1) {
          v0 = this._decodeChar(s.charCodeAt(i));
          v1 = this._decodeChar(s.charCodeAt(i + 1));
          out[op++] = v0 << 2 | v1 >>> 4;
          haveBad |= v0 & INVALID_BYTE;
          haveBad |= v1 & INVALID_BYTE;
        }
        if (i < length - 2) {
          v2 = this._decodeChar(s.charCodeAt(i + 2));
          out[op++] = v1 << 4 | v2 >>> 2;
          haveBad |= v2 & INVALID_BYTE;
        }
        if (i < length - 3) {
          v3 = this._decodeChar(s.charCodeAt(i + 3));
          out[op++] = v2 << 6 | v3;
          haveBad |= v3 & INVALID_BYTE;
        }
        if (haveBad !== 0) {
          throw new Error("Base64Coder: incorrect characters for decoding");
        }
        return out;
      };
      Coder2.prototype._encodeByte = function(b) {
        var result = b;
        result += 65;
        result += 25 - b >>> 8 & 0 - 65 - 26 + 97;
        result += 51 - b >>> 8 & 26 - 97 - 52 + 48;
        result += 61 - b >>> 8 & 52 - 48 - 62 + 43;
        result += 62 - b >>> 8 & 62 - 43 - 63 + 47;
        return String.fromCharCode(result);
      };
      Coder2.prototype._decodeChar = function(c) {
        var result = INVALID_BYTE;
        result += (42 - c & c - 44) >>> 8 & -INVALID_BYTE + c - 43 + 62;
        result += (46 - c & c - 48) >>> 8 & -INVALID_BYTE + c - 47 + 63;
        result += (47 - c & c - 58) >>> 8 & -INVALID_BYTE + c - 48 + 52;
        result += (64 - c & c - 91) >>> 8 & -INVALID_BYTE + c - 65 + 0;
        result += (96 - c & c - 123) >>> 8 & -INVALID_BYTE + c - 97 + 26;
        return result;
      };
      Coder2.prototype._getPaddingLength = function(s) {
        var paddingLength = 0;
        if (this._paddingCharacter) {
          for (var i = s.length - 1; i >= 0; i--) {
            if (s[i] !== this._paddingCharacter) {
              break;
            }
            paddingLength++;
          }
          if (s.length < 4 || paddingLength > 2) {
            throw new Error("Base64Coder: incorrect padding");
          }
        }
        return paddingLength;
      };
      return Coder2;
    })()
  );
  base64.Coder = Coder;
  var stdCoder = new Coder();
  function encode(data) {
    return stdCoder.encode(data);
  }
  base64.encode = encode;
  function decode(s) {
    return stdCoder.decode(s);
  }
  base64.decode = decode;
  var URLSafeCoder = (
    /** @class */
    (function(_super) {
      __extends(URLSafeCoder2, _super);
      function URLSafeCoder2() {
        return _super !== null && _super.apply(this, arguments) || this;
      }
      URLSafeCoder2.prototype._encodeByte = function(b) {
        var result = b;
        result += 65;
        result += 25 - b >>> 8 & 0 - 65 - 26 + 97;
        result += 51 - b >>> 8 & 26 - 97 - 52 + 48;
        result += 61 - b >>> 8 & 52 - 48 - 62 + 45;
        result += 62 - b >>> 8 & 62 - 45 - 63 + 95;
        return String.fromCharCode(result);
      };
      URLSafeCoder2.prototype._decodeChar = function(c) {
        var result = INVALID_BYTE;
        result += (44 - c & c - 46) >>> 8 & -INVALID_BYTE + c - 45 + 62;
        result += (94 - c & c - 96) >>> 8 & -INVALID_BYTE + c - 95 + 63;
        result += (47 - c & c - 58) >>> 8 & -INVALID_BYTE + c - 48 + 52;
        result += (64 - c & c - 91) >>> 8 & -INVALID_BYTE + c - 65 + 0;
        result += (96 - c & c - 123) >>> 8 & -INVALID_BYTE + c - 97 + 26;
        return result;
      };
      return URLSafeCoder2;
    })(Coder)
  );
  base64.URLSafeCoder = URLSafeCoder;
  var urlSafeCoder = new URLSafeCoder();
  function encodeURLSafe(data) {
    return urlSafeCoder.encode(data);
  }
  base64.encodeURLSafe = encodeURLSafe;
  function decodeURLSafe(s) {
    return urlSafeCoder.decode(s);
  }
  base64.decodeURLSafe = decodeURLSafe;
  base64.encodedLength = function(length) {
    return stdCoder.encodedLength(length);
  };
  base64.maxDecodedLength = function(length) {
    return stdCoder.maxDecodedLength(length);
  };
  base64.decodedLength = function(s) {
    return stdCoder.decodedLength(s);
  };
  return base64;
}
var sha256$1 = { exports: {} };
var sha256 = sha256$1.exports;
var hasRequiredSha256;
function requireSha256() {
  if (hasRequiredSha256) return sha256$1.exports;
  hasRequiredSha256 = 1;
  (function(module) {
    (function(root, factory) {
      var exports = {};
      factory(exports);
      var sha2562 = exports["default"];
      for (var k in exports) {
        sha2562[k] = exports[k];
      }
      {
        module.exports = sha2562;
      }
    })(sha256, function(exports) {
      exports.__esModule = true;
      exports.digestLength = 32;
      exports.blockSize = 64;
      var K = new Uint32Array([
        1116352408,
        1899447441,
        3049323471,
        3921009573,
        961987163,
        1508970993,
        2453635748,
        2870763221,
        3624381080,
        310598401,
        607225278,
        1426881987,
        1925078388,
        2162078206,
        2614888103,
        3248222580,
        3835390401,
        4022224774,
        264347078,
        604807628,
        770255983,
        1249150122,
        1555081692,
        1996064986,
        2554220882,
        2821834349,
        2952996808,
        3210313671,
        3336571891,
        3584528711,
        113926993,
        338241895,
        666307205,
        773529912,
        1294757372,
        1396182291,
        1695183700,
        1986661051,
        2177026350,
        2456956037,
        2730485921,
        2820302411,
        3259730800,
        3345764771,
        3516065817,
        3600352804,
        4094571909,
        275423344,
        430227734,
        506948616,
        659060556,
        883997877,
        958139571,
        1322822218,
        1537002063,
        1747873779,
        1955562222,
        2024104815,
        2227730452,
        2361852424,
        2428436474,
        2756734187,
        3204031479,
        3329325298
      ]);
      function hashBlocks(w, v, p, pos, len) {
        var a, b, c, d, e, f, g, h, u, i, j, t1, t2;
        while (len >= 64) {
          a = v[0];
          b = v[1];
          c = v[2];
          d = v[3];
          e = v[4];
          f = v[5];
          g = v[6];
          h = v[7];
          for (i = 0; i < 16; i++) {
            j = pos + i * 4;
            w[i] = (p[j] & 255) << 24 | (p[j + 1] & 255) << 16 | (p[j + 2] & 255) << 8 | p[j + 3] & 255;
          }
          for (i = 16; i < 64; i++) {
            u = w[i - 2];
            t1 = (u >>> 17 | u << 32 - 17) ^ (u >>> 19 | u << 32 - 19) ^ u >>> 10;
            u = w[i - 15];
            t2 = (u >>> 7 | u << 32 - 7) ^ (u >>> 18 | u << 32 - 18) ^ u >>> 3;
            w[i] = (t1 + w[i - 7] | 0) + (t2 + w[i - 16] | 0);
          }
          for (i = 0; i < 64; i++) {
            t1 = (((e >>> 6 | e << 32 - 6) ^ (e >>> 11 | e << 32 - 11) ^ (e >>> 25 | e << 32 - 25)) + (e & f ^ ~e & g) | 0) + (h + (K[i] + w[i] | 0) | 0) | 0;
            t2 = ((a >>> 2 | a << 32 - 2) ^ (a >>> 13 | a << 32 - 13) ^ (a >>> 22 | a << 32 - 22)) + (a & b ^ a & c ^ b & c) | 0;
            h = g;
            g = f;
            f = e;
            e = d + t1 | 0;
            d = c;
            c = b;
            b = a;
            a = t1 + t2 | 0;
          }
          v[0] += a;
          v[1] += b;
          v[2] += c;
          v[3] += d;
          v[4] += e;
          v[5] += f;
          v[6] += g;
          v[7] += h;
          pos += 64;
          len -= 64;
        }
        return pos;
      }
      var Hash = (
        /** @class */
        (function() {
          function Hash2() {
            this.digestLength = exports.digestLength;
            this.blockSize = exports.blockSize;
            this.state = new Int32Array(8);
            this.temp = new Int32Array(64);
            this.buffer = new Uint8Array(128);
            this.bufferLength = 0;
            this.bytesHashed = 0;
            this.finished = false;
            this.reset();
          }
          Hash2.prototype.reset = function() {
            this.state[0] = 1779033703;
            this.state[1] = 3144134277;
            this.state[2] = 1013904242;
            this.state[3] = 2773480762;
            this.state[4] = 1359893119;
            this.state[5] = 2600822924;
            this.state[6] = 528734635;
            this.state[7] = 1541459225;
            this.bufferLength = 0;
            this.bytesHashed = 0;
            this.finished = false;
            return this;
          };
          Hash2.prototype.clean = function() {
            for (var i = 0; i < this.buffer.length; i++) {
              this.buffer[i] = 0;
            }
            for (var i = 0; i < this.temp.length; i++) {
              this.temp[i] = 0;
            }
            this.reset();
          };
          Hash2.prototype.update = function(data, dataLength) {
            if (dataLength === void 0) {
              dataLength = data.length;
            }
            if (this.finished) {
              throw new Error("SHA256: can't update because hash was finished.");
            }
            var dataPos = 0;
            this.bytesHashed += dataLength;
            if (this.bufferLength > 0) {
              while (this.bufferLength < 64 && dataLength > 0) {
                this.buffer[this.bufferLength++] = data[dataPos++];
                dataLength--;
              }
              if (this.bufferLength === 64) {
                hashBlocks(this.temp, this.state, this.buffer, 0, 64);
                this.bufferLength = 0;
              }
            }
            if (dataLength >= 64) {
              dataPos = hashBlocks(this.temp, this.state, data, dataPos, dataLength);
              dataLength %= 64;
            }
            while (dataLength > 0) {
              this.buffer[this.bufferLength++] = data[dataPos++];
              dataLength--;
            }
            return this;
          };
          Hash2.prototype.finish = function(out) {
            if (!this.finished) {
              var bytesHashed = this.bytesHashed;
              var left = this.bufferLength;
              var bitLenHi = bytesHashed / 536870912 | 0;
              var bitLenLo = bytesHashed << 3;
              var padLength = bytesHashed % 64 < 56 ? 64 : 128;
              this.buffer[left] = 128;
              for (var i = left + 1; i < padLength - 8; i++) {
                this.buffer[i] = 0;
              }
              this.buffer[padLength - 8] = bitLenHi >>> 24 & 255;
              this.buffer[padLength - 7] = bitLenHi >>> 16 & 255;
              this.buffer[padLength - 6] = bitLenHi >>> 8 & 255;
              this.buffer[padLength - 5] = bitLenHi >>> 0 & 255;
              this.buffer[padLength - 4] = bitLenLo >>> 24 & 255;
              this.buffer[padLength - 3] = bitLenLo >>> 16 & 255;
              this.buffer[padLength - 2] = bitLenLo >>> 8 & 255;
              this.buffer[padLength - 1] = bitLenLo >>> 0 & 255;
              hashBlocks(this.temp, this.state, this.buffer, 0, padLength);
              this.finished = true;
            }
            for (var i = 0; i < 8; i++) {
              out[i * 4 + 0] = this.state[i] >>> 24 & 255;
              out[i * 4 + 1] = this.state[i] >>> 16 & 255;
              out[i * 4 + 2] = this.state[i] >>> 8 & 255;
              out[i * 4 + 3] = this.state[i] >>> 0 & 255;
            }
            return this;
          };
          Hash2.prototype.digest = function() {
            var out = new Uint8Array(this.digestLength);
            this.finish(out);
            return out;
          };
          Hash2.prototype._saveState = function(out) {
            for (var i = 0; i < this.state.length; i++) {
              out[i] = this.state[i];
            }
          };
          Hash2.prototype._restoreState = function(from, bytesHashed) {
            for (var i = 0; i < this.state.length; i++) {
              this.state[i] = from[i];
            }
            this.bytesHashed = bytesHashed;
            this.finished = false;
            this.bufferLength = 0;
          };
          return Hash2;
        })()
      );
      exports.Hash = Hash;
      var HMAC = (
        /** @class */
        (function() {
          function HMAC2(key) {
            this.inner = new Hash();
            this.outer = new Hash();
            this.blockSize = this.inner.blockSize;
            this.digestLength = this.inner.digestLength;
            var pad = new Uint8Array(this.blockSize);
            if (key.length > this.blockSize) {
              new Hash().update(key).finish(pad).clean();
            } else {
              for (var i = 0; i < key.length; i++) {
                pad[i] = key[i];
              }
            }
            for (var i = 0; i < pad.length; i++) {
              pad[i] ^= 54;
            }
            this.inner.update(pad);
            for (var i = 0; i < pad.length; i++) {
              pad[i] ^= 54 ^ 92;
            }
            this.outer.update(pad);
            this.istate = new Uint32Array(8);
            this.ostate = new Uint32Array(8);
            this.inner._saveState(this.istate);
            this.outer._saveState(this.ostate);
            for (var i = 0; i < pad.length; i++) {
              pad[i] = 0;
            }
          }
          HMAC2.prototype.reset = function() {
            this.inner._restoreState(this.istate, this.inner.blockSize);
            this.outer._restoreState(this.ostate, this.outer.blockSize);
            return this;
          };
          HMAC2.prototype.clean = function() {
            for (var i = 0; i < this.istate.length; i++) {
              this.ostate[i] = this.istate[i] = 0;
            }
            this.inner.clean();
            this.outer.clean();
          };
          HMAC2.prototype.update = function(data) {
            this.inner.update(data);
            return this;
          };
          HMAC2.prototype.finish = function(out) {
            if (this.outer.finished) {
              this.outer.finish(out);
            } else {
              this.inner.finish(out);
              this.outer.update(out, this.digestLength).finish(out);
            }
            return this;
          };
          HMAC2.prototype.digest = function() {
            var out = new Uint8Array(this.digestLength);
            this.finish(out);
            return out;
          };
          return HMAC2;
        })()
      );
      exports.HMAC = HMAC;
      function hash(data) {
        var h = new Hash().update(data);
        var digest = h.digest();
        h.clean();
        return digest;
      }
      exports.hash = hash;
      exports["default"] = hash;
      function hmac(key, data) {
        var h = new HMAC(key).update(data);
        var digest = h.digest();
        h.clean();
        return digest;
      }
      exports.hmac = hmac;
      function fillBuffer(buffer, hmac2, info, counter) {
        var num = counter[0];
        if (num === 0) {
          throw new Error("hkdf: cannot expand more");
        }
        hmac2.reset();
        if (num > 1) {
          hmac2.update(buffer);
        }
        if (info) {
          hmac2.update(info);
        }
        hmac2.update(counter);
        hmac2.finish(buffer);
        counter[0]++;
      }
      var hkdfSalt = new Uint8Array(exports.digestLength);
      function hkdf(key, salt, info, length) {
        if (salt === void 0) {
          salt = hkdfSalt;
        }
        if (length === void 0) {
          length = 32;
        }
        var counter = new Uint8Array([1]);
        var okm = hmac(salt, key);
        var hmac_ = new HMAC(okm);
        var buffer = new Uint8Array(hmac_.digestLength);
        var bufpos = buffer.length;
        var out = new Uint8Array(length);
        for (var i = 0; i < length; i++) {
          if (bufpos === buffer.length) {
            fillBuffer(buffer, hmac_, info, counter);
            bufpos = 0;
          }
          out[i] = buffer[bufpos++];
        }
        hmac_.clean();
        buffer.fill(0);
        counter.fill(0);
        return out;
      }
      exports.hkdf = hkdf;
      function pbkdf2(password, salt, iterations, dkLen) {
        var prf = new HMAC(password);
        var len = prf.digestLength;
        var ctr = new Uint8Array(4);
        var t = new Uint8Array(len);
        var u = new Uint8Array(len);
        var dk = new Uint8Array(dkLen);
        for (var i = 0; i * len < dkLen; i++) {
          var c = i + 1;
          ctr[0] = c >>> 24 & 255;
          ctr[1] = c >>> 16 & 255;
          ctr[2] = c >>> 8 & 255;
          ctr[3] = c >>> 0 & 255;
          prf.reset();
          prf.update(salt);
          prf.update(ctr);
          prf.finish(u);
          for (var j = 0; j < len; j++) {
            t[j] = u[j];
          }
          for (var j = 2; j <= iterations; j++) {
            prf.reset();
            prf.update(u).finish(u);
            for (var k = 0; k < len; k++) {
              t[k] ^= u[k];
            }
          }
          for (var j = 0; j < len && i * len + j < dkLen; j++) {
            dk[i * len + j] = t[j];
          }
        }
        for (var i = 0; i < len; i++) {
          t[i] = u[i] = 0;
        }
        for (var i = 0; i < 4; i++) {
          ctr[i] = 0;
        }
        prf.clean();
        return dk;
      }
      exports.pbkdf2 = pbkdf2;
    });
  })(sha256$1);
  return sha256$1.exports;
}
var hasRequiredDist;
function requireDist() {
  if (hasRequiredDist) return dist;
  hasRequiredDist = 1;
  Object.defineProperty(dist, "__esModule", { value: true });
  dist.Webhook = dist.WebhookVerificationError = void 0;
  const timing_safe_equal_1 = requireTiming_safe_equal();
  const base642 = requireBase64();
  const sha2562 = requireSha256();
  const WEBHOOK_TOLERANCE_IN_SECONDS = 5 * 60;
  class ExtendableError extends Error {
    constructor(message) {
      super(message);
      Object.setPrototypeOf(this, ExtendableError.prototype);
      this.name = "ExtendableError";
      this.stack = new Error(message).stack;
    }
  }
  class WebhookVerificationError extends ExtendableError {
    constructor(message) {
      super(message);
      Object.setPrototypeOf(this, WebhookVerificationError.prototype);
      this.name = "WebhookVerificationError";
    }
  }
  dist.WebhookVerificationError = WebhookVerificationError;
  class Webhook {
    constructor(secret, options) {
      if (!secret) {
        throw new Error("Secret can't be empty.");
      }
      if ((options === null || options === void 0 ? void 0 : options.format) === "raw") {
        if (secret instanceof Uint8Array) {
          this.key = secret;
        } else {
          this.key = Uint8Array.from(secret, (c) => c.charCodeAt(0));
        }
      } else {
        if (typeof secret !== "string") {
          throw new Error("Expected secret to be of type string");
        }
        if (secret.startsWith(Webhook.prefix)) {
          secret = secret.substring(Webhook.prefix.length);
        }
        this.key = base642.decode(secret);
      }
    }
    verify(payload, headers_) {
      const headers = {};
      for (const key of Object.keys(headers_)) {
        headers[key.toLowerCase()] = headers_[key];
      }
      const msgId = headers["webhook-id"];
      const msgSignature = headers["webhook-signature"];
      const msgTimestamp = headers["webhook-timestamp"];
      if (!msgSignature || !msgId || !msgTimestamp) {
        throw new WebhookVerificationError("Missing required headers");
      }
      const timestamp = this.verifyTimestamp(msgTimestamp);
      const computedSignature = this.sign(msgId, timestamp, payload);
      const expectedSignature = computedSignature.split(",")[1];
      const passedSignatures = msgSignature.split(" ");
      const encoder = new globalThis.TextEncoder();
      for (const versionedSignature of passedSignatures) {
        const [version, signature] = versionedSignature.split(",");
        if (version !== "v1") {
          continue;
        }
        if ((0, timing_safe_equal_1.timingSafeEqual)(encoder.encode(signature), encoder.encode(expectedSignature))) {
          return JSON.parse(payload.toString());
        }
      }
      throw new WebhookVerificationError("No matching signature found");
    }
    sign(msgId, timestamp, payload) {
      if (typeof payload === "string") ;
      else if (payload.constructor.name === "Buffer") {
        payload = payload.toString();
      } else {
        throw new Error("Expected payload to be of type string or Buffer.");
      }
      const encoder = new TextEncoder();
      const timestampNumber = Math.floor(timestamp.getTime() / 1e3);
      const toSign = encoder.encode(`${msgId}.${timestampNumber}.${payload}`);
      const expectedSignature = base642.encode(sha2562.hmac(this.key, toSign));
      return `v1,${expectedSignature}`;
    }
    verifyTimestamp(timestampHeader) {
      const now = Math.floor(Date.now() / 1e3);
      const timestamp = parseInt(timestampHeader, 10);
      if (isNaN(timestamp)) {
        throw new WebhookVerificationError("Invalid Signature Headers");
      }
      if (now - timestamp > WEBHOOK_TOLERANCE_IN_SECONDS) {
        throw new WebhookVerificationError("Message timestamp too old");
      }
      if (timestamp > now + WEBHOOK_TOLERANCE_IN_SECONDS) {
        throw new WebhookVerificationError("Message timestamp too new");
      }
      return new Date(timestamp * 1e3);
    }
  }
  dist.Webhook = Webhook;
  Webhook.prefix = "whsec_";
  return dist;
}
var distExports = requireDist();
class Webhooks extends APIResource {
  constructor() {
    super(...arguments);
    this.headers = new Headers$1(this._client);
  }
  /**
   * List all webhooks
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const webhookDetails of client.webhooks.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/webhooks", CursorPagePagination, { query, ...options });
  }
  /**
   * Create a new webhook
   *
   * @example
   * ```ts
   * const webhookDetails = await client.webhooks.create({
   *   url: 'url',
   * });
   * ```
   */
  create(body, options) {
    return this._client.post("/webhooks", { body, ...options });
  }
  /**
   * Get a webhook by id
   *
   * @example
   * ```ts
   * const webhookDetails = await client.webhooks.retrieve(
   *   'whk_YdWqVEGKmSYKbsIyDxEab',
   * );
   * ```
   */
  retrieve(webhookID, options) {
    return this._client.get(path`/webhooks/${webhookID}`, options);
  }
  /**
   * Delete a webhook by id
   *
   * @example
   * ```ts
   * await client.webhooks.delete('whk_YdWqVEGKmSYKbsIyDxEab');
   * ```
   */
  delete(webhookID, options) {
    return this._client.delete(path`/webhooks/${webhookID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * Patch a webhook by id
   *
   * @example
   * ```ts
   * const webhookDetails = await client.webhooks.update(
   *   'whk_YdWqVEGKmSYKbsIyDxEab',
   * );
   * ```
   */
  update(webhookID, body, options) {
    return this._client.patch(path`/webhooks/${webhookID}`, { body, ...options });
  }
  /**
   * Get webhook secret by id
   *
   * @example
   * ```ts
   * const response = await client.webhooks.retrieveSecret(
   *   'whk_YdWqVEGKmSYKbsIyDxEab',
   * );
   * ```
   */
  retrieveSecret(webhookID, options) {
    return this._client.get(path`/webhooks/${webhookID}/secret`, options);
  }
  unwrap(body, { headers, key }) {
    if (headers !== void 0) {
      const keyStr = key === void 0 ? this._client.webhookKey : key;
      if (keyStr === null)
        throw new Error("Webhook key must not be null in order to unwrap");
      const wh = new distExports.Webhook(keyStr);
      wh.verify(body, headers);
    }
    return JSON.parse(body);
  }
  unsafeUnwrap(body) {
    return JSON.parse(body);
  }
}
Webhooks.Headers = Headers$1;
const readEnv = (env2) => {
  if (typeof globalThis.process !== "undefined") {
    return globalThis.process.env?.[env2]?.trim() || void 0;
  }
  if (typeof globalThis.Deno !== "undefined") {
    return globalThis.Deno.env?.get?.(env2)?.trim() || void 0;
  }
  return void 0;
};
var _DodoPayments_instances, _a, _DodoPayments_encoder, _DodoPayments_baseURLOverridden;
const environments = {
  live_mode: "https://live.dodopayments.com",
  test_mode: "https://test.dodopayments.com"
};
class DodoPayments {
  /**
   * API Client for interfacing with the Dodo Payments API.
   *
   * @param {string | undefined} [opts.bearerToken=process.env['DODO_PAYMENTS_API_KEY'] ?? undefined]
   * @param {string | null | undefined} [opts.webhookKey=process.env['DODO_PAYMENTS_WEBHOOK_KEY'] ?? null]
   * @param {Environment} [opts.environment=live_mode] - Specifies the environment URL to use for the API.
   * @param {string} [opts.baseURL=process.env['DODO_PAYMENTS_BASE_URL'] ?? https://live.dodopayments.com] - Override the default base URL for the API.
   * @param {number} [opts.timeout=1 minute] - The maximum amount of time (in milliseconds) the client will wait for a response before timing out.
   * @param {MergedRequestInit} [opts.fetchOptions] - Additional `RequestInit` options to be passed to `fetch` calls.
   * @param {Fetch} [opts.fetch] - Specify a custom `fetch` function implementation.
   * @param {number} [opts.maxRetries=2] - The maximum number of times the client will retry a request.
   * @param {HeadersLike} opts.defaultHeaders - Default headers to include with every request to the API.
   * @param {Record<string, string | undefined>} opts.defaultQuery - Default query parameters to include with every request to the API.
   */
  constructor({ baseURL = readEnv("DODO_PAYMENTS_BASE_URL"), bearerToken = readEnv("DODO_PAYMENTS_API_KEY"), webhookKey = readEnv("DODO_PAYMENTS_WEBHOOK_KEY") ?? null, ...opts } = {}) {
    _DodoPayments_instances.add(this);
    _DodoPayments_encoder.set(this, void 0);
    this.checkoutSessions = new CheckoutSessions(this);
    this.payments = new Payments2(this);
    this.subscriptions = new Subscriptions(this);
    this.invoices = new Invoices(this);
    this.licenses = new Licenses(this);
    this.licenseKeys = new LicenseKeys(this);
    this.licenseKeyInstances = new LicenseKeyInstances(this);
    this.customers = new Customers(this);
    this.refunds = new Refunds(this);
    this.disputes = new Disputes(this);
    this.payouts = new Payouts(this);
    this.products = new Products(this);
    this.misc = new Misc(this);
    this.discounts = new Discounts(this);
    this.addons = new Addons(this);
    this.brands = new Brands(this);
    this.webhooks = new Webhooks(this);
    this.webhookEvents = new WebhookEvents(this);
    this.usageEvents = new UsageEvents(this);
    this.meters = new Meters(this);
    this.balances = new Balances$1(this);
    this.creditEntitlements = new CreditEntitlements(this);
    this.entitlements = new Entitlements(this);
    this.productCollections = new ProductCollections(this);
    if (bearerToken === void 0) {
      throw new DodoPaymentsError("The DODO_PAYMENTS_API_KEY environment variable is missing or empty; either provide it, or instantiate the DodoPayments client with an bearerToken option, like new DodoPayments({ bearerToken: 'My Bearer Token' }).");
    }
    const options = {
      bearerToken,
      webhookKey,
      ...opts,
      baseURL,
      environment: opts.environment ?? "live_mode"
    };
    if (baseURL && opts.environment) {
      throw new DodoPaymentsError("Ambiguous URL; The `baseURL` option (or DODO_PAYMENTS_BASE_URL env var) and the `environment` option are given. If you want to use the environment you must pass baseURL: null");
    }
    this.baseURL = options.baseURL || environments[options.environment || "live_mode"];
    this.timeout = options.timeout ?? _a.DEFAULT_TIMEOUT;
    this.logger = options.logger ?? console;
    const defaultLogLevel = "warn";
    this.logLevel = defaultLogLevel;
    this.logLevel = parseLogLevel(options.logLevel, "ClientOptions.logLevel", this) ?? parseLogLevel(readEnv("DODO_PAYMENTS_LOG"), "process.env['DODO_PAYMENTS_LOG']", this) ?? defaultLogLevel;
    this.fetchOptions = options.fetchOptions;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetch = options.fetch ?? getDefaultFetch();
    __classPrivateFieldSet(this, _DodoPayments_encoder, FallbackEncoder);
    const customHeadersEnv = readEnv("DODO_PAYMENTS_CUSTOM_HEADERS");
    if (customHeadersEnv) {
      const parsed = {};
      for (const line of customHeadersEnv.split("\n")) {
        const colon = line.indexOf(":");
        if (colon >= 0) {
          parsed[line.substring(0, colon).trim()] = line.substring(colon + 1).trim();
        }
      }
      options.defaultHeaders = { ...parsed, ...options.defaultHeaders };
    }
    this._options = options;
    this.bearerToken = bearerToken;
    this.webhookKey = webhookKey;
  }
  /**
   * Create a new client instance re-using the same options given to the current client with optional overriding.
   */
  withOptions(options) {
    const client = new this.constructor({
      ...this._options,
      environment: options.environment ? options.environment : void 0,
      baseURL: options.environment ? void 0 : this.baseURL,
      maxRetries: this.maxRetries,
      timeout: this.timeout,
      logger: this.logger,
      logLevel: this.logLevel,
      fetch: this.fetch,
      fetchOptions: this.fetchOptions,
      bearerToken: this.bearerToken,
      webhookKey: this.webhookKey,
      ...options
    });
    return client;
  }
  defaultQuery() {
    return this._options.defaultQuery;
  }
  validateHeaders({ values, nulls }) {
    return;
  }
  async authHeaders(opts) {
    return buildHeaders([{ Authorization: `Bearer ${this.bearerToken}` }]);
  }
  /**
   * Basic re-implementation of `qs.stringify` for primitive types.
   */
  stringifyQuery(query) {
    return stringifyQuery(query);
  }
  getUserAgent() {
    return `${this.constructor.name}/JS ${VERSION}`;
  }
  defaultIdempotencyKey() {
    return `stainless-node-retry-${uuid4()}`;
  }
  makeStatusError(status, error, message, headers) {
    return APIError.generate(status, error, message, headers);
  }
  buildURL(path2, query, defaultBaseURL) {
    const baseURL = !__classPrivateFieldGet(this, _DodoPayments_instances, "m", _DodoPayments_baseURLOverridden).call(this) && defaultBaseURL || this.baseURL;
    const url = isAbsoluteURL(path2) ? new URL(path2) : new URL(baseURL + (baseURL.endsWith("/") && path2.startsWith("/") ? path2.slice(1) : path2));
    const defaultQuery = this.defaultQuery();
    const pathQuery = Object.fromEntries(url.searchParams);
    if (!isEmptyObj(defaultQuery) || !isEmptyObj(pathQuery)) {
      query = { ...pathQuery, ...defaultQuery, ...query };
    }
    if (typeof query === "object" && query && !Array.isArray(query)) {
      url.search = this.stringifyQuery(query);
    }
    return url.toString();
  }
  /**
   * Used as a callback for mutating the given `FinalRequestOptions` object.
   */
  async prepareOptions(options) {
  }
  /**
   * Used as a callback for mutating the given `RequestInit` object.
   *
   * This is useful for cases where you want to add certain headers based off of
   * the request properties, e.g. `method` or `url`.
   */
  async prepareRequest(request, { url, options }) {
  }
  get(path2, opts) {
    return this.methodRequest("get", path2, opts);
  }
  post(path2, opts) {
    return this.methodRequest("post", path2, opts);
  }
  patch(path2, opts) {
    return this.methodRequest("patch", path2, opts);
  }
  put(path2, opts) {
    return this.methodRequest("put", path2, opts);
  }
  delete(path2, opts) {
    return this.methodRequest("delete", path2, opts);
  }
  methodRequest(method, path2, opts) {
    return this.request(Promise.resolve(opts).then((opts2) => {
      return { method, path: path2, ...opts2 };
    }));
  }
  request(options, remainingRetries = null) {
    return new APIPromise(this, this.makeRequest(options, remainingRetries, void 0));
  }
  async makeRequest(optionsInput, retriesRemaining, retryOfRequestLogID) {
    const options = await optionsInput;
    const maxRetries = options.maxRetries ?? this.maxRetries;
    if (retriesRemaining == null) {
      retriesRemaining = maxRetries;
    }
    await this.prepareOptions(options);
    const { req, url, timeout } = await this.buildRequest(options, {
      retryCount: maxRetries - retriesRemaining
    });
    await this.prepareRequest(req, { url, options });
    const requestLogID = "log_" + (Math.random() * (1 << 24) | 0).toString(16).padStart(6, "0");
    const retryLogStr = retryOfRequestLogID === void 0 ? "" : `, retryOf: ${retryOfRequestLogID}`;
    const startTime = Date.now();
    loggerFor(this).debug(`[${requestLogID}] sending request`, formatRequestDetails({
      retryOfRequestLogID,
      method: options.method,
      url,
      options,
      headers: req.headers
    }));
    if (options.signal?.aborted) {
      throw new APIUserAbortError();
    }
    const controller = new AbortController();
    const response = await this.fetchWithTimeout(url, req, timeout, controller).catch(castToError);
    const headersTime = Date.now();
    if (response instanceof globalThis.Error) {
      const retryMessage = `retrying, ${retriesRemaining} attempts remaining`;
      if (options.signal?.aborted) {
        throw new APIUserAbortError();
      }
      const isTimeout = isAbortError(response) || /timed? ?out/i.test(String(response) + ("cause" in response ? String(response.cause) : ""));
      if (retriesRemaining) {
        loggerFor(this).info(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - ${retryMessage}`);
        loggerFor(this).debug(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (${retryMessage})`, formatRequestDetails({
          retryOfRequestLogID,
          url,
          durationMs: headersTime - startTime,
          message: response.message
        }));
        return this.retryRequest(options, retriesRemaining, retryOfRequestLogID ?? requestLogID);
      }
      loggerFor(this).info(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - error; no more retries left`);
      loggerFor(this).debug(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (error; no more retries left)`, formatRequestDetails({
        retryOfRequestLogID,
        url,
        durationMs: headersTime - startTime,
        message: response.message
      }));
      if (isTimeout) {
        throw new APIConnectionTimeoutError();
      }
      throw new APIConnectionError({ cause: response });
    }
    const responseInfo = `[${requestLogID}${retryLogStr}] ${req.method} ${url} ${response.ok ? "succeeded" : "failed"} with status ${response.status} in ${headersTime - startTime}ms`;
    if (!response.ok) {
      const shouldRetry = await this.shouldRetry(response);
      if (retriesRemaining && shouldRetry) {
        const retryMessage2 = `retrying, ${retriesRemaining} attempts remaining`;
        await CancelReadableStream(response.body);
        loggerFor(this).info(`${responseInfo} - ${retryMessage2}`);
        loggerFor(this).debug(`[${requestLogID}] response error (${retryMessage2})`, formatRequestDetails({
          retryOfRequestLogID,
          url: response.url,
          status: response.status,
          headers: response.headers,
          durationMs: headersTime - startTime
        }));
        return this.retryRequest(options, retriesRemaining, retryOfRequestLogID ?? requestLogID, response.headers);
      }
      const retryMessage = shouldRetry ? `error; no more retries left` : `error; not retryable`;
      loggerFor(this).info(`${responseInfo} - ${retryMessage}`);
      const errText = await response.text().catch((err2) => castToError(err2).message);
      const errJSON = safeJSON(errText);
      const errMessage = errJSON ? void 0 : errText;
      loggerFor(this).debug(`[${requestLogID}] response error (${retryMessage})`, formatRequestDetails({
        retryOfRequestLogID,
        url: response.url,
        status: response.status,
        headers: response.headers,
        message: errMessage,
        durationMs: Date.now() - startTime
      }));
      const err = this.makeStatusError(response.status, errJSON, errMessage, response.headers);
      throw err;
    }
    loggerFor(this).info(responseInfo);
    loggerFor(this).debug(`[${requestLogID}] response start`, formatRequestDetails({
      retryOfRequestLogID,
      url: response.url,
      status: response.status,
      headers: response.headers,
      durationMs: headersTime - startTime
    }));
    return { response, options, controller, requestLogID, retryOfRequestLogID, startTime };
  }
  getAPIList(path2, Page, opts) {
    return this.requestAPIList(Page, opts && "then" in opts ? opts.then((opts2) => ({ method: "get", path: path2, ...opts2 })) : { method: "get", path: path2, ...opts });
  }
  requestAPIList(Page, options) {
    const request = this.makeRequest(options, null, void 0);
    return new PagePromise(this, request, Page);
  }
  async fetchWithTimeout(url, init, ms, controller) {
    const { signal, method, ...options } = init || {};
    const abort = this._makeAbort(controller);
    if (signal)
      signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, ms);
    const isReadableBody = globalThis.ReadableStream && options.body instanceof globalThis.ReadableStream || typeof options.body === "object" && options.body !== null && Symbol.asyncIterator in options.body;
    const fetchOptions = {
      signal: controller.signal,
      ...isReadableBody ? { duplex: "half" } : {},
      method: "GET",
      ...options
    };
    if (method) {
      fetchOptions.method = method.toUpperCase();
    }
    try {
      return await this.fetch.call(void 0, url, fetchOptions);
    } finally {
      clearTimeout(timeout);
    }
  }
  async shouldRetry(response) {
    const shouldRetryHeader = response.headers.get("x-should-retry");
    if (shouldRetryHeader === "true")
      return true;
    if (shouldRetryHeader === "false")
      return false;
    if (response.status === 408)
      return true;
    if (response.status === 409)
      return true;
    if (response.status === 429)
      return true;
    if (response.status >= 500)
      return true;
    return false;
  }
  async retryRequest(options, retriesRemaining, requestLogID, responseHeaders) {
    let timeoutMillis;
    const retryAfterMillisHeader = responseHeaders?.get("retry-after-ms");
    if (retryAfterMillisHeader) {
      const timeoutMs = parseFloat(retryAfterMillisHeader);
      if (!Number.isNaN(timeoutMs)) {
        timeoutMillis = timeoutMs;
      }
    }
    const retryAfterHeader = responseHeaders?.get("retry-after");
    if (retryAfterHeader && !timeoutMillis) {
      const timeoutSeconds = parseFloat(retryAfterHeader);
      if (!Number.isNaN(timeoutSeconds)) {
        timeoutMillis = timeoutSeconds * 1e3;
      } else {
        timeoutMillis = Date.parse(retryAfterHeader) - Date.now();
      }
    }
    if (timeoutMillis === void 0) {
      const maxRetries = options.maxRetries ?? this.maxRetries;
      timeoutMillis = this.calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries);
    }
    await sleep(timeoutMillis);
    return this.makeRequest(options, retriesRemaining - 1, requestLogID);
  }
  calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries) {
    const initialRetryDelay = 0.5;
    const maxRetryDelay = 8;
    const numRetries = maxRetries - retriesRemaining;
    const sleepSeconds = Math.min(initialRetryDelay * Math.pow(2, numRetries), maxRetryDelay);
    const jitter = 1 - Math.random() * 0.25;
    return sleepSeconds * jitter * 1e3;
  }
  async buildRequest(inputOptions, { retryCount = 0 } = {}) {
    const options = { ...inputOptions };
    const { method, path: path2, query, defaultBaseURL } = options;
    const url = this.buildURL(path2, query, defaultBaseURL);
    if ("timeout" in options)
      validatePositiveInteger("timeout", options.timeout);
    options.timeout = options.timeout ?? this.timeout;
    const { bodyHeaders, body } = this.buildBody({ options });
    const reqHeaders = await this.buildHeaders({ options: inputOptions, method, bodyHeaders, retryCount });
    const req = {
      method,
      headers: reqHeaders,
      ...options.signal && { signal: options.signal },
      ...globalThis.ReadableStream && body instanceof globalThis.ReadableStream && { duplex: "half" },
      ...body && { body },
      ...this.fetchOptions ?? {},
      ...options.fetchOptions ?? {}
    };
    return { req, url, timeout: options.timeout };
  }
  async buildHeaders({ options, method, bodyHeaders, retryCount }) {
    let idempotencyHeaders = {};
    if (this.idempotencyHeader && method !== "get") {
      if (!options.idempotencyKey)
        options.idempotencyKey = this.defaultIdempotencyKey();
      idempotencyHeaders[this.idempotencyHeader] = options.idempotencyKey;
    }
    const headers = buildHeaders([
      idempotencyHeaders,
      {
        Accept: "application/json",
        "User-Agent": this.getUserAgent(),
        "X-Stainless-Retry-Count": String(retryCount),
        ...options.timeout ? { "X-Stainless-Timeout": String(Math.trunc(options.timeout / 1e3)) } : {},
        ...getPlatformHeaders()
      },
      await this.authHeaders(options),
      this._options.defaultHeaders,
      bodyHeaders,
      options.headers
    ]);
    this.validateHeaders(headers);
    return headers.values;
  }
  _makeAbort(controller) {
    return () => controller.abort();
  }
  buildBody({ options: { body, headers: rawHeaders } }) {
    if (!body) {
      return { bodyHeaders: void 0, body: void 0 };
    }
    const headers = buildHeaders([rawHeaders]);
    if (
      // Pass raw type verbatim
      ArrayBuffer.isView(body) || body instanceof ArrayBuffer || body instanceof DataView || typeof body === "string" && // Preserve legacy string encoding behavior for now
      headers.values.has("content-type") || // `Blob` is superset of `File`
      globalThis.Blob && body instanceof globalThis.Blob || // `FormData` -> `multipart/form-data`
      body instanceof FormData || // `URLSearchParams` -> `application/x-www-form-urlencoded`
      body instanceof URLSearchParams || // Send chunked stream (each chunk has own `length`)
      globalThis.ReadableStream && body instanceof globalThis.ReadableStream
    ) {
      return { bodyHeaders: void 0, body };
    } else if (typeof body === "object" && (Symbol.asyncIterator in body || Symbol.iterator in body && "next" in body && typeof body.next === "function")) {
      return { bodyHeaders: void 0, body: ReadableStreamFrom(body) };
    } else if (typeof body === "object" && headers.values.get("content-type") === "application/x-www-form-urlencoded") {
      return {
        bodyHeaders: { "content-type": "application/x-www-form-urlencoded" },
        body: this.stringifyQuery(body)
      };
    } else {
      return __classPrivateFieldGet(this, _DodoPayments_encoder, "f").call(this, { body, headers });
    }
  }
}
_a = DodoPayments, _DodoPayments_encoder = /* @__PURE__ */ new WeakMap(), _DodoPayments_instances = /* @__PURE__ */ new WeakSet(), _DodoPayments_baseURLOverridden = function _DodoPayments_baseURLOverridden2() {
  return this.baseURL !== environments[this._options.environment || "live_mode"];
};
DodoPayments.DodoPayments = _a;
DodoPayments.DEFAULT_TIMEOUT = 6e4;
DodoPayments.DodoPaymentsError = DodoPaymentsError;
DodoPayments.APIError = APIError;
DodoPayments.APIConnectionError = APIConnectionError;
DodoPayments.APIConnectionTimeoutError = APIConnectionTimeoutError;
DodoPayments.APIUserAbortError = APIUserAbortError;
DodoPayments.NotFoundError = NotFoundError;
DodoPayments.ConflictError = ConflictError;
DodoPayments.RateLimitError = RateLimitError;
DodoPayments.BadRequestError = BadRequestError;
DodoPayments.AuthenticationError = AuthenticationError;
DodoPayments.InternalServerError = InternalServerError;
DodoPayments.PermissionDeniedError = PermissionDeniedError;
DodoPayments.UnprocessableEntityError = UnprocessableEntityError;
DodoPayments.toFile = toFile;
DodoPayments.CheckoutSessions = CheckoutSessions;
DodoPayments.Payments = Payments2;
DodoPayments.Subscriptions = Subscriptions;
DodoPayments.Invoices = Invoices;
DodoPayments.Licenses = Licenses;
DodoPayments.LicenseKeys = LicenseKeys;
DodoPayments.LicenseKeyInstances = LicenseKeyInstances;
DodoPayments.Customers = Customers;
DodoPayments.Refunds = Refunds;
DodoPayments.Disputes = Disputes;
DodoPayments.Payouts = Payouts;
DodoPayments.Products = Products;
DodoPayments.Misc = Misc;
DodoPayments.Discounts = Discounts;
DodoPayments.Addons = Addons;
DodoPayments.Brands = Brands;
DodoPayments.Webhooks = Webhooks;
DodoPayments.WebhookEvents = WebhookEvents;
DodoPayments.UsageEvents = UsageEvents;
DodoPayments.Meters = Meters;
DodoPayments.Balances = Balances$1;
DodoPayments.CreditEntitlements = CreditEntitlements;
DodoPayments.Entitlements = Entitlements;
DodoPayments.ProductCollections = ProductCollections;
const prerender = false;
function decryptFirestoreValue(val, mek) {
  if (!val) return "";
  if (!val.startsWith("enc:v1:")) return val;
  try {
    const salt = Buffer.alloc(16);
    const key = nodeCrypto.pbkdf2Sync(mek, salt, 1e5, 32, "sha256");
    const hex = val.slice(7);
    const combined = Buffer.from(hex, "hex");
    const iv = combined.subarray(0, 12);
    const ciphertextAndTag = combined.subarray(12);
    const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);
    const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);
    const decipher = nodeCrypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, "binary", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("❌ Failed to decrypt Firestore value:", err.message);
    return "";
  }
}
async function getGoogleAuthToken(serviceAccount) {
  const iat = Math.floor(Date.now() / 1e3);
  const exp = iat + 3600;
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/datastore",
    iat,
    exp
  };
  const base64UrlEncode = (str) => btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = serviceAccount.private_key.replace(/\\n/g, "\n").replace(pemHeader, "").replace(pemFooter, "").replace(/\s/g, "");
  const binaryKey = atob(pemContents);
  const keyBuffer = new Uint8Array(binaryKey.length);
  for (let i = 0; i < binaryKey.length; i++) {
    keyBuffer[i] = binaryKey.charCodeAt(i);
  }
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(unsignedToken)
  );
  const signedToken = `${unsignedToken}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedToken}`
  });
  if (!res.ok) {
    throw new Error(`Google Auth exchange failed: ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}
const POST = async ({ request }) => {
  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);
    let dodoWebhookSecret = env.DODO_WEBHOOK_KEY || void 0;
    const serviceAccountStr = env.FIREBASE_SERVICE_ACCOUNT || void 0;
    const encryptionKey = env.ENCRYPTION_KEY || void 0 || "";
    if (!serviceAccountStr) {
      console.error("Missing FIREBASE_SERVICE_ACCOUNT environment variable.");
      return new Response("Server configuration error", { status: 500 });
    }
    const serviceAccount = JSON.parse(serviceAccountStr);
    const projectId = serviceAccount.project_id || "takeout-fix";
    const token = await getGoogleAuthToken(serviceAccount);
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
    let dodoHost = "live.dodopayments.com";
    let isTestMode = false;
    try {
      const globalUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/global`;
      const globalRes = await fetch(globalUrl, { headers });
      if (globalRes.ok) {
        const globalData = await globalRes.json();
        dodoHost = globalData.fields?.dodo_host?.stringValue || "live.dodopayments.com";
        isTestMode = globalData.fields?.dodo_test_mode?.booleanValue === true;
      }
    } catch (err) {
      console.warn("Failed to fetch settings/global in webhook:", err.message);
    }
    const envMode = isTestMode ? "test" : "live";
    if (!dodoWebhookSecret && encryptionKey) {
      try {
        console.log("DODO_WEBHOOK_KEY not set in env. Attempting backup Firestore secure fetch...");
        const secureUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/secure`;
        const secureRes = await fetch(secureUrl, { headers });
        if (secureRes.ok) {
          const secureData = await secureRes.json();
          const encryptedSecret = secureData.fields?.dodo_webhook_key?.stringValue || "";
          if (encryptedSecret) {
            dodoWebhookSecret = decryptFirestoreValue(encryptedSecret, encryptionKey);
            console.log("Successfully retrieved and decrypted Dodo Webhook Secret from Firestore!");
          }
        }
      } catch (err) {
        console.error("Backup webhook secret retrieval failed:", err.message);
      }
    }
    if (!dodoWebhookSecret || dodoWebhookSecret === "dodo-webhook-secret-placeholder") {
      console.error("❌ Dodo Webhook Secret is unconfigured. Rejecting unverified webhook event.");
      return new Response("Webhook secret unconfigured", { status: 500 });
    }
    const webhookHeaders = {
      "webhook-id": request.headers.get("webhook-id") || "",
      "webhook-signature": request.headers.get("webhook-signature") || "",
      "webhook-timestamp": request.headers.get("webhook-timestamp") || ""
    };
    try {
      const dodoPaymentsClient = new DodoPayments({
        bearerToken: "dummy_key",
        webhookKey: dodoWebhookSecret
      });
      dodoPaymentsClient.webhooks.unwrap(rawBody, { headers: webhookHeaders });
      console.log("✅ Webhook signature verified using official SDK");
    } catch (error) {
      console.error("❌ Webhook verification failed using official SDK:", error);
      return new Response("Invalid signature", { status: 401 });
    }
    const { type, data } = payload;
    if (!type || !data) {
      return new Response("Missing type or data", { status: 400 });
    }
    console.log(`Processing Dodo webhook event on Cloudflare: ${type}`);
    if (type === "payment.succeeded" || type === "payment.failed" || type === "payment.cancelled" || type === "payment.processing") {
      const userId = data.metadata?.userId || data.metadata?.userid || data.metadata?.metadata_userId;
      const plan = data.metadata?.plan || data.metadata?.plankey || data.metadata?.metadata_plan;
      const regionCode = data.metadata?.region || data.metadata?.metadata_region || "t3";
      if (!userId || !plan) {
        console.error("Missing userId or plan in metadata:", data.metadata);
        return new Response("Missing metadata", { status: 400 });
      }
      const timestamp = Date.now();
      const txId = data.payment_id || `TXN-DODO-${timestamp}`;
      const userEmail = data.customer?.email || "";
      const amount = data.total_amount || 0;
      const currency = data.currency || "USD";
      let txStatus = "failed";
      if (type === "payment.succeeded") txStatus = "succeeded";
      else if (type === "payment.cancelled") txStatus = "cancelled";
      else if (type === "payment.processing") txStatus = "processing";
      const txUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/transactions?documentId=${txId}`;
      const txBody = {
        fields: {
          txId: { stringValue: txId },
          uid: { stringValue: userId },
          email: { stringValue: userEmail },
          displayName: { stringValue: userEmail.split("@")[0] || "Dodo Customer" },
          plan: { stringValue: plan },
          amount: { integerValue: String(amount) },
          currency: { stringValue: currency },
          displayAmount: { stringValue: `${currency === "INR" ? "₹" : "$"}${amount}` },
          status: { stringValue: txStatus },
          timestamp: { integerValue: String(timestamp) },
          paymentMethod: { stringValue: "Dodo Payments" },
          envMode: { stringValue: envMode }
        }
      };
      const txRes = await fetch(txUrl, { method: "POST", headers, body: JSON.stringify(txBody) });
      if (!txRes.ok) console.warn("Failed to create transaction log:", await txRes.text());
      if (type === "payment.succeeded") {
        const userUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}?updateMask.fieldPaths=plan&updateMask.fieldPaths=usedBytes&updateMask.fieldPaths=usedFiles&updateMask.fieldPaths=updatedAt`;
        const userBody = {
          fields: {
            plan: { stringValue: plan },
            usedBytes: { integerValue: "0" },
            usedFiles: { integerValue: "0" },
            updatedAt: { integerValue: String(timestamp) }
          }
        };
        const userRes = await fetch(userUrl, { method: "PATCH", headers, body: JSON.stringify(userBody) });
        if (!userRes.ok) {
          console.error("Failed to update user plan:", await userRes.text());
          return new Response("Database update failed", { status: 500 });
        }
        let activeCampaignId = null;
        try {
          const runQueryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
          const campaignQueryBody = {
            structuredQuery: {
              from: [{ collectionId: "campaigns" }],
              where: {
                compositeFilter: {
                  op: "AND",
                  filters: [
                    {
                      fieldFilter: {
                        field: { fieldPath: "isEnabled" },
                        op: "EQUAL",
                        value: { booleanValue: true }
                      }
                    },
                    {
                      fieldFilter: {
                        field: { fieldPath: "status" },
                        op: "EQUAL",
                        value: { stringValue: "ACTIVE" }
                      }
                    }
                  ]
                }
              },
              limit: 1
            }
          };
          const campRes = await fetch(runQueryUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(campaignQueryBody)
          });
          if (campRes.ok) {
            const campResults = await campRes.json();
            if (Array.isArray(campResults) && campResults.length > 0 && campResults[0].document) {
              const doc = campResults[0].document;
              const parts = doc.name.split("/");
              activeCampaignId = parts[parts.length - 1];
              const activeCampaignData = doc.fields;
              const currentCount = parseInt(activeCampaignData.currentPurchaseCount?.integerValue || "0") + 1;
              const maxLimit = activeCampaignData.maxPurchaseLimit?.integerValue ? parseInt(activeCampaignData.maxPurchaseLimit.integerValue) : null;
              const updateFields = {
                currentPurchaseCount: { integerValue: String(currentCount) }
              };
              let updateMask = "updateMask.fieldPaths=currentPurchaseCount";
              if (maxLimit !== null && currentCount >= maxLimit) {
                updateFields.status = { stringValue: "EXPIRED" };
                updateFields.isEnabled = { booleanValue: false };
                updateMask += "&updateMask.fieldPaths=status&updateMask.fieldPaths=isEnabled";
                console.log(`Campaign ${activeCampaignId} auto-expired at limit ${maxLimit}`);
              }
              const updateUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/campaigns/${activeCampaignId}?${updateMask}`;
              const updateRes = await fetch(updateUrl, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ fields: updateFields })
              });
              if (!updateRes.ok) console.warn("Failed to update campaign purchase count:", await updateRes.text());
              else console.log(`Campaign ${activeCampaignId} purchase count incremented to ${currentCount}.`);
            }
          }
        } catch (campErr) {
          console.error("Campaign update error in webhook:", campErr.message);
        }
        const discountCode = String(data.discount_code || data.coupon_code || "").toUpperCase();
        let matchedCouponId = null;
        if (discountCode) {
          try {
            const runQueryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
            const couponQueryBody = {
              structuredQuery: {
                from: [{ collectionId: "coupons" }],
                where: {
                  fieldFilter: {
                    field: { fieldPath: "couponCode" },
                    op: "EQUAL",
                    value: { stringValue: discountCode }
                  }
                },
                limit: 1
              }
            };
            const coupRes = await fetch(runQueryUrl, {
              method: "POST",
              headers,
              body: JSON.stringify(couponQueryBody)
            });
            if (coupRes.ok) {
              const coupResults = await coupRes.json();
              if (Array.isArray(coupResults) && coupResults.length > 0 && coupResults[0].document) {
                const doc = coupResults[0].document;
                const parts = doc.name.split("/");
                matchedCouponId = parts[parts.length - 1];
                const couponData = doc.fields;
                const currentUsed = parseInt(couponData.usedCount?.integerValue || "0") + 1;
                const updateUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/coupons/${matchedCouponId}?updateMask.fieldPaths=usedCount&updateMask.fieldPaths=updatedAt`;
                const updateBody = {
                  fields: {
                    usedCount: { integerValue: String(currentUsed) },
                    updatedAt: { integerValue: String(timestamp) }
                  }
                };
                const updateRes = await fetch(updateUrl, {
                  method: "PATCH",
                  headers,
                  body: JSON.stringify(updateBody)
                });
                if (!updateRes.ok) console.warn("Failed to update coupon usage:", await updateRes.text());
                else console.log(`Coupon ${discountCode} usedCount incremented to ${currentUsed}.`);
              }
            }
          } catch (coupErr) {
            console.error("Coupon update error in webhook:", coupErr.message);
          }
        }
        const logUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/purchase_logs`;
        const logBody = {
          fields: {
            campaignId: activeCampaignId ? { stringValue: activeCampaignId } : { nullValue: null },
            couponId: matchedCouponId ? { stringValue: matchedCouponId } : { nullValue: null },
            couponCode: discountCode ? { stringValue: discountCode } : { nullValue: null },
            productId: data.product_id ? { stringValue: data.product_id } : { nullValue: null },
            customerEmail: { stringValue: userEmail },
            userId: { stringValue: userId },
            plan: { stringValue: plan },
            regionCode: { stringValue: regionCode },
            amount: { integerValue: String(amount) },
            currency: { stringValue: currency },
            purchasedAt: { integerValue: String(timestamp) },
            dodoPaymentId: { stringValue: txId }
          }
        };
        const activityUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/admin_activity`;
        const activityBody = {
          fields: {
            actorUid: { stringValue: userId },
            actorName: { stringValue: userEmail || "Dodo Customer" },
            actorRole: { stringValue: "USER" },
            action: { stringValue: "PURCHASE" },
            target: { stringValue: plan },
            description: { stringValue: `Purchased ${plan} via Dodo Payments for ${currency} ${amount}${discountCode ? ` using coupon ${discountCode}` : ""}` },
            timestamp: { integerValue: String(timestamp) }
          }
        };
        const [logRes, activityRes] = await Promise.all([
          fetch(logUrl, { method: "POST", headers, body: JSON.stringify(logBody) }),
          fetch(activityUrl, { method: "POST", headers, body: JSON.stringify(activityBody) })
        ]);
        if (!logRes.ok) console.warn("Failed to write purchase log:", await logRes.text());
        if (!activityRes.ok) console.warn("Failed to write admin activity log:", await activityRes.text());
        console.log(`Successfully completed payment webhook upgrade on Cloudflare for user ${userId} to plan ${plan}`);
      } else {
        console.log(`Logged non-success payment transaction status: ${txStatus} for user ${userId}`);
      }
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("Webhook processing error in Astro endpoint:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  POST,
  prerender
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page
};
