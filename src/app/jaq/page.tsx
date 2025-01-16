"use client";

import {
  FormEventHandler,
  startTransition,
  useActionState,
  useCallback,
  useState,
} from "react";
import { preload } from "react-dom";

const JAQ_WASM_HREF = new URL("./bin/jaq.wasm", import.meta.url).href;

class Exit extends Error {
  readonly code: number;

  constructor(code: number) {
    super();
    this.code = code;
  }

  static raise(code: number): never {
    throw new Exit(code);
  }
}

const SUCCESS = 0;
const EPERM = 1;
const EBADF = 9;

type Read = (buf: Uint8Array) => number;
type Write = (buf: Uint8Array) => number;

type ActionState = {
  code?: number | null;
};

type ActionInput = {
  args: string[];
  stdin: Read;
  stdout: Write;
  stderr: Write;
};

let jaqWasmBin: WebAssembly.Module | undefined;

async function action(
  _state: ActionState,
  input: ActionInput,
): Promise<ActionState> {
  jaqWasmBin ??= await WebAssembly.compileStreaming(
    fetch(JAQ_WASM_HREF, { cache: "force-cache" }),
  );

  const memory = new WebAssembly.Memory({ initial: 8192 });
  const args = ["jaq", ...input.args].map((v) =>
    new TextEncoder().encode(`${v}\0`)
  );

  const {
    exports: {
      _start,
    },
  } = new WebAssembly.Instance(jaqWasmBin, {
    env: {
      // https://lld.llvm.org/WebAssembly.html#cmdoption-import-memory
      memory,
    },
    // see https://github.com/WebAssembly/WASI/blob/main/legacy/preview1/docs.md
    wasi_snapshot_preview1: {
      proc_exit: (rval: number): never => Exit.raise(rval),

      // env: []
      environ_get: (/* environ: number, environ_buf: number */): number => {
        return EPERM;
      },
      environ_sizes_get: (environc: number, env_buf_size: number) => {
        const view = new DataView(memory.buffer);
        view.setUint32(environc, 0, true);
        view.setUint32(env_buf_size, 0, true);
        return SUCCESS;
      },

      args_get: (argv: number, arg_buf: number) => {
        const view = new DataView(memory.buffer);

        for (const arg of args) {
          view.setUint32(argv, arg_buf, true);
          argv += Uint32Array.BYTES_PER_ELEMENT;
          new Uint8Array(view.buffer, arg_buf, arg.length).set(arg);
          arg_buf += arg.length;
        }
        return SUCCESS;
      },
      args_sizes_get: (argc: number, arg_buf_size: number): number => {
        const view = new DataView(memory.buffer);
        view.setUint32(argc, args.length, true);
        view.setUint32(
          arg_buf_size,
          args.reduce((l, r) => l + r.length, 0),
          true,
        );
        return SUCCESS;
      },

      fd_read: (
        fd: number,
        iovec: number,
        iovec_len: number,
        nread: number,
      ): number => {
        if (fd !== 0) {
          return EBADF;
        }

        const view = new DataView(memory.buffer);
        let total = 0;
        for (let i = 0; i < iovec_len; i++) {
          const off = view.getUint32(iovec + (i * 8) + 0, true);
          const len = view.getUint32(iovec + (i * 8) + 4, true);
          const buf = new Uint8Array(view.buffer, off, len);

          total += input.stdin(buf);
        }
        view.setUint32(nread, total, true);
        return SUCCESS;
      },

      fd_write: (
        fd: number,
        iovec: number,
        iovec_len: number,
        nwritten: number,
      ): number => {
        let fn: Write;
        switch (fd) {
          case 1:
            fn = input.stdout;
            break;
          case 2:
            fn = input.stderr;
            break;
          default:
            return EBADF;
        }

        const view = new DataView(memory.buffer);
        let total = 0;
        for (let i = 0; i < iovec_len; i++) {
          const off = view.getUint32(iovec + (i * 8) + 0, true);
          const len = view.getUint32(iovec + (i * 8) + 4, true);
          const buf = new Uint8Array(view.buffer, off, len);

          total += fn(buf);
        }
        view.setUint32(nwritten, total, true);
        return SUCCESS;
      },

      // NOT IMPLEMENTED YET.
      random_get: () => {
        console.log("random_get");
        return -1;
      },
      clock_time_get: () => {
        console.log("clock_time_get");
        return -1;
      },
      fd_filestat_get: () => {
        console.log("fd_filestat_get");
        return -1;
      },
      path_filestat_get: () => {
        console.log("path_filestat_get");
        return -1;
      },
      path_link: () => {
        console.log("path_link");
        return -1;
      },
      path_open: () => {
        console.log("path_open");
        return -1;
      },
      path_unlink_file: () => {
        console.log("path_unlink_file");
        return -1;
      },
      fd_close: () => {
        console.log("fd_close");
        return -1;
      },
      fd_prestat_get: () => {
        console.log("fd_prestat_get");
        return -1;
      },
      fd_prestat_dir_name: () => {
        console.log("fd_prestat_dir_name");
        return -1;
      },
      path_rename: () => {
        console.log("path_rename");
        return -1;
      },
    },
  });
  if (typeof _start !== "function") {
    throw new Error();
  }

  try {
    _start();
  } catch (e) {
    if (!(e instanceof Exit)) {
      throw e;
    }

    return {
      code: e.code,
    };
  }

  return {};
}

function textread(text: string): Read {
  let b = new TextEncoder().encode(text);
  return (buf) => {
    const len = Math.min(buf.length, b.length);
    buf.set(b.subarray(b.byteOffset, b.byteOffset + len));
    b = b.subarray(b.byteOffset + len);
    return len;
  };
}

function delegatewrite(fn: (text: string) => void): Write {
  const decoder = new TextDecoder();
  return (buf) => {
    const chunk = decoder.decode(buf);
    fn(chunk);
    return buf.length;
  };
}

export default function Page(): React.ReactNode {
  preload(JAQ_WASM_HREF, { as: "fetch", crossOrigin: "anonymous" });

  const [filter, setFilter] = useState(".a[]");
  const [data, setData] = useState('{"a":[1,2,3]}');
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");
  const [state, dispatch] = useActionState(action, {});

  const handleClicked = useCallback<FormEventHandler>(
    (event) =>
      startTransition(() => {
        event.preventDefault();

        setStdout("");
        setStderr("");

        dispatch({
          args: [filter, "-r"],
          stdin: textread(data),
          stdout: delegatewrite((v) => setStdout((prev) => prev + v)),
          stderr: delegatewrite((v) => setStderr((prev) => prev + v)),
        });
      }),
    [filter, data, dispatch],
  );

  return (
    <>
      <form onSubmit={handleClicked}>
        <label>
          FILTER{" "}
          <textarea
            value={filter}
            onChange={(evt) => setFilter(evt.target.value)}
          />
        </label>
        <label>
          JSON{" "}
          <textarea
            value={data}
            onChange={(evt) => setData(evt.target.value)}
          />
        </label>
        <button>Evaluate</button>
      </form>
      {state.code && <pre>EXIT: {state.code}</pre>}
      <pre>{stdout}</pre>
      <pre>{stderr}</pre>
    </>
  );
}
