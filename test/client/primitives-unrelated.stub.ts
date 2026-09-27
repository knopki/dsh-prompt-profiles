/**
 * #region moduleContract
 * @modulecontract
 * @purpose Stand in for the eager barrel imports the atoms under test never
 *   touch (markdown, highlighter, diff/ansi, brand icons): the ids must
 *   resolve and module-scope calls must return something, while the atoms the
 *   UI actually uses stay the REAL installed primitives.
 * @invariants The named exports mirror the barrel's own import list
 *   one-for-one; a new import there fails loud here, never silent.
 * #endregion moduleContract
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
