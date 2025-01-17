"use client";

import {
  FormEventHandler,
  startTransition,
  useActionState,
  useCallback,
  useId,
  useState,
} from "react";
import type { Sqlite3Static } from "@sqlite.org/sqlite-wasm";

type ActionState = unknown;

type ActionInput = {
  sql: string;
  data: unknown[];
  onresult: (row: unknown) => void;
};

async function sqlite3InitModule(): Promise<Sqlite3Static> {
  const { default: sqlite3InitModule } = await import(
    "@sqlite.org/sqlite-wasm"
  );

  const sqlite3 = await sqlite3InitModule();
  return sqlite3;
}

let sqlite3: Sqlite3Static | undefined;

async function action(
  state: ActionState,
  input: ActionInput,
): Promise<ActionState> {
  ((..._: unknown[]) => _)(state); // drop

  sqlite3 ??= await sqlite3InitModule();

  const db = new sqlite3.oo1.DB(":memory:", "c");
  try {
    db.exec("CREATE TABLE log (data JSONB)");

    const statement = db.prepare("INSERT INTO log VALUES(?)");
    for (const data of input.data) {
      statement.bind(JSON.stringify(data)).stepReset();
    }
    statement.finalize();

    const result = db.exec(input.sql, {
      returnValue: "resultRows",
      rowMode: "object",
    });
    for (const row of result) {
      input.onresult(row);
    }

    return;
  } finally {
    db.close();
  }
}

export default function Home() {
  const [sql, setSql] = useState(
    "SELECT data->'$.col1' as col1, data->'$.col1' * 2  as col12 FROM log",
  );
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

        const json = JSON.parse(data);
        dispatch({
          sql,
          data: Array.isArray(json) ? json : [json],
          onresult: (row) =>
            setResult((prev) => prev + "\n" + JSON.stringify(row)),
        });
      }),
    [sql, data, dispatch],
  );

  ((..._: unknown[]) => _)(state); // drop

  const sqlid = useId();
  const jsonid = useId();

  return (
    <>
      <link rel="prefetch" href={new URL("@sqlite.org/sqlite-wasm/sqlite3.wasm", import.meta.url).href} />

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
