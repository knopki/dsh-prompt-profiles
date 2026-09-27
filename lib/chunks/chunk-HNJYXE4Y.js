import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  createOperations,
  defaultSetInput,
  lastInput,
  okResult,
  previewInput,
  previewResult,
  profileCreateInput,
  profileCreateResult,
  profileDeleteInput,
  profileDeleteResult,
  profileUpdateInput,
  profileUpdateResult,
  sectionCreateInput,
  sectionCreateResult,
  sectionDeleteInput,
  sectionDeleteResult,
  sectionRenameInput,
  sectionRenameResult,
  sectionUpdateInput,
  sectionUpdateResult,
  stateInput,
  stateResult
} from "./chunk-AE3QJT4S.js";
import {
  createHostPorts
} from "./chunk-6KJUJEJW.js";
import {
  InternalError
} from "./chunk-M5XL7FMX.js";

// src/host/entrypoints/remote.ts
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

// src/shared/remote-contract.ts
var TYPERT_PACKAGE = "@knopki/dsh-prompt-profiles";
var REMOTE_NAMESPACE = "promptProfiles";
var REMOTE_SERVICE_KEY = "promptProfilesRemote";
function memoCreate(build) {
  let cached;
  return () => cached ??= build();
}
var METHOD_SPECS = [
  { method: "state", line: 115, input: () => stateInput, result: () => stateResult },
  { method: "preview", line: 134, input: () => previewInput, result: () => previewResult },
  { method: "sectionCreate", line: 147, input: () => sectionCreateInput, result: () => sectionCreateResult },
  { method: "sectionUpdate", line: 165, input: () => sectionUpdateInput, result: () => sectionUpdateResult },
  { method: "sectionDelete", line: 176, input: () => sectionDeleteInput, result: () => sectionDeleteResult },
  { method: "sectionRename", line: 183, input: () => sectionRenameInput, result: () => sectionRenameResult },
  { method: "profileCreate", line: 195, input: () => profileCreateInput, result: () => profileCreateResult },
  { method: "profileUpdate", line: 212, input: () => profileUpdateInput, result: () => profileUpdateResult },
  { method: "profileDelete", line: 223, input: () => profileDeleteInput, result: () => profileDeleteResult },
  { method: "last", line: 230, input: () => lastInput, result: () => okResult },
  { method: "defaultSet", line: 242, input: () => defaultSetInput, result: () => okResult }
];
var FACE_FILES = {
  host: "src/host/remote.ts",
  client: "src/client/remote.ts"
};
function buildRemoteDescriptors(face) {
  const file = FACE_FILES[face] ?? FACE_FILES.host;
  return METHOD_SPECS.map((spec) => ({
    id: `${TYPERT_PACKAGE}#${REMOTE_NAMESPACE}/${spec.method}`,
    service: REMOTE_SERVICE_KEY,
    namespace: REMOTE_NAMESPACE,
    method: spec.method,
    invocation: { kind: "direct" },
    parameters: [
      {
        name: "input",
        wire: "input",
        source: "json",
        codec: {
          mode: "strict",
          typeSymbol: `${TYPERT_PACKAGE}#${cap(spec.method)}Input`,
          create: memoCreate(spec.input)
        }
      }
    ],
    result: {
      mode: "strict",
      typeSymbol: `${TYPERT_PACKAGE}#${cap(spec.method)}Result`,
      create: memoCreate(spec.result)
    },
    sourceLocation: { file, line: spec.line, column: 1 }
  }));
}
function cap(name) {
  return name[0].toUpperCase() + name.slice(1);
}

// src/host/entrypoints/remote.ts
var HOST_RUNNERS = {
  state: (ops, input) => ops.state(input),
  preview: (ops, input) => ops.preview(input),
  sectionCreate: (ops, input) => ops.sectionCreate(input),
  sectionUpdate: (ops, input) => ops.sectionUpdate(input),
  sectionDelete: (ops, input) => ops.sectionDelete(input),
  sectionRename: (ops, input) => ops.sectionRename(input),
  profileCreate: (ops, input) => ops.profileCreate(input),
  profileUpdate: (ops, input) => ops.profileUpdate(input),
  profileDelete: (ops, input) => ops.profileDelete(input),
  last: (ops, input) => ops.last(input),
  defaultSet: (ops, input) => {
    const { profileId, revision } = input ?? {};
    return ops.defaultSet({ default: profileId, revision });
  }
};
function assertPlainJson(value, method, ancestors = /* @__PURE__ */ new Set()) {
  const fail = (why) => {
    throw new InternalError(`remote ${method}: result is not JSON-safe (${why})`);
  };
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("non-finite number");
    return;
  }
  if (typeof value !== "object") fail(`${typeof value} (${String(value)})`);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) fail("class instance");
  if (ancestors.has(value)) fail("cycle");
  ancestors.add(value);
  if (Array.isArray(value)) {
    if (Object.getOwnPropertySymbols(value).length > 0 || Object.keys(value).length !== value.length)
      fail("sparse or decorated array");
    for (const item of value) assertPlainJson(item, method, ancestors);
  } else {
    if (Object.getOwnPropertySymbols(value).length > 0) fail("symbol key");
    for (const item of Object.values(value)) assertPlainJson(item, method, ancestors);
  }
  ancestors.delete(value);
}
function remoteInvocations() {
  return buildRemoteDescriptors("host");
}
var PromptProfilesRemote = class extends TypertRemoteService {
  constructor(ctx, options) {
    super(ctx, REMOTE_SERVICE_KEY, { namespace: REMOTE_NAMESPACE });
    const getService = options.getService ?? ((name) => {
      try {
        return ctx.get?.(name) ?? void 0;
      } catch {
        return void 0;
      }
    });
    const { ops } = createOperations(
      createHostPorts({
        service: options.service,
        getService,
        warn: options.warn,
        log: options.log
      })
    );
    const dispatch = Object.fromEntries(METHOD_SPECS.map((spec) => [spec.method, spec]));
    const invoke = async (method, input) => {
      const value = await HOST_RUNNERS[method](ops, input);
      const result = value === void 0 ? { ok: true } : value;
      assertPlainJson(result, method);
      const parsed = dispatch[method].result().safeParse(result);
      if (!parsed.success) {
        throw new InternalError(
          `remote ${method}: result violates its strict schema (${parsed.error.issues[0]?.path?.join(".") ?? ""} ${parsed.error.issues[0]?.message ?? ""})`
        );
      }
      return parsed.data;
    };
    for (const spec of METHOD_SPECS) this[spec.method] = (input) => invoke(spec.method, input);
  }
};
function registerRemote(ctx, options) {
  const warn = options.warn ?? ((message, details) => {
    try {
      ctx.logger?.warn?.(message, details ?? "");
    } catch {
    }
  });
  const log = options.log ?? {
    warn,
    error: (message, details) => {
      try {
        if (ctx.logger?.error) ctx.logger.error(message, details ?? "");
        else if (ctx.logger?.warn) ctx.logger.warn(message, details ?? "");
        else console.error(message, details ?? "");
      } catch {
      }
    },
    info: (message, details) => {
      try {
        ctx.logger?.info?.(message, details ?? "");
      } catch {
      }
    }
  };
  const contribution = {
    package: TYPERT_PACKAGE,
    face: "host",
    schemas: [],
    invocations: remoteInvocations()
  };
  let disposeContribution = () => {
  };
  try {
    disposeContribution = ctx.typert.register(contribution) ?? (() => {
    });
  } catch (error) {
    log.error?.("prompt-profiles remote: typert contribution rejected", {
      package: TYPERT_PACKAGE,
      error: error?.message ?? String(error)
    });
    return () => {
    };
  }
  ctx.plugin(PromptProfilesRemote, {
    service: options.service,
    getService: (name) => {
      try {
        return ctx.get?.(name) ?? void 0;
      } catch {
        return void 0;
      }
    },
    warn,
    log
  });
  log.info?.("prompt-profiles remote: mounted", {
    namespace: REMOTE_NAMESPACE,
    methods: contribution.invocations.length
  });
  return () => {
    try {
      disposeContribution();
    } catch (error) {
      warn("prompt-profiles remote: contribution withdrawal failed", {
        error: error?.message ?? String(error)
      });
    }
  };
}

export {
  TYPERT_PACKAGE,
  REMOTE_NAMESPACE,
  REMOTE_SERVICE_KEY,
  remoteInvocations,
  PromptProfilesRemote,
  registerRemote
};
//# sourceMappingURL=chunk-HNJYXE4Y.js.map
