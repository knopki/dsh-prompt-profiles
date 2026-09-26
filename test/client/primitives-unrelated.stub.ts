/**
 * Inert stand-in for the eager imports of the primitives barrel that the atoms
 * under test never touch: the markdown pipeline, the syntax highlighter, the
 * diff/ansi renderers and the brand-icon set. The barrel imports them at module
 * scope (and builds its highlighter there), so the ids must resolve and the
 * module-scope calls must return something; nothing in the tests ever reads a
 * real value out of them.
 *
 * The atoms the client UI actually uses (Button, Menu, Tooltip, Modal, Toast,
 * Input, Tag, SegmentedTabs, Checkbox and the icons) are the REAL installed
 * primitives, and `clsx`, `@deepseek-ai/dsh-client-store` and
 * `@deepseek-ai/dsh-util-workspace-path` are installed for real.
 *
 * The named exports below mirror the barrel's own import list one-for-one; a
 * new import there shows up here as an undefined named export and a loud
 * TypeError, never as a silent stub.
 */
// biome-ignore lint/suspicious/noExplicitAny: the stub answers any property and must stay callable/constructible.
const inert: any = new Proxy(function inertStub() {}, {
  get: () => inert,
  apply: () => inert,
  construct: () => ({}),
});

export default inert;

// shiki/core, shiki/engine/javascript
export const createCssVariablesTheme = inert;
export const createHighlighterCoreSync = inert;
export const createJavaScriptRegexEngine = inert;
export const defaultJavaScriptRegexConstructor = inert;

// @deepseek-ai/dsh-util-code-language
export const CODE_HIGHLIGHT_EXTENSIONS = inert;
export const languageForPath = inert;

// diff
export const structuredPatch = inert;

// mdast-*/micromark-*
export const fromMarkdown = inert;
export const gfmFromMarkdown = inert;
export const mathFromMarkdown = inert;
export const gfm = inert;
export const math = inert;
export const attention = inert;
export const markdownLineEnding = inert;
export const unicodePunctuation = inert;
export const classifyCharacter = inert;
// The barrel uses these as COMPUTED KEY parts at module scope, so they must be
// primitive-convertible strings rather than the inert callable.
// biome-ignore lint/suspicious/noExplicitAny: computed-key stand-in, read as a primitive string.
const symbolMap: any = new Proxy(
  {},
  {
    get: (_target, prop) => {
      if (prop === Symbol.toPrimitive) return () => "stub";
      return typeof prop === "symbol" ? undefined : `stub:${prop}`;
    },
  },
);
export const codes = symbolMap;
export const constants = symbolMap;
export const types = symbolMap;
export const factorySpace = inert;
export const normalizeUri = inert;

// simple-icons
export const siAliexpress = inert;
export const siApple = inert;
export const siBaidu = inert;
export const siBilibili = inert;
export const siCsdn = inert;
export const siDuckduckgo = inert;
export const siEbay = inert;
export const siFacebook = inert;
export const siGithub = inert;
export const siGitlab = inert;
export const siGoogle = inert;
export const siInstagram = inert;
export const siJuejin = inert;
export const siMdnwebdocs = inert;
export const siNetflix = inert;
export const siNpm = inert;
export const siPypi = inert;
export const siQq = inert;
export const siQuora = inert;
export const siReddit = inert;
export const siSinaweibo = inert;
export const siSpotify = inert;
export const siStackoverflow = inert;
export const siTaobao = inert;
export const siTelegram = inert;
export const siTiktok = inert;
export const siV2ex = inert;
export const siWechat = inert;
export const siWhatsapp = inert;
export const siWikipedia = inert;
export const siX = inert;
export const siYcombinator = inert;
export const siYoutube = inert;
export const siZhihu = inert;
