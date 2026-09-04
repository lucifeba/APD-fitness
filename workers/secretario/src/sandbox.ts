import baseVariant from '@jitl/quickjs-wasmfile-release-sync';
import wasmModule from '@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm';
import { newQuickJSWASMModuleFromVariant, newVariant, shouldInterruptAfterDeadline, type QuickJSWASMModule } from 'quickjs-emscripten-core';

/**
 * Sandbox de JavaScript dentro del propio Worker (QuickJS en WebAssembly): sin red, sin acceso a
 * bindings, con límite de tiempo y memoria. Permite al agente programar cálculos y transformaciones
 * que ninguna API resuelve.
 */

let modulePromise: Promise<QuickJSWASMModule> | null = null;

function quickjs(): Promise<QuickJSWASMModule> {
  modulePromise ??= newQuickJSWASMModuleFromVariant(newVariant(baseVariant, { wasmModule }));
  return modulePromise;
}

export interface RunResult {
  ok: boolean;
  result?: unknown;
  error?: unknown;
  logs: string[];
  ms: number;
}

export async function runCode(code: string, input: unknown = null, opts: { timeoutMs?: number; memoryMb?: number } = {}): Promise<RunResult> {
  const t0 = Date.now();
  const QuickJS = await quickjs();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit((opts.memoryMb ?? 48) * 1024 * 1024);
  runtime.setMaxStackSize(1024 * 1024);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + (opts.timeoutMs ?? 5000)));
  const vm = runtime.newContext();
  const logs: string[] = [];
  try {
    // console.log / console.error → trazas.
    const consoleObj = vm.newObject();
    const logFn = vm.newFunction('log', (...args) => {
      logs.push(
        args
          .map((a) => {
            const v = vm.dump(a);
            return typeof v === 'string' ? v : JSON.stringify(v);
          })
          .join(' '),
      );
      if (logs.length > 200) logs.splice(0, logs.length - 200);
    });
    vm.setProp(consoleObj, 'log', logFn);
    vm.setProp(consoleObj, 'error', logFn);
    vm.setProp(consoleObj, 'warn', logFn);
    vm.setProp(vm.global, 'console', consoleObj);
    logFn.dispose();
    consoleObj.dispose();
    // `input` con los datos de entrada.
    const inputHandle = vm.unwrapResult(vm.evalCode(`(${JSON.stringify(input ?? null)})`));
    vm.setProp(vm.global, 'input', inputHandle);
    inputHandle.dispose();

    const wrapped = `(function () {\n${code}\n})()`;
    const res = vm.evalCode(wrapped, 'run_code.js');
    if (res.error) {
      const error = vm.dump(res.error);
      res.error.dispose();
      return { ok: false, error, logs, ms: Date.now() - t0 };
    }
    const result = vm.dump(res.value);
    res.value.dispose();
    return { ok: true, result, logs, ms: Date.now() - t0 };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e), logs, ms: Date.now() - t0 };
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}
