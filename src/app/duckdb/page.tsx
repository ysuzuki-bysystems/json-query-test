"use client";

import {
  FormEventHandler,
  startTransition,
  useActionState,
  useCallback,
  useId,
  useState,
} from "react";

import * as duckdb from "@duckdb/duckdb-wasm";
import { preload } from "react-dom";

async function newDb(signal?: AbortSignal): Promise<duckdb.AsyncDuckDB> {
  const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
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

  // Select a bundle based on browser checks
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  signal?.throwIfAborted();

  if (bundle.mainWorker === null) {
    throw new Error("mainWorker: null");
  }

  // Instantiate the asynchronus version of DuckDB-Wasm
  const worker = new Worker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
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

async function action(
  _state: ActionState,
  input: ActionInput,
): Promise<ActionState> {
  const db = await newDb();

  await db.registerFileText("data.json", input.data);

  const c = await db.connect();
  try {
    // https://duckdb.org/docs/api/wasm/extensions.html#fetching-duckdb-wasm-extensions
    await c.query("SET custom_extension_repository = '/duckdb'");
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
  preload(
    new URL("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm", import.meta.url).href,
    { as: "fetch", crossOrigin: "anonymous" },
  );

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
