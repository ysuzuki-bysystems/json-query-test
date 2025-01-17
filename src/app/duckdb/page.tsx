"use client";

import {
  FormEventHandler,
  startTransition,
  useActionState,
  useCallback,
  useId,
  useState,
} from "react";

import type * as duckdb from "@duckdb/duckdb-wasm";
import dynamic from "next/dynamic";

function bundles(): duckdb.DuckDBBundles {
  return {
    mvp: {
      // mainModule: new URL("@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm", import.meta.url).href,
      // mainWorker: new URL('@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js', import.meta.url).href,
      // WebAssembly.Exception 未対応のブラウザは無視 (サイズを小さくしたい)
      mainModule: "about:blank",
      mainWorker: "about:blank",
    },
    eh: {
      mainModule:
        new URL("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm", import.meta.url)
          .href,
      mainWorker: new URL(
        "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js",
        import.meta.url,
      ).href,
    },
  };
}

const LazyLinkPreloads = dynamic(async () => {
  // https://github.com/vercel/next.js/issues/75021
  // serverExternalPackages に指定されているパッケージ内のJSファイルのパスを new URL(..., import.meta.url) で
  // 解決したいが、ファイルが評価されてしまい、パス解決に失敗してしまう。
  // クライアント上では動くようなので、遅延してリンクを差し込む

  function LazyLinkPreloads() {
    const {
      mainModule,
      mainWorker,
    } = bundles().eh ?? {};

    return (
      <>
        {mainModule && <link rel="prefetch" href={mainModule} />}
        {mainWorker && <link rel="prefetch" href={mainWorker} />}
        <link rel="prefetch" href="../duckdb/v1.1.1/wasm_eh/json.duckdb_extension.wasm" />
      </>
    );
  }

  return {
    default: LazyLinkPreloads,
  };
}, { ssr: false });

async function newDb(signal?: AbortSignal): Promise<duckdb.AsyncDuckDB> {
  const {
    selectBundle,
    ConsoleLogger,
    AsyncDuckDB,
  } = await import("@duckdb/duckdb-wasm");

  // Select a bundle based on browser checks
  const bundle = await selectBundle(bundles());
  signal?.throwIfAborted();

  if (bundle.mainWorker === null) {
    throw new Error("mainWorker: null");
  }

  // Instantiate the asynchronus version of DuckDB-Wasm
  const worker = new Worker(bundle.mainWorker);
  const logger = new ConsoleLogger();
  const db = new AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule);
  /*
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
  */
  // await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  return db;
}

type ActionState = undefined;

type ActionInput = {
  sql: string;
  data: string;
  onresult: (row: unknown) => void;
};

let db: duckdb.AsyncDuckDB | undefined;

async function action(
  _state: ActionState,
  input: ActionInput,
): Promise<ActionState> {
  db ??= await newDb();

  await db.registerFileText("data.json", input.data);

  const c = await db.connect();
  try {
    const loc = new URL("../duckdb", window.location.href);
    // https://duckdb.org/docs/api/wasm/extensions.html#fetching-duckdb-wasm-extensions
    // 相対パスの解決は WebWorker のコンテキストになる
    await c.query(`SET custom_extension_repository = '${loc}'`); // FIXME sanitize
    const result = await c.query(input.sql);
    for (const row of result) {
      input.onresult(row);
    }
  } finally {
    await c.close();
  }
}

function bigIntAwareReplacer(_key: string, val: unknown) {
  ((..._: unknown[]) => _)(_key); // drop

  if (typeof val === "bigint") {
    return val.toString(10);
  }

  return val;
}

export default function Page(): React.ReactNode {
  const [sql, setSql] = useState("from data.json");
  const [data, setData] = useState(JSON.stringify([
    { "col1": 1, "col2": "foo" },
    { "col1": 2, "col2": "bar" },
  ]));
  const [result, setResult] = useState("");
  const [state, dispatch, pendig] = useActionState(action, void 0);

  const handleClicked = useCallback<FormEventHandler>(
    (event) =>
      startTransition(() => {
        event.preventDefault();

        setResult("");

        dispatch({
          sql,
          data,
          onresult: (row) =>
            setResult((prev) =>
              prev + "\n" + JSON.stringify(row, bigIntAwareReplacer)
            ),
        });
      }),
    [sql, data, dispatch],
  );

  ((..._: unknown[]) => _)(state); // drop

  const sqlid = useId();
  const jsonid = useId();

  return (
    <>
      <LazyLinkPreloads />
      <form className="flex flex-col w-full" onSubmit={handleClicked}>
        <div className="grid grid-cols-2">
          <div className="flex flex-col p-2">
            <label htmlFor={sqlid}>SQL</label>
            <textarea
              id={sqlid}
              rows={5}
              value={sql}
              onChange={(evt) => setSql(evt.target.value)}
              className="font-mono p-1 rounded-md outline outline-1 outline-gray-300 focus:outline focus:outline-2 focus:outline-blue-600"
            />
          </div>
          <div className="flex flex-col p-2">
            <label htmlFor={jsonid}>JSON</label>
            <textarea
              id={jsonid}
              rows={5}
              value={data}
              onChange={(evt) => setData(evt.target.value)}
              className="font-mono p-1 rounded-md outline outline-1 outline-gray-300 focus:outline focus:outline-2 focus:outline-blue-600"
            />
          </div>
        </div>
        <div className="flex items-center justify-end">
          <button
            className="m-2 px-3 py-1 rounded-md bg-blue-600 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:invisible"
            disabled={pendig}
          >
            Evaluate
          </button>
        </div>
      </form>
      <output className="flex flex-col w-full m-4">
        <pre>{result}</pre>
      </output>
    </>
  );
}
