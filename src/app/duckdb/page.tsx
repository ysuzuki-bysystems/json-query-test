"use client";

import {
  FormEventHandler,
  startTransition,
  useActionState,
  useCallback,
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
  const [state, dispatch] = useActionState(action, void 0);

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
    [sql, data],
  );

  ((..._: unknown[]) => _)(state); // drop

  return (
    <>
      <form onSubmit={handleClicked}>
        <label>
          SQL{" "}
          <textarea value={sql} onChange={(evt) => setSql(evt.target.value)} />
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
      <output>
        <pre>{result}</pre>
      </output>
    </>
  );
}
